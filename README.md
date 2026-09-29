# Aradad Homes

Booking website and host management portal for Aradad Homes in Adjiringanor, Accra.

## Run locally

Requirements: Node.js and npm.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and public key.
3. Start the development server with `npm run dev`.

The root `.env.local` is for the browser app and should contain only the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` settings. These values are included in the browser bundle, so use only the Supabase publishable/anon key.

For local Supabase Edge Functions, copy `supabase/functions/.env.example` to `supabase/functions/.env` and set a Paystack test secret. Supabase loads that file when you run `supabase start`. The local callback URL is set to `http://localhost:3000`, matching the Vite development server. Keep this file local; it is ignored by Git.

Without Supabase credentials, the site displays sample room listings, but reservations, staff sign-in, shared settings, and payments are unavailable.

Staff can open the OTP sign-in from a saved `/?staff=login` URL. The public navigation and footer do not show staff login links.

## Supabase setup

Run `src/lib/supabase/schema.sql` in the Supabase SQL Editor. It creates the tables, row-level security policies, booking functions, and the shared site settings store. Re-run it after schema changes; seed listings are idempotent and placeholder review data is not added.

Before staff can sign in, create and confirm the first administrator in Supabase Auth, then add that confirmed Auth user to `public.admin_users` from the SQL Editor. Replace the example email, UUID, and name with the user's actual values:

```sql
INSERT INTO public.admin_users (user_id, email, full_name, role, is_active)
SELECT id, lower(email), 'Admin Name', 'admin', true
FROM auth.users
WHERE id = 'AUTH_USER_UUID'::uuid
  AND lower(email) = lower('admin@example.com')
  AND email_confirmed_at IS NOT NULL;
```

The application intentionally has no default or public administrator account. Once the first administrator signs in, they can approve additional staff access requests in the portal.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the web deployment environment. Only a publishable/anon key belongs in the browser. Never put a Supabase service-role key or Paystack secret in a `VITE_*` variable.

Staff settings are shared through Supabase. Public visitors can read the guest-facing settings; only active administrators and managers can change them.

## Paystack checkout

Online card and Mobile Money payments are initialized and verified by Supabase Edge Functions. The Paystack secret key must stay on the server.

1. In the Supabase Dashboard's Edge Function Secrets settings, set `PAYSTACK_SECRET_KEY` and `APP_PUBLIC_URL`. Use a Paystack test secret while testing, then replace it with the live secret when the merchant account is ready. Set `APP_PUBLIC_URL` to the exact HTTPS website URL. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. Keep the production secret separate from `supabase/functions/.env`, which is for local development.
2. Deploy `paystack-initialize`, `paystack-verify`, and `paystack-webhook` from `supabase/functions` with the Supabase CLI. The included `supabase/config.toml` disables gateway JWT checks for these public endpoints; the functions validate booking identity, payment references, transaction amounts, and webhook signatures themselves.
3. In the Paystack Dashboard, set the webhook URL to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/paystack-webhook`.

Until the Supabase SQL and Edge Functions are deployed with valid Paystack credentials, checkout cannot take payments. The app reports that state and does not claim that an unpaid reservation is confirmed.

Paystack-confirmed amounts that arrive after a reservation was cancelled or its 30-minute hold expired are sent to Paystack for refund. The webhook handler tracks Paystack's refund.pending, refund.processing, refund.needs-attention, refund.failed, and refund.processed events. The admin portal and guest lookup show each refund state; a booking is marked refunded only after Paystack reports it as processed. Paystack says processed refunds can still take up to 10 business days to reach a guest.

The dashboard records the processed refund amount, including partial refunds. Issue one consolidated refund per booking; older records marked refunded before amount tracking need staff reconciliation in the booking list. If a refund needs attention, staff must provide the customer's bank details in Paystack Dashboard. If a refund fails, Paystack credits the merchant account; staff must review the payment and arrange the refund with Paystack.

For guest-requested cancellations after a successful Paystack payment, staff must issue the policy-eligible refund in the Paystack Dashboard. The webhook records completion and the refund amount. For manual-payment refunds, staff can use **Record Refund** in the booking list after confirming the amount has been returned.
