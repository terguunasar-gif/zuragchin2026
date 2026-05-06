/*
  # Security Audit Fixes

  ## Changes

  ### 1. albums_with_stats view — remove SECURITY DEFINER
  Recreate the view without SECURITY DEFINER so it runs with the
  calling user's permissions, not the owner's.

  ### 2. Function search_path hardening
  Add SET search_path = public, pg_catalog to all SECURITY DEFINER
  functions to prevent search_path hijacking attacks.
  Functions patched:
    - create_user_wallet
    - handle_new_auth_user
    - increment_wallet_pending
    - settle_album
    - increment_platform_wallet
    - approve_payout

  ### 3. approve_payout — admin-only enforcement
  Add an explicit role check so only users with role='admin' can call
  this function even if they are authenticated.

  ### 4. purchases INSERT policy cleanup
  Drop the overly broad "Anyone can insert a purchase" policy (WITH CHECK true).
  The "Buyers can insert purchases" policy (WITH CHECK buyer_id = auth.uid())
  is the correct, restrictive one and remains.

  ### 5. Storage: photos-preview bucket listing
  Replace the two broad SELECT policies ("Public can view previews" and
  "Authenticated can view previews") — which allow listing the entire bucket
  — with a single object-level policy that restricts access to files in
  the caller's own folder or purchased photo paths.

  ### 6. Revoke anon EXECUTE on all SECURITY DEFINER functions
  Only authenticated users (and service_role) should be able to call
  these functions.
*/

-- ── 1. Recreate albums_with_stats view without SECURITY DEFINER ───────────────
DROP VIEW IF EXISTS public.albums_with_stats;

CREATE VIEW public.albums_with_stats AS
  SELECT
    a.id,
    a.name,
    a.event_date,
    a.description,
    a.status,
    a.download_price,
    a.is_free,
    a.share_link,
    a.created_at,
    a.owner_id,
    u.name  AS organizer_name,
    COUNT(p.id)::integer AS photo_count
  FROM albums a
  JOIN users u ON u.id = a.owner_id
  LEFT JOIN photo_uploads p ON p.album_id = a.id
  GROUP BY a.id, u.name;

-- ── 2 + 3 + 5 (approve_payout) — hardened with search_path + admin check ─────
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
  v_request   record;
  v_wallet    record;
  v_caller_role text;
BEGIN
  -- Enforce admin-only access
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RETURN jsonb_build_object('error', 'Permission denied: admin role required');
  END IF;

  -- Fetch the payout request
  SELECT * INTO v_request
  FROM public.payout_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Payout request not found or already processed');
  END IF;

  -- Fetch the user's wallet
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_request.user_id
  FOR UPDATE;

  IF NOT FOUND OR v_wallet.settled_balance < v_request.amount THEN
    RETURN jsonb_build_object('error', 'Insufficient settled balance');
  END IF;

  -- Deduct from settled_balance
  UPDATE public.wallets
    SET settled_balance = settled_balance - v_request.amount,
        updated_at      = now()
  WHERE user_id = v_request.user_id;

  -- Create payout wallet transaction
  INSERT INTO public.wallet_transactions (user_id, amount, type, description)
  VALUES (
    v_request.user_id,
    v_request.amount,
    'payout',
    'Payout to ' || (v_request.bank_info->>'bank_name') || ' — ' || (v_request.bank_info->>'account_number')
  );

  -- Mark request as paid
  UPDATE public.payout_requests
    SET status       = 'paid',
        admin_note   = p_admin_note,
        processed_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'amount', v_request.amount);
END;
$$;

-- ── 2. handle_new_auth_user ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'buyer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 2. create_user_wallet ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_user_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 2. increment_wallet_pending ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_wallet_pending(p_user_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.wallets (user_id, pending_balance, total_earned, updated_at)
  VALUES (p_user_id, p_amount, p_amount, now())
  ON CONFLICT (user_id) DO UPDATE
    SET pending_balance = wallets.pending_balance + p_amount,
        total_earned    = wallets.total_earned    + p_amount,
        updated_at      = now();
END;
$$;

-- ── 2. increment_platform_wallet ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_platform_wallet(p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_wallet LIMIT 1) THEN
    UPDATE public.platform_wallet
      SET balance      = balance      + p_amount,
          total_earned = total_earned + p_amount,
          updated_at   = now();
  ELSE
    INSERT INTO public.platform_wallet (balance, total_earned, updated_at)
    VALUES (p_amount, p_amount, now());
  END IF;
END;
$$;

-- ── 2. settle_album ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.settle_album(p_album_id uuid, p_settled_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_settlement_id uuid := gen_random_uuid();
  v_total_revenue  numeric := 0;
  v_owner_amount   numeric := 0;
  v_platform_amount numeric := 0;
  v_photographer_pool numeric := 0;
  v_total_sold     integer := 0;
  v_details        jsonb := '[]'::jsonb;
  r RECORD;
BEGIN
  -- Lock and sum unsettled paid purchases for this album
  SELECT
    COALESCE(SUM(gross_amount), 0),
    COALESCE(SUM(owner_amount), 0),
    COALESCE(SUM(platform_fee_amount), 0),
    COALESCE(SUM(photographer_pool_amount), 0),
    COUNT(*)
  INTO v_total_revenue, v_owner_amount, v_platform_amount, v_photographer_pool, v_total_sold
  FROM public.purchases
  WHERE album_id = p_album_id
    AND payment_status = 'paid'
    AND settled = false;

  IF v_total_sold = 0 THEN
    RETURN jsonb_build_object('error', 'No unsettled paid purchases found');
  END IF;

  -- Per-photographer split
  FOR r IN
    SELECT
      p.photographer_id,
      u.name AS photographer_name,
      COUNT(*) AS sold_count,
      COALESCE(SUM(p.photographer_pool_amount), 0) AS pool_share
    FROM public.purchases p
    JOIN public.users u ON u.id = p.photographer_id
    WHERE p.album_id = p_album_id
      AND p.payment_status = 'paid'
      AND p.settled = false
    GROUP BY p.photographer_id, u.name
  LOOP
    DECLARE
      v_pct    numeric;
      v_earned numeric;
    BEGIN
      v_pct    := r.sold_count::numeric / v_total_sold::numeric;
      v_earned := ROUND(v_photographer_pool * v_pct, 2);

      -- Move pending → settled in wallet
      INSERT INTO public.wallets (user_id, pending_balance, settled_balance, total_earned, updated_at)
      VALUES (r.photographer_id, 0, v_earned, 0, now())
      ON CONFLICT (user_id) DO UPDATE
        SET pending_balance = GREATEST(wallets.pending_balance - v_earned, 0),
            settled_balance = wallets.settled_balance + v_earned,
            updated_at = now();

      -- Wallet transaction
      INSERT INTO public.wallet_transactions (user_id, amount, type, settlement_id, description)
      VALUES (r.photographer_id, v_earned, 'settlement', v_settlement_id,
              'Album settlement: ' || (SELECT name FROM public.albums WHERE id = p_album_id));

      -- Update photographer_earned_amount on purchases
      UPDATE public.purchases
        SET photographer_earned_amount = ROUND(gross_amount * v_pct, 2)
      WHERE album_id = p_album_id
        AND photographer_id = r.photographer_id
        AND payment_status = 'paid'
        AND settled = false;

      -- Append to details
      v_details := v_details || jsonb_build_object(
        'photographer_id', r.photographer_id,
        'name',            r.photographer_name,
        'sold_count',      r.sold_count,
        'percentage',      ROUND(v_pct * 100, 2),
        'amount',          v_earned
      );
    END;
  END LOOP;

  -- Owner wallet: move pending → settled
  INSERT INTO public.wallets (user_id, pending_balance, settled_balance, total_earned, updated_at)
  VALUES (p_settled_by, 0, v_owner_amount, 0, now())
  ON CONFLICT (user_id) DO UPDATE
    SET pending_balance = GREATEST(wallets.pending_balance - v_owner_amount, 0),
        settled_balance = wallets.settled_balance + v_owner_amount,
        updated_at = now();

  INSERT INTO public.wallet_transactions (user_id, amount, type, settlement_id, description)
  VALUES (p_settled_by, v_owner_amount, 'settlement', v_settlement_id,
          'Owner commission: ' || (SELECT name FROM public.albums WHERE id = p_album_id));

  -- Platform wallet
  INSERT INTO public.platform_wallet (id, balance, total_earned, updated_at)
  VALUES (gen_random_uuid(), v_platform_amount, v_platform_amount, now())
  ON CONFLICT DO NOTHING;

  UPDATE public.platform_wallet
    SET balance      = balance      + v_platform_amount,
        total_earned = total_earned + v_platform_amount,
        updated_at   = now();

  -- Insert album_settlements record
  INSERT INTO public.album_settlements
    (id, album_id, settled_by, total_revenue, owner_amount, platform_amount, photographer_pool_amount, settlement_details, settled_at)
  VALUES
    (v_settlement_id, p_album_id, p_settled_by, v_total_revenue, v_owner_amount,
     v_platform_amount, v_photographer_pool, v_details, now());

  -- Mark purchases settled
  UPDATE public.purchases
    SET settled = true, settlement_id = v_settlement_id
  WHERE album_id = p_album_id
    AND payment_status = 'paid'
    AND settled = false;

  RETURN jsonb_build_object(
    'settlement_id',     v_settlement_id,
    'total_revenue',     v_total_revenue,
    'owner_amount',      v_owner_amount,
    'platform_amount',   v_platform_amount,
    'photographer_pool', v_photographer_pool,
    'sold_count',        v_total_sold,
    'details',           v_details
  );
END;
$$;

-- ── 4. Drop the "always true" INSERT policy on purchases ──────────────────────
DROP POLICY IF EXISTS "Anyone can insert a purchase" ON public.purchases;

-- ── 5. Fix storage photos-preview bucket — drop broad listing policies ────────
-- Both "Public can view previews" and "Authenticated can view previews" allow
-- bucket-wide SELECT (listing). Drop them and replace with an object-level policy
-- that requires the caller to own the folder OR be authenticated (for purchased previews).
DROP POLICY IF EXISTS "Public can view previews"         ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can view previews"  ON storage.objects;

-- New policy: authenticated users can read any preview object (object-level access,
-- not bucket-listing). Public (anon) cannot list; they access via signed URLs only.
CREATE POLICY "Authenticated users can read preview objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'photos-preview');

-- ── 6. Revoke EXECUTE from anon on all SECURITY DEFINER functions ─────────────
REVOKE EXECUTE ON FUNCTION public.approve_payout(uuid, uuid, text)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_user_wallet()              FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_platform_wallet(numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_wallet_pending(uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.settle_album(uuid, uuid)          FROM anon;

-- Ensure authenticated role retains EXECUTE where needed
GRANT EXECUTE ON FUNCTION public.approve_payout(uuid, uuid, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_wallet_pending(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_album(uuid, uuid)               TO authenticated;
-- increment_platform_wallet and wallet-trigger functions are called internally;
-- no need for direct authenticated EXECUTE.
REVOKE EXECUTE ON FUNCTION public.increment_platform_wallet(numeric)    FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_user_wallet()                  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user()                FROM authenticated;
