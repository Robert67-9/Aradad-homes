import {
  getAdminClient,
  getPaystackSecret,
  jsonResponse,
  paymentAmountSubunits,
  verifyAndRecordPayment,
  verifyPaystackSignature,
} from '../_shared/paystack.ts';

const refundEventStatuses: Record<string, string> = {
  'refund.pending': 'refund_pending',
  'refund.processing': 'refund_processing',
  'refund.needs-attention': 'refund_needs_attention',
  'refund.failed': 'refund_failed',
  'refund.processed': 'refunded',
};

Deno.serve(async request => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  try {
    const rawBody = await request.text();
    getPaystackSecret();
    if (!await verifyPaystackSignature(rawBody, request.headers.get('x-paystack-signature'))) {
      return jsonResponse({ error: 'Invalid Paystack signature.' }, 401);
    }
    const event = JSON.parse(rawBody);
    if (event.event === 'charge.success' && typeof event.data?.reference === 'string') {
      await verifyAndRecordPayment(event.data.reference);
    } else if (refundEventStatuses[event.event] && typeof event.data?.transaction_reference === 'string') {
      const admin = getAdminClient();
      const { data: booking, error: lookupError } = await admin.from('bookings')
        .select('id,payment_preference,payment_status,payment_reference,booking_status,currency,subtotal_amount,security_deposit,total_amount,refunded_amount')
        .eq('payment_reference', event.data.transaction_reference)
        .maybeSingle();
      if (lookupError) throw new Error('Could not find the reservation for this Paystack refund update.');

      const statusCanReceiveRefundEvent = booking && (
        booking.payment_status.startsWith('refund_')
        || (booking.payment_status === 'refunded' && booking.refunded_amount === null)
        || ['paid', 'verified'].includes(booking.payment_status)
      );
      if (booking && statusCanReceiveRefundEvent) {
        const paymentStatus = refundEventStatuses[event.event];
        const updates: Record<string, string | number> = { payment_status: paymentStatus };
        if (paymentStatus === 'refunded') {
          const amountSubunits = Number(event.data.amount);
          const expectedAmount = paymentAmountSubunits(booking);
          const refundCurrency = String(event.data.currency || '').toUpperCase();
          if (
            !Number.isSafeInteger(amountSubunits)
            || amountSubunits <= 0
            || amountSubunits > expectedAmount
            || refundCurrency !== String(booking.currency).toUpperCase()
          ) {
            throw new Error('Paystack reported a refund amount that does not match the reservation payment.');
          }
          updates.refunded_amount = Number((amountSubunits / 100).toFixed(2));
        }

        const { error: updateError } = await admin.from('bookings').update(updates)
          .eq('id', booking.id)
          .eq('payment_status', booking.payment_status);
        if (updateError) throw new Error('Could not record the Paystack refund update.');
      }
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Webhook processing failed.' }, 500);
  }
});
