import { withSupabase } from 'npm:@supabase/server';
import { jsonResponse } from '../_shared/paystack.ts';
import { sendBookingConfirmationEmail } from '../_shared/booking-email.ts';

export default {
  fetch: withSupabase({ auth: 'publishable' }, async (request, ctx) => {
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
    try {
      const input = await request.json();
      const bookingId = typeof input.bookingId === 'string' ? input.bookingId : '';
      const bookingCode = typeof input.bookingCode === 'string' ? input.bookingCode.trim().toUpperCase() : '';
      const guestEmail = typeof input.guestEmail === 'string' ? input.guestEmail.trim().toLowerCase() : '';
      if (!bookingId || !bookingCode || !guestEmail) return jsonResponse({ error: 'Reservation details are missing.' }, 400);

      const result = await sendBookingConfirmationEmail(ctx.supabaseAdmin, bookingId, bookingCode, guestEmail);
      return jsonResponse(result, result.sent ? 200 : 502);
    } catch (error) {
      console.error('Booking confirmation email error:', error);
      return jsonResponse({ error: error instanceof Error ? error.message : 'Booking confirmation email failed.' }, 500);
    }
  }),
};
