import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatAmount(amount: unknown, currency: unknown): string {
  const numericAmount = Number(amount);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'USD'),
      minimumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return `${String(currency || 'USD')} ${numericAmount.toFixed(2)}`;
  }
}

export async function sendBookingConfirmationEmail(
  admin: SupabaseClient,
  bookingId: string,
  bookingCode: string,
  guestEmail: string,
): Promise<{ sent: boolean; error?: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');
  if (!resendApiKey || !fromEmail) {
    console.warn('Booking email skipped: RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.');
    return { sent: false, error: 'Email delivery is not configured.' };
  }

  const { data: booking, error: bookingError } = await admin.from('bookings')
    .select('id,booking_code,guest_email,guest_name,guest_phone,guest_count,unit_name,check_in_date,check_out_date,nights,subtotal_amount,security_deposit,total_amount,currency,payment_preference,payment_status,booking_status,confirmation_email_sent_at')
    .eq('id', bookingId)
    .eq('booking_code', bookingCode)
    .eq('guest_email', guestEmail.toLowerCase())
    .maybeSingle();
  if (bookingError) return { sent: false, error: 'Could not load the reservation for email delivery.' };
  if (!booking) return { sent: false, error: 'Reservation details could not be verified.' };
  if (booking.confirmation_email_sent_at) return { sent: true };

  const statusText = booking.booking_status === 'confirmed'
    ? 'Your reservation is confirmed.'
    : 'Your reservation request has been received and is awaiting host approval.';
  const subject = `Aradad Homes booking confirmation - ${booking.booking_code}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#292524;max-width:620px;margin:auto">
      <h1 style="color:#78350f">Aradad Homes</h1>
      <p>Dear ${escapeHtml(booking.guest_name)},</p>
      <p>${escapeHtml(statusText)}</p>
      <div style="border:1px solid #d6d3d1;border-radius:10px;padding:18px;background:#fafaf9">
        <p><strong>Booking code:</strong> ${escapeHtml(booking.booking_code)}</p>
        <p><strong>Accommodation:</strong> ${escapeHtml(booking.unit_name)}</p>
        <p><strong>Check-in:</strong> ${escapeHtml(booking.check_in_date)}</p>
        <p><strong>Check-out:</strong> ${escapeHtml(booking.check_out_date)}</p>
        <p><strong>Guests:</strong> ${escapeHtml(booking.guest_count)}</p>
        <p><strong>Payment status:</strong> ${escapeHtml(booking.payment_status)}</p>
        <p><strong>Reservation total:</strong> ${escapeHtml(formatAmount(booking.total_amount, booking.currency))}</p>
      </div>
      <p>Keep your booking code for future questions or reservation lookup.</p>
      <p>Aradad Homes<br>${escapeHtml(Deno.env.get('APP_PUBLIC_URL') || '')}</p>
    </div>`;
  const text = `Aradad Homes\n\nDear ${booking.guest_name},\n\n${statusText}\n\nBooking code: ${booking.booking_code}\nAccommodation: ${booking.unit_name}\nCheck-in: ${booking.check_in_date}\nCheck-out: ${booking.check_out_date}\nGuests: ${booking.guest_count}\nPayment status: ${booking.payment_status}\nReservation total: ${formatAmount(booking.total_amount, booking.currency)}\n\nKeep your booking code for future questions or reservation lookup.`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromEmail, to: [booking.guest_email], subject, html, text }),
  });
  if (!response.ok) {
    console.error('Resend rejected booking email:', response.status, await response.text());
    return { sent: false, error: 'Email provider rejected the message.' };
  }

  const { error: markError } = await admin.from('bookings')
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq('id', booking.id)
    .is('confirmation_email_sent_at', null);
  if (markError) console.error('Booking email sent but could not be marked as sent:', markError);
  return { sent: true };
}
