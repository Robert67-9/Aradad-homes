import { withSupabase } from 'npm:@supabase/server';
import { jsonResponse } from '../_shared/http.ts';
import { sendBookingConfirmationEmail } from '../_shared/booking-email.ts';

export default {
  fetch: withSupabase({ auth: 'publishable' }, async (request, ctx) => {
    const origin = request.headers.get('origin');
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin);
    try {
      const input = await request.json();
      const bookingId = typeof input.bookingId === 'string' ? input.bookingId : '';
      const bookingCode = typeof input.bookingCode === 'string' ? input.bookingCode.trim().toUpperCase() : '';
      const guestEmail = typeof input.guestEmail === 'string' ? input.guestEmail.trim().toLowerCase() : '';
      if (!bookingId || !bookingCode || !guestEmail) return jsonResponse({ error: 'Reservation details are missing.' }, 400, origin);

      // The caller must prove knowledge of the full reservation triple before we
      // send mail to the guest address on file. Otherwise this endpoint is an
      // unauthenticated email relay.
      const { data: booking, error: bookingError } = await ctx.supabaseAdmin.from('bookings')
        .select('id,booking_code,guest_email,confirmation_email_sent_at,booking_status')
        .eq('id', bookingId)
        .maybeSingle();
      if (bookingError) throw new Error('Could not load this reservation.');
      if (
        !booking
        || booking.booking_code !== bookingCode
        || String(booking.guest_email).toLowerCase() !== guestEmail
      ) {
        return jsonResponse({ error: 'Reservation details could not be verified.' }, 404, origin);
      }

      // Confirmation mail is one-shot per reservation; re-invoking this public
      // endpoint must not spam the guest inbox.
      if (booking.confirmation_email_sent_at) {
        return jsonResponse({ sent: true, alreadySent: true }, 200, origin);
      }

      const result = await sendBookingConfirmationEmail(ctx.supabaseAdmin, bookingId, bookingCode, guestEmail);
      return jsonResponse(result, result.sent ? 200 : 502, origin);
    } catch (error) {
      console.error('Booking confirmation email error:', error);
      return jsonResponse({ error: error instanceof Error ? error.message : 'Booking confirmation email failed.' }, 500, origin);
    }
  }),
};
