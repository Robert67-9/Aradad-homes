import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function getPaystackSecret(): string {
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) throw new Error('Paystack is not configured on the server.');
  return secret;
}

export function paymentAmountSubunits(booking: Record<string, unknown>): number {
  const preference = booking.payment_preference;
  const subtotal = Number(booking.subtotal_amount);
  const deposit = Number(booking.security_deposit);
  const total = Number(booking.total_amount);
  const amount = preference === 'deposit'
    ? Math.round((Math.round(subtotal * 0.3 * 100) / 100 + deposit) * 100)
    : preference === 'full'
      ? Math.round(total * 100)
      : 0;
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('The reservation payment amount is invalid.');
  return amount;
}

async function fetchPaystack(path: string, secret: string, init?: RequestInit) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.status) {
    console.error('Paystack API rejected request:', response.status, result?.message || 'Unknown response');
    throw new Error('Paystack could not process this request. Check the merchant configuration and try again.');
  }
  return result.data;
}

export async function initializeTransaction(payload: Record<string, unknown>, secret: string) {
  return await fetchPaystack('/transaction/initialize', secret, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

type RefundPaymentStatus =
  | 'refund_pending'
  | 'refund_processing'
  | 'refund_needs_attention'
  | 'refund_failed'
  | 'refunded';

function mapRefundStatus(status: unknown): RefundPaymentStatus {
  switch (String(status || '').toLowerCase()) {
    case 'processing': return 'refund_processing';
    case 'needs-attention': return 'refund_needs_attention';
    case 'failed': return 'refund_failed';
    case 'processed': return 'refunded';
    case 'pending':
    default: return 'refund_pending';
  }
}

async function requestPaystackRefund(
  admin: SupabaseClient,
  secret: string,
  bookingId: string,
  reference: string,
  customerNote: string,
): Promise<RefundPaymentStatus> {
  // Claim the pending payment before contacting Paystack. Webhook retries and
  // concurrent browser/webhook verification must never issue duplicate refunds.
  const { data: claimed, error: claimError } = await admin.from('bookings')
    .update({ payment_status: 'refund_pending', booking_status: 'cancelled' })
    .eq('id', bookingId)
    .eq('payment_reference', reference)
    .eq('payment_status', 'pending')
    .select('id')
    .maybeSingle();
  if (claimError) throw new Error('Could not safely queue the Paystack refund. Staff review is required.');
  if (!claimed) {
    const { data: current, error: currentError } = await admin.from('bookings')
      .select('payment_status')
      .eq('id', bookingId)
      .maybeSingle();
    if (currentError) throw new Error('Could not confirm whether the Paystack refund is already queued.');
    if (typeof current?.payment_status === 'string' && current.payment_status.startsWith('refund_')) {
      return current.payment_status as RefundPaymentStatus;
    }
    if (current?.payment_status === 'refunded') return 'refunded';
    throw new Error('The reservation payment changed before its refund could be queued.');
  }

  try {
    const refund = await fetchPaystack('/refund', secret, {
      method: 'POST',
      body: JSON.stringify({ transaction: reference, customer_note: customerNote }),
    });
    const nextStatus = mapRefundStatus(refund?.status);
    const updates: Record<string, string | number> = { payment_status: nextStatus };
    if (nextStatus === 'refunded') {
      const refundedAmountSubunits = Number(refund?.amount);
      if (!Number.isSafeInteger(refundedAmountSubunits) || refundedAmountSubunits <= 0) {
        throw new Error('Paystack reported a processed refund without a valid amount. Staff review is required.');
      }
      updates.refunded_amount = Number((refundedAmountSubunits / 100).toFixed(2));
    }
    const { error: updateError } = await admin.from('bookings').update(updates)
      .eq('id', bookingId)
      .eq('payment_reference', reference)
      .eq('payment_status', 'refund_pending');
    if (updateError) throw new Error('Paystack accepted the refund, but its status could not be recorded.');
    return nextStatus;
  } catch (error) {
    // A network failure can happen after Paystack accepted the request. Keep
    // this out of the retryable pending state to avoid sending another refund.
    const { error: attentionError } = await admin.from('bookings')
      .update({ payment_status: 'refund_needs_attention' })
      .eq('id', bookingId)
      .eq('payment_reference', reference)
      .eq('payment_status', 'refund_pending');
    if (attentionError) console.error('Could not mark Paystack refund for staff review:', attentionError);
    throw error instanceof Error
      ? error
      : new Error('Paystack refund status is unknown. Staff review is required.');
  }
}

export async function verifyAndRecordPayment(admin: SupabaseClient, reference: string) {
  const secret = getPaystackSecret();
  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .select('id,booking_code,guest_email,unit_id,payment_gateway,payment_preference,payment_status,payment_reference,payment_hold_expires_at,booking_status,currency,subtotal_amount,security_deposit,total_amount,refunded_amount')
    .eq('payment_reference', reference)
    .maybeSingle();
  if (bookingError) throw new Error('Could not look up the reservation for this payment.');
  if (!booking || booking.payment_gateway !== 'paystack') throw new Error('No reservation matches this Paystack reference.');
  if (booking.payment_status === 'refunded') {
    if (booking.refunded_amount == null) {
      return { success: false, bookingCode: booking.booking_code, error: 'This reservation has an older refund record without an amount or completion confirmation. Contact Aradad Homes.' };
    }
    return { success: false, bookingCode: booking.booking_code, error: 'Paystack has confirmed this refund as processed.' };
  }
  if (booking.payment_status.startsWith('refund_')) {
    return { success: false, bookingCode: booking.booking_code, error: 'This payment is already in Paystack refund processing. Contact Aradad Homes if you need help.' };
  }
  if (booking.payment_status === 'paid') {
    if (booking.booking_status === 'cancelled') {
      return { success: false, bookingCode: booking.booking_code, error: 'This payment is recorded, but the reservation was cancelled. Contact Aradad Homes about the refund.' };
    }
    return { success: true, bookingCode: booking.booking_code, bookingStatus: booking.booking_status };
  }

  const transaction = await fetchPaystack(`/transaction/verify/${encodeURIComponent(reference)}`, secret);
  const expectedAmount = paymentAmountSubunits(booking);
  if (transaction.status !== 'success') {
    return { success: false, bookingCode: booking.booking_code, error: 'Paystack has not confirmed a successful payment for this reservation yet.' };
  }
  const transactionMismatch = transaction.reference !== reference
    || transaction.amount !== expectedAmount
    || String(transaction.currency).toUpperCase() !== String(booking.currency).toUpperCase()
    || transaction.customer?.email?.toLowerCase() !== String(booking.guest_email).toLowerCase()
    || transaction.metadata?.booking_id !== booking.id
    || transaction.metadata?.booking_code !== booking.booking_code;
  if (transactionMismatch) {
    await requestPaystackRefund(admin, secret, booking.id, reference, 'Payment did not match the reservation details.');
    return { success: false, bookingCode: booking.booking_code, error: 'The payment did not match this reservation. Its refund is being tracked with Paystack; contact Aradad Homes if you need help.' };
  }

  const holdExpired = !booking.payment_hold_expires_at || Date.parse(booking.payment_hold_expires_at) <= Date.now();
  if (booking.booking_status === 'cancelled' || holdExpired) {
    // A late payment must not revive a cancelled room reservation.
    await requestPaystackRefund(
      admin,
      secret,
      booking.id,
      reference,
      'Reservation was cancelled or its payment hold expired before payment verification.',
    );
    return { success: false, bookingCode: booking.booking_code, error: 'This reservation was cancelled or expired. Its refund is being tracked with Paystack; contact Aradad Homes if you need help.' };
  }

  const { data: unit, error: unitError } = await admin.from('units').select('booking_style').eq('id', booking.unit_id).maybeSingle();
  if (unitError || !unit) throw new Error('Could not confirm the room booking status.');
  const nextBookingStatus = unit.booking_style === 'instant' ? 'confirmed' : 'pending_approval';
  const { data: updated, error: updateError } = await admin
    .from('bookings')
    .update({ payment_status: 'paid', booking_status: nextBookingStatus })
    .eq('id', booking.id)
    .eq('payment_reference', reference)
    .eq('payment_status', 'pending')
    .neq('booking_status', 'cancelled')
    .gt('payment_hold_expires_at', new Date().toISOString())
    .select('booking_code,booking_status')
    .maybeSingle();
  if (updateError) throw new Error('Payment was verified, but the reservation record could not be updated.');
  if (updated) return { success: true, bookingCode: updated.booking_code, bookingStatus: updated.booking_status };

  const { data: current, error: currentError } = await admin.from('bookings')
    .select('booking_code,booking_status,payment_status,payment_hold_expires_at')
    .eq('id', booking.id)
    .maybeSingle();
  if (currentError) throw new Error('The reservation changed while the payment was being verified. Contact Aradad Homes.');
  if (current?.payment_status === 'paid') {
    return { success: true, bookingCode: current.booking_code, bookingStatus: current.booking_status };
  }
  const currentHoldExpired = !current?.payment_hold_expires_at
    || Date.parse(current.payment_hold_expires_at) <= Date.now();
  if (
    current?.payment_status === 'pending'
    && (current.booking_status === 'cancelled' || currentHoldExpired)
  ) {
    await requestPaystackRefund(
      admin,
      secret,
      booking.id,
      reference,
      'Reservation was cancelled or its payment hold expired before payment verification.',
    );
    return { success: false, bookingCode: booking.booking_code, error: 'This reservation was cancelled or expired. Its refund is being tracked with Paystack; contact Aradad Homes if you need help.' };
  }
  throw new Error('The reservation changed while the payment was being verified. Contact Aradad Homes.');
}

export async function verifyPaystackSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const secret = getPaystackSecret();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const expected = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return difference === 0;
}
