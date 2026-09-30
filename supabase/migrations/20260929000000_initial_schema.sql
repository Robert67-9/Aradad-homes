-- Aradad Homes Supabase schema and security migration.
-- Run in the Supabase SQL Editor as the project owner. Safe to re-run.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.apartments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL,
  neighborhood TEXT NOT NULL, country TEXT NOT NULL DEFAULT 'Ghana', landmarks TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '', owner_phone TEXT NOT NULL DEFAULT '', owner_email TEXT NOT NULL DEFAULT '',
  payout_acc_name TEXT NOT NULL DEFAULT '', payout_acc_number TEXT NOT NULL DEFAULT '',
  payout_branch TEXT NOT NULL DEFAULT '', payout_swift_code TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.units (
  id TEXT PRIMARY KEY, apartment_id TEXT NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', property_type TEXT NOT NULL DEFAULT 'apartment',
  category TEXT NOT NULL DEFAULT 'apartment', bedrooms INTEGER NOT NULL DEFAULT 0, bathrooms INTEGER NOT NULL DEFAULT 0,
  max_occupancy INTEGER NOT NULL DEFAULT 1, nightly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  weekly_monthly_rate NUMERIC(10,2) NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD',
  minimum_stay INTEGER NOT NULL DEFAULT 1, maximum_stay INTEGER NOT NULL DEFAULT 365,
  cleaning_fee NUMERIC(10,2) NOT NULL DEFAULT 0, security_deposit NUMERIC(10,2) NOT NULL DEFAULT 300,
  prepaid_electricity_ghc NUMERIC(10,2) NOT NULL DEFAULT 0, check_in_time TEXT NOT NULL DEFAULT '15:00',
  check_out_time TEXT NOT NULL DEFAULT '11:00', booking_style TEXT NOT NULL DEFAULT 'instant',
  description TEXT NOT NULL DEFAULT '', amenities TEXT[] NOT NULL DEFAULT '{}',
  images TEXT[] NOT NULL DEFAULT '{}', is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.rooms (
  id TEXT PRIMARY KEY, unit_id TEXT NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  name TEXT NOT NULL, bed_type TEXT NOT NULL DEFAULT '', has_private_bath BOOLEAN NOT NULL DEFAULT true,
  has_ac BOOLEAN NOT NULL DEFAULT true, has_wardrobe BOOLEAN NOT NULL DEFAULT true, nightly_rate NUMERIC(10,2),
  weekly_rate NUMERIC(10,2), monthly_rate NUMERIC(10,2), preferred_period TEXT NOT NULL DEFAULT 'week',
  currency TEXT NOT NULL DEFAULT 'USD', max_guests INTEGER NOT NULL DEFAULT 2, description TEXT,
  images TEXT[] NOT NULL DEFAULT '{}', is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS weekly_rate NUMERIC(10,2);
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(10,2);
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS preferred_period TEXT NOT NULL DEFAULT 'week';
UPDATE public.rooms
SET weekly_rate = COALESCE(weekly_rate, ROUND(COALESCE(nightly_rate,65) * 6.5, 2)),
    monthly_rate = COALESCE(monthly_rate, ROUND(COALESCE(nightly_rate,65) * 23, 2)),
    preferred_period = CASE WHEN preferred_period IN ('week','month') THEN preferred_period ELSE 'week' END;
ALTER TABLE public.rooms ALTER COLUMN weekly_rate SET NOT NULL;
ALTER TABLE public.rooms ALTER COLUMN monthly_rate SET NOT NULL;
ALTER TABLE public.rooms ALTER COLUMN nightly_rate DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), booking_code TEXT NOT NULL UNIQUE,
  unit_id TEXT NOT NULL REFERENCES public.units(id), room_id TEXT REFERENCES public.rooms(id),
  unit_name TEXT NOT NULL, guest_name TEXT NOT NULL, guest_email TEXT NOT NULL, guest_phone TEXT NOT NULL,
  guest_count INTEGER NOT NULL DEFAULT 1, check_in_date DATE NOT NULL, check_out_date DATE NOT NULL,
  check_in_time TEXT NOT NULL DEFAULT '15:00', check_out_time TEXT NOT NULL DEFAULT '11:00',
  nights INTEGER NOT NULL, nightly_rate NUMERIC(10,2) NOT NULL, subtotal_amount NUMERIC(10,2) NOT NULL,
  security_deposit NUMERIC(10,2) NOT NULL DEFAULT 300, total_amount NUMERIC(10,2) NOT NULL,
  refunded_amount NUMERIC(10,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD', payment_preference TEXT NOT NULL, payment_gateway TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending', booking_status TEXT NOT NULL DEFAULT 'pending_approval',
  special_requests TEXT, id_document_url TEXT, guest_ip TEXT,
  payment_reference TEXT, payment_authorization_url TEXT, payment_initiated_at TIMESTAMPTZ,
  payment_hold_expires_at TIMESTAMPTZ, confirmation_email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS room_id TEXT REFERENCES public.rooms(id);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS check_in_time TEXT NOT NULL DEFAULT '15:00';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS check_out_time TEXT NOT NULL DEFAULT '11:00';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2);
UPDATE public.bookings SET refunded_amount = 0
WHERE refunded_amount IS NULL AND payment_status <> 'refunded';
ALTER TABLE public.bookings ALTER COLUMN refunded_amount SET DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass AND conname = 'bookings_refunded_amount_valid'
  ) THEN
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_refunded_amount_valid
      CHECK (
        refunded_amount IS NULL
        OR (
          refunded_amount >= 0
          AND refunded_amount <= CASE
            WHEN payment_preference = 'deposit'
              THEN round(round(subtotal_amount * 0.3, 2) + security_deposit, 2)
            ELSE total_amount
          END
        )
      );
  END IF;
END $$;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_authorization_url TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_initiated_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_hold_expires_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_payment_reference_unique_idx
  ON public.bookings(payment_reference) WHERE payment_reference IS NOT NULL;
-- Legacy four-digit references were enumerable; replace them with unguessable references.
UPDATE public.bookings
SET booking_code = 'ARD-' || upper(replace(gen_random_uuid()::TEXT, '-', ''))
WHERE booking_code !~ '^ARD-[A-F0-9]{32}$';

CREATE TABLE IF NOT EXISTS public.blocked_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), unit_id TEXT NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  start_date DATE NOT NULL, end_date DATE NOT NULL, reason TEXT NOT NULL DEFAULT 'Owner Reserved / Maintenance',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT blocked_dates_range_valid CHECK (end_date > start_date)
);
CREATE INDEX IF NOT EXISTS bookings_unit_dates_idx ON public.bookings(unit_id, check_in_date, check_out_date)
  WHERE booking_status <> 'cancelled';
CREATE INDEX IF NOT EXISTS blocked_dates_unit_dates_idx ON public.blocked_dates(unit_id, start_date, end_date);
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), unit_id TEXT NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL, guest_location TEXT NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL, comment TEXT NOT NULL, date TEXT NOT NULL, is_approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.site_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','manager','staff')),
  phone TEXT, title TEXT, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.admin_signup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.admin_signup_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.has_site_role(required_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users u
    WHERE u.user_id = (SELECT auth.uid()) AND u.is_active AND u.role = ANY(required_roles)
  );
$$;
REVOKE ALL ON FUNCTION private.has_site_role(TEXT[]) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_site_role(TEXT[]) TO anon, authenticated;

ALTER TABLE public.apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Existing permissive policies are OR-combined, so remove every policy on these tables.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT c.relname AS table_name, pol.polname AS policy_name
    FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('apartments','units','rooms','bookings','blocked_dates','reviews','site_settings','admin_users','admin_signup_requests')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policy_name, p.table_name);
  END LOOP;
END $$;

CREATE POLICY "Admins can view profiles" ON public.admin_users FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR private.has_site_role(ARRAY['admin']));
CREATE POLICY "Admins can manage profiles" ON public.admin_users FOR ALL TO authenticated
  USING (private.has_site_role(ARRAY['admin'])) WITH CHECK (private.has_site_role(ARRAY['admin']));
CREATE POLICY "Admins can review signup requests" ON public.admin_signup_requests FOR SELECT TO authenticated
  USING (private.has_site_role(ARRAY['admin']));

CREATE POLICY "Public can view active units" ON public.units FOR SELECT TO anon, authenticated
  USING (is_active OR private.has_site_role(ARRAY['admin','manager','staff']));
CREATE POLICY "Managers can manage units" ON public.units FOR ALL TO authenticated
  USING (private.has_site_role(ARRAY['admin','manager'])) WITH CHECK (private.has_site_role(ARRAY['admin','manager']));
CREATE POLICY "Public can view active rooms" ON public.rooms FOR SELECT TO anon, authenticated
  USING (is_active OR private.has_site_role(ARRAY['admin','manager','staff']));
CREATE POLICY "Managers can manage rooms" ON public.rooms FOR ALL TO authenticated
  USING (private.has_site_role(ARRAY['admin','manager'])) WITH CHECK (private.has_site_role(ARRAY['admin','manager']));

CREATE POLICY "Admins can read apartments" ON public.apartments FOR SELECT TO authenticated
  USING (private.has_site_role(ARRAY['admin']));
CREATE POLICY "Admins can manage apartments" ON public.apartments FOR ALL TO authenticated
  USING (private.has_site_role(ARRAY['admin'])) WITH CHECK (private.has_site_role(ARRAY['admin']));

CREATE POLICY "Staff can read bookings" ON public.bookings FOR SELECT TO authenticated
  USING (private.has_site_role(ARRAY['admin','manager','staff']));
CREATE POLICY "Managers can update bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (private.has_site_role(ARRAY['admin','manager'])) WITH CHECK (private.has_site_role(ARRAY['admin','manager']));
CREATE POLICY "Admins can delete bookings" ON public.bookings FOR DELETE TO authenticated
  USING (private.has_site_role(ARRAY['admin']));

CREATE POLICY "Managers can manage blocked dates" ON public.blocked_dates FOR ALL TO authenticated
  USING (private.has_site_role(ARRAY['admin','manager']))
  WITH CHECK (private.has_site_role(ARRAY['admin','manager']));
CREATE POLICY "Public can view approved reviews" ON public.reviews FOR SELECT TO anon, authenticated
  USING (is_approved OR private.has_site_role(ARRAY['admin','manager','staff']));
CREATE POLICY "Managers can manage reviews" ON public.reviews FOR ALL TO authenticated
  USING (private.has_site_role(ARRAY['admin','manager'])) WITH CHECK (private.has_site_role(ARRAY['admin','manager']));
CREATE POLICY "Public can read site settings" ON public.site_settings FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "Managers can manage site settings" ON public.site_settings FOR ALL TO authenticated
  USING (private.has_site_role(ARRAY['admin','manager'])) WITH CHECK (private.has_site_role(ARRAY['admin','manager']));

REVOKE ALL ON TABLE public.apartments, public.units, public.rooms, public.bookings,
  public.blocked_dates, public.reviews, public.site_settings, public.admin_users, public.admin_signup_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.units, public.rooms, public.reviews, public.site_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.units, public.rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.apartments, public.blocked_dates,
  public.reviews, public.admin_users TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.site_settings TO authenticated;
GRANT SELECT ON TABLE public.admin_signup_requests TO authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.bookings TO authenticated;

CREATE OR REPLACE FUNCTION public.request_admin_signup(p_full_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_email TEXT;
  v_rows INTEGER;
BEGIN
  IF v_user_id IS NULL OR p_full_name IS NULL OR length(btrim(p_full_name)) NOT BETWEEN 2 AND 120 THEN
    RETURN false;
  END IF;

  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL OR EXISTS (
    SELECT 1 FROM public.admin_users u WHERE u.user_id = v_user_id AND u.is_active
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.admin_signup_requests (user_id, email, full_name, status, created_at, reviewed_at, reviewed_by)
  VALUES (v_user_id, v_email, btrim(p_full_name), 'pending', now(), NULL, NULL)
  ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    status = 'pending',
    created_at = now(),
    reviewed_at = NULL,
    reviewed_by = NULL
  WHERE public.admin_signup_requests.user_id = EXCLUDED.user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_admin_signup(
  p_request_id UUID, p_approve BOOLEAN, p_role TEXT DEFAULT 'staff'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_request public.admin_signup_requests%ROWTYPE;
  v_auth_user auth.users%ROWTYPE;
BEGIN
  IF NOT private.has_site_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Not authorized.' USING ERRCODE = '42501';
  END IF;
  IF p_approve AND (p_role IS NULL OR p_role NOT IN ('admin','manager','staff')) THEN
    RAISE EXCEPTION 'Invalid management role.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request
  FROM public.admin_signup_requests r
  WHERE r.id = p_request_id AND r.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_approve THEN
    SELECT * INTO v_auth_user
    FROM auth.users u
    WHERE u.id = v_request.user_id
      AND lower(u.email) = v_request.email
      AND u.email_confirmed_at IS NOT NULL;
    IF NOT FOUND THEN RETURN false; END IF;

    INSERT INTO public.admin_users (user_id, email, full_name, role, is_active)
    VALUES (v_auth_user.id, v_request.email, v_request.full_name, p_role, true)
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      is_active = true;
  END IF;

  UPDATE public.admin_signup_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_at = now(), reviewed_by = (SELECT auth.uid())
  WHERE id = v_request.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.request_admin_signup(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_admin_signup(UUID,BOOLEAN,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_admin_signup(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_admin_signup(UUID,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_blocked_dates()
RETURNS TABLE(unit_id TEXT, start_date DATE, end_date DATE)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT d.unit_id, d.start_date, d.end_date
  FROM public.blocked_dates d
  JOIN public.units u ON u.id = d.unit_id AND u.is_active
  WHERE d.end_date > (now() AT TIME ZONE 'Africa/Accra')::date;
$$;
REVOKE ALL ON FUNCTION public.get_public_blocked_dates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_blocked_dates() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_guest_booking(
  p_unit_id TEXT, p_room_id TEXT, p_guest_name TEXT, p_guest_email TEXT, p_guest_phone TEXT,
  p_guest_count INTEGER, p_check_in DATE, p_check_out DATE, p_payment_preference TEXT,
  p_payment_gateway TEXT, p_special_requests TEXT DEFAULT ''
)
RETURNS public.bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_unit public.units%ROWTYPE; v_room public.rooms%ROWTYPE; v_nights INTEGER;
  v_subtotal NUMERIC(10,2); v_deposit NUMERIC(10,2); v_rate NUMERIC(10,2);
  v_currency TEXT; v_code TEXT; v_booking public.bookings%ROWTYPE;
BEGIN
  IF p_guest_name IS NULL OR length(btrim(p_guest_name)) NOT BETWEEN 2 AND 120
     OR p_guest_email IS NULL OR length(btrim(p_guest_email)) NOT BETWEEN 5 AND 254
     OR p_guest_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
     OR p_guest_phone IS NULL OR length(btrim(p_guest_phone)) NOT BETWEEN 7 AND 32
     OR p_guest_count IS NULL OR p_guest_count < 1
     OR p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in
     OR p_check_in < (now() AT TIME ZONE 'Africa/Accra')::date
     OR p_payment_preference IS NULL OR p_payment_preference NOT IN ('full','deposit','arrival')
     OR p_payment_gateway IS NULL OR p_payment_gateway NOT IN ('mobile_money','bank_transfer','paystack','cash')
     OR (p_payment_preference = 'arrival' AND p_payment_gateway <> 'cash')
     OR (p_payment_preference <> 'arrival' AND p_payment_gateway = 'cash')
     OR length(COALESCE(p_special_requests,'')) > 2000 THEN
    RAISE EXCEPTION 'Booking details are invalid.' USING ERRCODE = '22023';
  END IF;

  v_nights := p_check_out - p_check_in;
  SELECT * INTO v_unit FROM public.units u WHERE u.id = p_unit_id AND u.is_active;
  IF NOT FOUND OR p_guest_count > v_unit.max_occupancy
     OR v_nights < v_unit.minimum_stay OR v_nights > v_unit.maximum_stay THEN
    RAISE EXCEPTION 'The requested stay is invalid.' USING ERRCODE = '22023';
  END IF;

  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'Select an individual room before booking.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_room FROM public.rooms r
  WHERE r.id = p_room_id AND r.unit_id = p_unit_id AND r.is_active;
  IF NOT FOUND OR p_guest_count > v_room.max_guests OR v_room.weekly_rate <= 0 OR v_room.monthly_rate <= 0 THEN
    RAISE EXCEPTION 'The selected room is unavailable.' USING ERRCODE = '22023';
  END IF;
  IF v_room.preferred_period = 'month' THEN
    v_rate := v_room.monthly_rate;
    v_subtotal := v_rate * CEIL(v_nights::NUMERIC / 30);
  ELSE
    v_rate := v_room.weekly_rate;
    v_subtotal := v_rate * CEIL(v_nights::NUMERIC / 7);
  END IF;
  v_currency := v_room.currency;
  IF v_subtotal <= 0 OR v_subtotal > 10000000 THEN
    RAISE EXCEPTION 'The calculated stay price is invalid.' USING ERRCODE = '22023';
  END IF;
  v_deposit := GREATEST(v_unit.security_deposit, 0);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_unit_id, 0));
  UPDATE public.bookings b SET booking_status = 'cancelled'
  WHERE b.unit_id = p_unit_id AND b.payment_gateway = 'paystack' AND b.payment_status = 'pending'
    AND b.payment_hold_expires_at IS NOT NULL AND b.payment_hold_expires_at <= now()
    AND b.booking_status <> 'cancelled';

  IF EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.unit_id = p_unit_id AND b.booking_status <> 'cancelled'
      AND b.check_in_date < p_check_out AND b.check_out_date > p_check_in
      AND (b.room_id IS NULL OR p_room_id IS NULL OR b.room_id = p_room_id)
  ) OR EXISTS (
    SELECT 1 FROM public.blocked_dates d WHERE d.unit_id = p_unit_id
      AND d.start_date < p_check_out AND d.end_date > p_check_in
  ) THEN
    RAISE EXCEPTION 'Those dates are no longer available.' USING ERRCODE = '23P01';
  END IF;

  v_code := 'ARD-' || upper(replace(gen_random_uuid()::TEXT, '-', ''));
  INSERT INTO public.bookings (
    booking_code, unit_id, room_id, unit_name, guest_name, guest_email, guest_phone, guest_count,
    check_in_date, check_out_date, check_in_time, check_out_time, nights, nightly_rate, subtotal_amount, security_deposit,
    total_amount, currency, payment_preference, payment_gateway, payment_status, booking_status,
    payment_hold_expires_at, special_requests
  ) VALUES (
    v_code, p_unit_id, p_room_id,
    v_room.name || ' (' || v_unit.title || ')',
    btrim(p_guest_name), lower(btrim(p_guest_email)), btrim(p_guest_phone), p_guest_count,
    p_check_in, p_check_out, v_unit.check_in_time, v_unit.check_out_time, v_nights,
    round(v_rate,2), round(v_subtotal,2), v_deposit,
    round(v_subtotal + v_deposit,2), v_currency, p_payment_preference, p_payment_gateway, 'pending',
    CASE WHEN p_payment_preference = 'arrival' AND v_unit.booking_style = 'instant'
      THEN 'confirmed' ELSE 'pending_approval' END,
    CASE WHEN p_payment_gateway = 'paystack' THEN now() + interval '30 minutes' ELSE NULL END,
    nullif(btrim(COALESCE(p_special_requests,'')), '')
  ) RETURNING * INTO v_booking;
  RETURN v_booking;
END;
$$;

DROP FUNCTION IF EXISTS public.lookup_booking(TEXT,TEXT);
CREATE FUNCTION public.lookup_booking(p_booking_code TEXT, p_email TEXT)
RETURNS TABLE(
  id UUID, booking_code TEXT, unit_id TEXT, room_id TEXT, unit_name TEXT,
  guest_name TEXT, guest_email TEXT, guest_phone TEXT, guest_count INTEGER,
  check_in_date DATE, check_out_date DATE, check_in_time TEXT, check_out_time TEXT, nights INTEGER, nightly_rate NUMERIC,
  subtotal_amount NUMERIC, security_deposit NUMERIC, total_amount NUMERIC, refunded_amount NUMERIC,
  currency TEXT, payment_preference TEXT, payment_gateway TEXT, payment_status TEXT,
  booking_status TEXT, special_requests TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT b.id, b.booking_code, b.unit_id, b.room_id, b.unit_name, b.guest_name,
    b.guest_email, b.guest_phone, b.guest_count, b.check_in_date, b.check_out_date,
    b.check_in_time, b.check_out_time,
    b.nights, b.nightly_rate, b.subtotal_amount, b.security_deposit, b.total_amount, b.refunded_amount,
    b.currency, b.payment_preference, b.payment_gateway, b.payment_status,
    b.booking_status, b.special_requests, b.created_at
  FROM public.bookings b
  WHERE b.booking_code = upper(btrim(COALESCE(p_booking_code,'')))
    AND b.guest_email = lower(btrim(COALESCE(p_email,''))) LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.request_booking_cancellation(p_booking_code TEXT, p_email TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_id UUID;
BEGIN
  UPDATE public.bookings b SET booking_status = 'cancelled'
  WHERE b.booking_code = upper(btrim(COALESCE(p_booking_code,'')))
    AND b.guest_email = lower(btrim(COALESCE(p_email,'')))
    AND b.booking_status IN ('confirmed','pending_approval')
  RETURNING b.id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.create_guest_booking(TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,DATE,DATE,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_booking(TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_booking_cancellation(TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_booking(TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,DATE,DATE,TEXT,TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_booking(TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_booking_cancellation(TEXT,TEXT) TO anon, authenticated;

-- ==============================================================================
-- INITIAL SEED DATA FOR ARADAD HOMES
-- ==============================================================================
INSERT INTO public.apartments (
  id, name, address, city, neighborhood, country, landmarks,
  owner_name, owner_phone, owner_email,
  payout_acc_name, payout_acc_number, payout_branch, payout_swift_code
) VALUES (
  'aradad-adjiringanor',
  'Aradad Homes',
  'Nii Kwei Mensah Street',
  'Accra',
  'Adjiringanor',
  'Ghana',
  'Opposite Galaxy International School, Adjiringanor',
  'James M. Nartey',
  '+233 55 097 7992',
  'aradadhomes@gmail.com',
  'ARADAD HOMES',
  '1400011105469',
  'Osu',
  'ACCCGHAC'
) ON CONFLICT (id) DO UPDATE SET
  address = EXCLUDED.address,
  landmarks = EXCLUDED.landmarks;

INSERT INTO public.units (
  id, apartment_id, title, subtitle, property_type, category,
  bedrooms, bathrooms, max_occupancy, nightly_rate, weekly_monthly_rate,
  currency, minimum_stay, maximum_stay, cleaning_fee, security_deposit,
  prepaid_electricity_ghc, check_in_time, check_out_time, booking_style,
  description, amenities, images, is_active
) VALUES
(
  'aradad-3bed',
  'aradad-adjiringanor',
  'The Royal 3-Bedroom Luxury Apartment',
  'Three Private En-Suite Bedrooms · Expansive Living Suite · Dual Balconies',
  '3+ Bedroom Luxury Apartment',
  'apartment',
  3,
  3,
  4,
  230.00,
  3000.00,
  'USD',
  1,
  30,
  0.00,
  300.00,
  500.00,
  '15:00',
  '11:00',
  'instant',
  'Our 3-bedroom apartment offers an expanded, luxury layout designed to comfortably accommodate larger families, groups, or guests who desire extra space, privacy, and upscale comfort. Features 3 private en-suite bedrooms with individual split ACs, high-end king/queen mattresses, deep-cushioned living room with large Smart TV, full-sized dining area, fully fitted modern kitchen with double-door refrigerator, and private balconies overlooking Adjiringanor.',
  ARRAY['High-Speed Starlink Wi-Fi', '24/7 Standby Generator', 'Dedicated Water Reservoirs', 'Air Conditioning in Every Room', '24/7 Gated Security & CCTV', 'Designated On-Site Parking', 'Fully Fitted Modern Kitchen', 'Washer & Laundry Setup', 'Smart TV with Streaming', 'Private Balconies', 'Housekeeping & Fresh Linens', 'GH₵ 500 Prepaid Power Credit'],
  ARRAY['/src/assets/images/aradad_exterior_facade_1790622689884.jpg', '/src/assets/images/aradad_living_room_1790622701630.jpg', '/src/assets/images/aradad_bedroom_suite_1790622712187.jpg', '/src/assets/images/aradad_modern_kitchen_1790622722236.jpg', '/src/assets/images/aradad_balcony_view_1790622732987.jpg'],
  true
),
(
  'aradad-2bed',
  'aradad-adjiringanor',
  'The Executive 2-Bedroom Short-Let Apartment',
  'Two Private En-Suite Bedrooms · Open-Concept Living · Serene Balcony',
  '2 Bedroom Short-let Apartment',
  'apartment',
  2,
  3,
  3,
  130.00,
  2000.00,
  'USD',
  1,
  30,
  0.00,
  300.00,
  350.00,
  '15:00',
  '11:00',
  'instant',
  'Our 2-bedroom short-let apartment is designed as a modern, upscale space tailored for short stays, vacation rentals, and staycations. Fully furnished with plush double/queen beds, high-end linens, fitted wardrobes, and dedicated air-conditioning. Features an open-plan contemporary living room with ambient lighting and flat-screen smart TV, fully equipped self-catering kitchen, modern bathrooms with hot water showers, and private outdoor balcony.',
  ARRAY['High-Speed Starlink Wi-Fi', '24/7 Standby Generator', 'Dedicated Water Reservoirs', 'Air Conditioning in Every Room', '24/7 Gated Security & CCTV', 'Designated On-Site Parking', 'Fully Fitted Modern Kitchen', 'Washer & Laundry Setup', 'Smart TV with Streaming', 'Private Balcony', 'Housekeeping & Fresh Linens', 'GH₵ 350 Prepaid Power Credit'],
  ARRAY['/src/assets/images/aradad_living_room_1790622701630.jpg', '/src/assets/images/aradad_bedroom_suite_1790622712187.jpg', '/src/assets/images/aradad_modern_kitchen_1790622722236.jpg', '/src/assets/images/aradad_balcony_view_1790622732987.jpg', '/src/assets/images/aradad_exterior_facade_1790622689884.jpg'],
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.rooms (
  id, unit_id, name, bed_type, has_private_bath, has_ac, has_wardrobe,
  nightly_rate, weekly_rate, monthly_rate, preferred_period, currency,
  max_guests, description, images, is_active
) VALUES
(
  'room-3bed-master',
  'aradad-3bed',
  'Presidential Master Suite En-Suite',
  'King Bed',
  true,
  true,
  true,
  95.00,
  618.00,
  2185.00,
  'week',
  'USD',
  2,
  'Spacious master bedroom with private marble en-suite bathroom, walk-in fitted wardrobe, dedicated split air conditioning, and premium luxury king mattress.',
  ARRAY['/src/assets/images/aradad_bedroom_suite_1790622712187.jpg'],
  true
),
(
  'room-3bed-deluxe',
  'aradad-3bed',
  'Deluxe Queen En-Suite Room',
  'Queen Bed',
  true,
  true,
  true,
  80.00,
  520.00,
  1840.00,
  'week',
  'USD',
  2,
  'Private queen bedroom with en-suite shower, built-in wardrobe, individual AC, and natural sunlight.',
  ARRAY['/src/assets/images/aradad_bedroom_suite_1790622712187.jpg'],
  true
),
(
  'room-2bed-executive',
  'aradad-2bed',
  'Executive Bedroom En-Suite',
  'Queen Bed',
  true,
  true,
  true,
  75.00,
  488.00,
  1725.00,
  'week',
  'USD',
  2,
  'Contemporary bedroom in the 2-bed apartment with private en-suite bathroom, split AC, and plush linens.',
  ARRAY['/src/assets/images/aradad_bedroom_suite_1790622712187.jpg'],
  true
) ON CONFLICT (id) DO NOTHING;

-- Remove the placeholder testimonials from earlier schema versions. Only guest-submitted,
-- host-approved reviews should be available through the public reviews table.
DELETE FROM public.reviews
WHERE (unit_id = 'aradad-3bed' AND guest_name = 'Kwame Mensah'
       AND title = 'Flawless stay in Adjiringanor — uninterrupted power & fast Starlink!')
   OR (unit_id = 'aradad-2bed' AND guest_name = 'Amina & David'
       AND title = 'Peaceful, pristine, and secure gated compound');
