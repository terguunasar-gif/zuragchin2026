/*
  # Change users.role from text scalar to text[]

  ## Summary
  The role column is changed from a single text value to a text array so users
  can hold multiple roles simultaneously (e.g. buyer + photographer + organizer).
  'buyer' is always included.

  ## Changes

  ### 1. users table
  - Drop all RLS policies that reference role column first (they block DROP COLUMN)
  - Add new `role` text[] column via rename trick
  - Migrate existing scalar values
  - Add GIN index

  ### 2. handle_new_auth_user trigger function
  - Reads raw_user_meta_data->>'roles' as JSON array from registration
  - Falls back to single role or 'buyer'

  ### 3. All RLS policies rebuilt with 'admin' = ANY(role)

  ### 4. approve_payout updated for array role check
*/

-- ── Step 1: Drop all policies that reference the role column ─────────────────
-- (required before we can DROP COLUMN)
DROP POLICY IF EXISTS "Admins can read all users"             ON public.users;
DROP POLICY IF EXISTS "Admins can update any user"            ON public.users;
DROP POLICY IF EXISTS "Admins can read all albums"            ON public.albums;
DROP POLICY IF EXISTS "Admins can read all photo uploads"     ON public.photo_uploads;
DROP POLICY IF EXISTS "Admins can read all purchases"         ON public.purchases;
DROP POLICY IF EXISTS "Admins can read all payout requests"   ON public.payout_requests;
DROP POLICY IF EXISTS "Admins can update payout requests"     ON public.payout_requests;
DROP POLICY IF EXISTS "Admins can read platform wallet"       ON public.platform_wallet;
DROP POLICY IF EXISTS "Admins can read all wallets"           ON public.wallets;
DROP POLICY IF EXISTS "Admins can read all wallet transactions" ON public.wallet_transactions;

-- ── Step 2: Add new array column, migrate data, swap ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'roles_new'
  ) THEN
    ALTER TABLE public.users ADD COLUMN roles_new text[] NOT NULL DEFAULT '{buyer}';
  END IF;
END $$;

-- Copy existing scalar role values into the array
UPDATE public.users SET roles_new = ARRAY[role];

-- Drop old scalar column (policies referencing it are already dropped above)
ALTER TABLE public.users DROP COLUMN IF EXISTS role;

-- Rename new column to role
ALTER TABLE public.users RENAME COLUMN roles_new TO role;

-- GIN index for efficient ANY() / @> queries
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users USING GIN (role);

-- ── Step 3: Rebuild all admin RLS policies using 'admin' = ANY(role) ─────────

CREATE POLICY "Admins can read all users"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND 'admin' = ANY(u.role))
  );

CREATE POLICY "Admins can update any user"
  ON public.users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND 'admin' = ANY(u.role))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND 'admin' = ANY(u.role))
  );

CREATE POLICY "Admins can read all albums"
  ON public.albums FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND 'admin' = ANY(u.role))
  );

CREATE POLICY "Admins can read all photo uploads"
  ON public.photo_uploads FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND 'admin' = ANY(u.role))
  );

CREATE POLICY "Admins can read all purchases"
  ON public.purchases FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND 'admin' = ANY(u.role))
  );

CREATE POLICY "Admins can read all payout requests"
  ON public.payout_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND 'admin' = ANY(u.role))
  );

CREATE POLICY "Admins can update payout requests"
  ON public.payout_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND 'admin' = ANY(u.role))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND 'admin' = ANY(u.role))
  );

CREATE POLICY "Admins can read platform wallet"
  ON public.platform_wallet FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND 'admin' = ANY(users.role))
  );

CREATE POLICY "Admins can read all wallets"
  ON public.wallets FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND 'admin' = ANY(u.role))
  );

CREATE POLICY "Admins can read all wallet transactions"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND 'admin' = ANY(u.role))
  );

-- ── Step 4: Update handle_new_auth_user for text[] ────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_roles      text[];
  v_roles_json text;
BEGIN
  v_roles_json := NEW.raw_user_meta_data->>'roles';
  IF v_roles_json IS NOT NULL AND v_roles_json <> '' THEN
    BEGIN
      SELECT ARRAY(SELECT jsonb_array_elements_text(v_roles_json::jsonb))
      INTO v_roles;
    EXCEPTION WHEN OTHERS THEN
      v_roles := ARRAY[COALESCE(NEW.raw_user_meta_data->>'role', 'buyer')];
    END;
  ELSE
    v_roles := ARRAY[COALESCE(NEW.raw_user_meta_data->>'role', 'buyer')];
  END IF;

  -- Always include buyer
  IF NOT ('buyer' = ANY(v_roles)) THEN
    v_roles := v_roles || ARRAY['buyer'];
  END IF;

  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    v_roles
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── Step 5: Update approve_payout for array role check ───────────────────────
CREATE OR REPLACE FUNCTION public.approve_payout(
  p_request_id  uuid,
  p_admin_id    uuid,
  p_admin_note  text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_request     record;
  v_wallet      record;
  v_caller_role text[];
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF NOT ('admin' = ANY(v_caller_role)) THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  SELECT * INTO v_request
  FROM public.payout_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Payout request not found or already processed');
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_request.user_id
  FOR UPDATE;

  IF NOT FOUND OR v_wallet.settled_balance < v_request.amount THEN
    RETURN jsonb_build_object('error', 'Insufficient settled balance');
  END IF;

  UPDATE public.wallets
    SET settled_balance = settled_balance - v_request.amount,
        updated_at      = now()
  WHERE user_id = v_request.user_id;

  INSERT INTO public.wallet_transactions (user_id, amount, type, description)
  VALUES (
    v_request.user_id,
    v_request.amount,
    'payout',
    'Payout to ' || (v_request.bank_info->>'bank_name') || ' — ' || (v_request.bank_info->>'account_number')
  );

  UPDATE public.payout_requests
    SET status       = 'paid',
        admin_note   = p_admin_note,
        processed_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'amount', v_request.amount);
END;
$$;
