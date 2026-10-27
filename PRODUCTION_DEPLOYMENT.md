# Production deployment

This is a Vite/React website backed by Supabase. Supabase hosts the database, authentication, and Edge Functions; deploy the static website to a frontend host such as Vercel.

## Deploy the Supabase backend

The initial database schema is tracked at `supabase/migrations/20260929000000_initial_schema.sql`. It mirrors `src/lib/supabase/schema.sql`. Keep the two files in sync when changing the schema.

From the repository root, install and authenticate the Supabase CLI, link the production project, and apply the migration:

```powershell
npm install --save-dev supabase
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

Set these two secrets in the Supabase Dashboard under **Edge Function Secrets**:

- `APP_PUBLIC_URL`: the exact HTTPS URL of the deployed website.
- `RESEND_API_KEY`: the Resend API key used for guest booking emails.
- `RESEND_FROM_EMAIL`: a verified Resend sender, such as `Aradad Homes <bookings@your-domain.com>`.

Supabase supplies the Edge Functions' own Supabase credentials. Do not copy a Supabase secret key into the website environment or a `VITE_` variable.

Deploy the Edge Functions:

```powershell
npx supabase functions deploy booking-confirmation
```

The booking-confirmation function accepts the browser's publishable key and validates the reservation server-side. Its `verify_jwt = false` configuration is in `supabase/config.toml`.

## Deploy the website

Import the repository into Vercel and set the build command to `npm run build` and output directory to `dist`. Add these build-time environment variables in the hosting provider:

```text
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY>
```

`VITE_SUPABASE_ANON_KEY` accepts a Supabase publishable key (`sb_publishable_...`) or legacy anon public key. It must never contain a secret key. Redeploy after adding or changing environment variables.

The project URL and publishable/anon key are public client configuration and will be visible to browsers; database access must be secured with Row Level Security policies. The website no longer accepts Supabase credentials from browser storage or exposes connection settings in the host portal. Never put a Supabase secret/service-role key in website code, browser storage, or any `VITE_` variable. Apply schema changes through the tracked migrations and Supabase CLI.

In Supabase **Authentication → URL Configuration**, set the production website as the Site URL and add its URL to Redirect URLs.
Management users sign in with email and password. Administrators can create accounts directly with a temporary password, manage roles and profiles, disable access, and approve verified access requests. Share temporary passwords securely and have users change them after their first sign-in. Staff can also request access themselves, verify their email by one-time code, and wait for administrator approval. Configure a custom SMTP provider in Supabase Auth for email verification; Supabase's built-in email service is limited to team addresses and currently allows only two emails per hour. See the [custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).

Create the first administrator in Supabase Auth with a password, then add that user's ID and email to `public.admin_users` using the SQL example in `README.md`. Verify bookings and password sign-in on the deployed site. Payments are collected manually (Mobile Money, bank transfer, or on arrival), so staff verify each transfer in the admin portal.
