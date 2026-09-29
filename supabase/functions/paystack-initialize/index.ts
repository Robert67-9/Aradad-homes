import { corsHeaders, getAdminClient, getPaystackSecret, initializeTransaction, jsonResponse, paymentAmountSubunits } from '../_shared/paystack.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  try {
    const input = await request.json();
    const bookingId = typeof input.bookingId === 'string' ? input.bookingId : '';
    const bookingCode = typeof input.bookingCode === 'string' ? input.bookingCode.trim().toUpperCase() : '';
    const guestEmail = typeof input.guestEmail === 'string' ? input.guestEmail.trim().toLowerCase() : '';
    if (!bookingId || !bookingCode || !guestEmail) return jsonResponse({ error: 'Reservation details are missing.' }, 400);

    const admin = getAdminClient();
    const { data: booking, error } = await admin.from('bookings')
      .select('id,booking_code,guest_email,unit_name,payment_gateway,payment_preference,payment_status,payment_reference,payment_authorization_url,payment_initiated_at,payment_hold_expires_at,booking_status,currency,subtotal_amount,security_deposit,total_amount')
      .eq('id', bookingId).maybeSingle();
    if (error) throw new Error('Could not load this reservation.');
    if (!booking || booking.booking_code !== bookingCode || booking.guest_email !== guestEmail) {
      return jsonResponse({ error: 'Reservation details could not be verified.' }, 404);
    }
    if (booking.payment_gateway !== 'paystack' || booking.payment_preference === 'arrival') {
      return jsonResponse({ error: 'This reservation is not set up for Paystack checkout.' }, 400);
    }
    if (booking.booking_status === 'cancelled' || booking.payment_status !== 'pending') {
      return jsonResponse({ error: 'This reservation is no longer awaiting payment.' }, 409);
    }
    if (!booking.payment_hold_expires_at || Date.parse(booking.payment_hold_expires_at) <= Date.now()) {
      await admin.from('bookings').update({ booking_status: 'cancelled' }).eq('id', booking.id).eq('payment_status', 'pending');
      return jsonResponse({ error: 'The 30-minute payment hold has expired. Please make a new reservation.' }, 409);
    }
    if (booking.payment_reference && booking.payment_authorization_url) {
      return jsonResponse({ authorizationUrl: booking.payment_authorization_url, reference: booking.payment_reference });
    }
    if (booking.payment_reference) {
      const startedAt = booking.payment_initiated_at ? Date.parse(booking.payment_initiated_at) : Date.now();
      if (Date.now() - startedAt < 90_000) {
        return jsonResponse({ error: 'Paystack checkout is still being prepared. Wait a moment, then retry.' }, 409);
      }
      const { error: clearError } = await admin.from('bookings').update({
        payment_reference: null,
        payment_authorization_url: null,
        payment_initiated_at: null,
      }).eq('id', booking.id).eq('payment_reference', booking.payment_reference).is('payment_authorization_url', null);
      if (clearError) throw new Error('Could not safely restart Paystack checkout. Contact Aradad Homes.');
    }

    const currency = String(booking.currency).toUpperCase();
    if (!['GHS', 'USD'].includes(currency)) return jsonResponse({ error: 'Paystack checkout is only enabled for GHS and USD room prices.' }, 400);
    const amount = paymentAmountSubunits(booking);
    const reference = `ARDPAY-${crypto.randomUUID()}`;
    const appUrl = Deno.env.get('APP_PUBLIC_URL') || Deno.env.get('APP_URL');
    if (!appUrl) throw new Error('The public website URL is not configured for payment return.');
    let callback: URL;
    try {
      callback = new URL(appUrl);
    } catch {
      throw new Error('The public website URL is invalid.');
    }
    const isLocalHttp = callback.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
    if ((!isLocalHttp && callback.protocol !== 'https:') || callback.username || callback.password) {
      throw new Error('The public website URL must use HTTPS and cannot contain credentials.');
    }
    callback.searchParams.set('paystack', 'return');
    const data = await initializeTransaction({
      email: booking.guest_email,
      amount,
      currency,
      reference,
      callback_url: callback.toString(),
      metadata: {
        booking_id: booking.id,
        booking_code: booking.booking_code,
        payment_preference: booking.payment_preference,
      },
    }, getPaystackSecret());

    if (!data?.authorization_url || data.reference !== reference) throw new Error('Paystack did not return a valid checkout link.');
    const { data: savedBooking, error: saveError } = await admin.from('bookings').update({
      payment_reference: reference,
      payment_authorization_url: data.authorization_url,
      payment_initiated_at: new Date().toISOString(),
    }).eq('id', booking.id).eq('payment_status', 'pending').neq('booking_status', 'cancelled')
      .is('payment_reference', null).gt('payment_hold_expires_at', new Date().toISOString()).select('id').maybeSingle();
    if (saveError) throw new Error('Could not save the Paystack reference to this reservation.');
    if (!savedBooking) {
      const { data: current } = await admin.from('bookings')
        .select('payment_reference,payment_authorization_url,booking_status,payment_status')
        .eq('id', booking.id).maybeSingle();
      if (current?.payment_reference && current.payment_authorization_url && current.booking_status !== 'cancelled' && current.payment_status === 'pending') {
        return jsonResponse({ authorizationUrl: current.payment_authorization_url, reference: current.payment_reference });
      }
      return jsonResponse({ error: 'The reservation changed while checkout was being started. Retry or make a new reservation.' }, 409);
    }
    return jsonResponse({ authorizationUrl: data.authorization_url, reference });
  } catch (error) {
    console.error('Paystack initialization error:', error);
    const message = error instanceof Error ? error.message : 'Paystack checkout could not be started.';
    return jsonResponse({ error: message }, 500);
  }
});
