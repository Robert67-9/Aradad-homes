# Aradad Homes

Booking website and host management portal for Aradad Homes in Adjiringanor, Accra.

## Run locally

Requirements: Node.js and npm.

1. Install dependencies with `npm install`.
2. Create `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Use the project URL and a publishable/anon key only.
3. Start the development server with `npm run dev`.

The root `.env.local` is for the browser app and should contain only the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` settings. These values are included in the browser bundle, so use only the Supabase publishable/anon key.

For local Supabase Edge Functions, create `supabase/functions/.env` with `APP_PUBLIC_URL=http://localhost:3000` and the Resend email settings. Supabase loads that file when you run `supabase start`. Keep this file local; it is ignored by Git.

Without Supabase credentials, the site displays sample room listings, but reservations, staff sign-in, and shared settings are unavailable.

Staff can open the OTP sign-in from a saved `/?staff=login` URL. The public navigation and footer do not show staff login links.

## Supabase setup

For production deployment commands, see [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md).

For a new production database, apply the tracked migration using the CLI flow in `PRODUCTION_DEPLOYMENT.md`. The SQL at `src/lib/supabase/schema.sql` mirrors that migration for reference; do not apply both paths to the same database. Keep the SQL and migration files in sync when changing the schema.

Before staff can sign in, create and confirm the first administrator in Supabase Auth, then add that confirmed Auth user to `public.admin_users` from the SQL Editor. Replace the example email, UUID, and name with the user's actual values:

```sql
INSERT INTO public.admin_users (user_id, email, full_name, role, is_active)
SELECT id, lower(email), 'Admin Name', 'admin', true
FROM auth.users
WHERE id = 'AUTH_USER_UUID'::uuid
  AND lower(email) = lower('admin@example.com')
  AND email_confirmed_at IS NOT NULL;
```

The application intentionally has no default or public administrator account. Once the first administrator signs in, they can create management accounts, set roles, edit staff profiles, disable access, change their own profile and password, and approve verified access requests in the portal. Directly created accounts receive a temporary password from the administrator and should change it after their first sign-in.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the web deployment environment. Only a publishable/anon key belongs in the browser. Never put a Supabase service-role key in a `VITE_*` variable.

Staff settings are shared through Supabase. Public visitors can read the guest-facing settings; only active administrators and managers can change them.

## Payments

Payments are collected manually — Mobile Money, bank transfer, or cash on arrival. Staff verify each transfer in the admin portal with **Verify Pay**, and record refunds with **Record Refund** after confirming the amount has been returned. No online payment gateway is connected.
