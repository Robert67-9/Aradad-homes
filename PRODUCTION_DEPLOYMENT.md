# Production deployment

This is a Vite/React website backed by Supabase. Supabase hosts the database, authentication, and Edge Functions; deploy the static website to a frontend host such as Vercel.

## Deploy the Supabase backend

The initial database schema is tracked at `supabase/migrations/20260929000000_initial_schema.sql`. It mirrors `src/lib/supabase/schema.sql`, which the host portal can also display for manual setup. Keep the two files in sync when changing the schema.

From the repository root, install and authenticate the Supabase CLI, link the production project, and apply the migration:

```powershell
npm install --save-dev supabase
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

Set these two secrets in the Supabase Dashboard under **Edge Function Secrets**:

- `PAYSTACK_SECRET_KEY`: start with the Paystack test key.
- `APP_PUBLIC_URL`: the exact HTTPS URL of the deployed website.

Supabase supplies the Edge Functions' own Supabase credentials. Do not copy a Supabase secret key into the website environment or a `VITE_` variable.

Deploy the payment functions:

```powershell
npx supabase functions deploy paystack-initialize
npx supabase functions deploy paystack-verify
npx supabase functions deploy paystack-webhook
```

The initialize and verify functions accept the browser's publishable key and perform reservation/payment checks server-side. The webhook verifies Paystack's signature before recording events. Their `verify_jwt = false` configuration is in `supabase/config.toml`.

## Deploy the website

Import the repository into Vercel and set the build command to `npm run build` and output directory to `dist`. Add these build-time environment variables in the hosting provider:

```text
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY>
```

`VITE_SUPABASE_ANON_KEY` accepts a Supabase publishable key (`sb_publishable_...`) or legacy anon public key. It must never contain a secret key. Redeploy after adding or changing environment variables.

In Supabase **Authentication → URL Configuration**, set the production website as the Site URL and add its URL to Redirect URLs. In Paystack, configure the webhook URL as:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/paystack-webhook
```

Management users sign in with email and password. New staff create a password when requesting access, then verify their email by one-time code before an administrator can approve them. Configure a custom SMTP provider in Supabase Auth for email verification; Supabase's built-in email service is limited to team addresses and currently allows only two emails per hour. See the [custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).

Create the first administrator in Supabase Auth with a password, then add that user's ID and email to `public.admin_users` using the SQL example in `README.md`. Verify bookings and password sign-in on the deployed site. Test Paystack checkout with test credentials before switching to live credentials.
