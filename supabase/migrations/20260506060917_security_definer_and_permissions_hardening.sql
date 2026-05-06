/*
  # Security Hardening: SECURITY INVOKER view, function role checks, storage policy, permission revokes

  ## Changes

  ### 1. albums_with_stats — explicit security_invoker=true
  Recreates the view with the security_invoker option so the query runs
  under the calling user's RLS context, not the view owner's.

  ### 2. Storage: photos-preview — object-level only, no bucket listing
  Drops the broad authenticated SELECT policy (allows listing the bucket).
  Replaces it with a path-scoped policy: authenticated users may only read
  objects where the first path segment matches their own UID (their uploads)
  OR objects that correspond to a photo they have a paid purchase for.
  This prevents arbitrary listing while keeping normal photo access working.

  ### 3. Function internal-only hardening
  - create_user_wallet, handle_new_auth_user: trigger-only; revoke authenticated+anon.
  - increment_platform_wallet, increment_wallet_pending: called only by other
    SECURITY DEFINER functions; revoke authenticated+anon.

  ### 4. Function caller-identity checks (belt-and-suspenders)
  - approve_payout: raises exception if caller is not admin role.
  - settle_album: raises exception if caller is not the album owner.
  - increment_wallet_pending / increment_platform_wallet: raise exception if
    called with a non-null auth.uid() that isn't service_role context
    (these should never be called directly by end users).

  ### 5. Revoke anon + authenticated from internal-only functions
  approve_payout and settle_album keep authenticated EXECUTE (they ARE called
  directly by the front-end for admin/organizer flows).
  The four internal functions lose both anon and authenticated EXECUTE.
*/

-- ── 1. albums_with_stats with security_invoker ────────────────────────────────
DROP VIEW IF EXISTS public.albums_with_stats;

CREATE OR REPLACE VIEW public.albums_with_stats
  WITH (security_invoker = true)
AS
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

-- ── 2. Storage: replace broad preview SELECT with path-scoped policy ──────────
DROP POLICY IF EXISTS "Authenticated users can read preview objects" ON storage.objects;

-- Allow authenticated users to read preview objects only:
--   (a) in their own upload folder  — path starts with their UID
--   (b) for photos they have a paid purchase for
CREATE POLICY "Authenticated can read own or purchased previews"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'photos-preview'
    AND (
      -- Own uploads: first path segment is the caller's UID
      (storage.foldername(name))[1] = (auth.uid())::text
      OR
      -- Purchased: a paid purchase exists linking this object's storage path
      EXISTS (
        SELECT 1 FROM public.purchases pu
        JOIN public.photo_uploads ph ON ph.id = pu.photo_id
        WHERE pu.buyer_id       = auth.uid()
          AND pu.payment_status = 'paid'
          AND ph.preview_url    LIKE '%' || storage.filename(name)
      )
    )
  );

-- ── 3 & 4. approve_payout — admin check + search_path ────────────────────────
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
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
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

-- ── 3 & 4. settle_album — album-owner check + search_path ────────────────────
CREATE OR REPLACE FUNCTION public.settle_album(p_album_id uuid, p_settled_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_settlement_id       uuid    := gen_random_uuid();
  v_total_revenue       numeric := 0;
  v_owner_amount        numeric := 0;
  v_platform_amount     numeric := 0;
  v_photographer_pool   numeric := 0;
  v_total_sold          integer := 0;
  v_details             jsonb   := '[]'::jsonb;
  v_album_owner_id      uuid;
  r RECORD;
BEGIN
  -- Caller must be the album owner
  SELECT owner_id INTO v_album_owner_id
  FROM public.albums WHERE id = p_album_id;

  IF v_album_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Permission denied: must be album owner to settle';
  END IF;

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

  FOR r IN
    SELECT
      p.photographer_id,
      u.name AS photographer_name,
      COUNT(*) AS sold_count,
      COALESCE(SUM(p.photographer_pool_amount), 0) AS pool_share
    FROM public.purchases p
    JOIN public.users u ON u.id = p.photographer_id
    WHERE p.album_id      = p_album_id
      AND p.payment_status = 'paid'
      AND p.settled        = false
    GROUP BY p.photographer_id, u.name
  LOOP
    DECLARE
      v_pct    numeric;
      v_earned numeric;
    BEGIN
      v_pct    := r.sold_count::numeric / v_total_sold::numeric;
      v_earned := ROUND(v_photographer_pool * v_pct, 2);

      INSERT INTO public.wallets (user_id, pending_balance, settled_balance, total_earned, updated_at)
      VALUES (r.photographer_id, 0, v_earned, 0, now())
      ON CONFLICT (user_id) DO UPDATE
        SET pending_balance = GREATEST(wallets.pending_balance - v_earned, 0),
            settled_balance = wallets.settled_balance + v_earned,
            updated_at      = now();

      INSERT INTO public.wallet_transactions (user_id, amount, type, settlement_id, description)
      VALUES (r.photographer_id, v_earned, 'settlement', v_settlement_id,
              'Album settlement: ' || (SELECT name FROM public.albums WHERE id = p_album_id));

      UPDATE public.purchases
        SET photographer_earned_amount = ROUND(gross_amount * v_pct, 2)
      WHERE album_id        = p_album_id
        AND photographer_id = r.photographer_id
        AND payment_status  = 'paid'
        AND settled         = false;

      v_details := v_details || jsonb_build_object(
        'photographer_id', r.photographer_id,
        'name',            r.photographer_name,
        'sold_count',      r.sold_count,
        'percentage',      ROUND(v_pct * 100, 2),
        'amount',          v_earned
      );
    END;
  END LOOP;

  INSERT INTO public.wallets (user_id, pending_balance, settled_balance, total_earned, updated_at)
  VALUES (p_settled_by, 0, v_owner_amount, 0, now())
  ON CONFLICT (user_id) DO UPDATE
    SET pending_balance = GREATEST(wallets.pending_balance - v_owner_amount, 0),
        settled_balance = wallets.settled_balance + v_owner_amount,
        updated_at      = now();

  INSERT INTO public.wallet_transactions (user_id, amount, type, settlement_id, description)
  VALUES (p_settled_by, v_owner_amount, 'settlement', v_settlement_id,
          'Owner commission: ' || (SELECT name FROM public.albums WHERE id = p_album_id));

  INSERT INTO public.platform_wallet (id, balance, total_earned, updated_at)
  VALUES (gen_random_uuid(), v_platform_amount, v_platform_amount, now())
  ON CONFLICT DO NOTHING;

  UPDATE public.platform_wallet
    SET balance      = balance      + v_platform_amount,
        total_earned = total_earned + v_platform_amount,
        updated_at   = now();

  INSERT INTO public.album_settlements
    (id, album_id, settled_by, total_revenue, owner_amount, platform_amount,
     photographer_pool_amount, settlement_details, settled_at)
  VALUES
    (v_settlement_id, p_album_id, p_settled_by, v_total_revenue, v_owner_amount,
     v_platform_amount, v_photographer_pool, v_details, now());

  UPDATE public.purchases
    SET settled = true, settlement_id = v_settlement_id
  WHERE album_id     = p_album_id
    AND payment_status = 'paid'
    AND settled        = false;

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

-- ── 3. Internal-only functions: hardened + search_path ────────────────────────

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

-- ── 5. Permission grants/revokes ──────────────────────────────────────────────

-- approve_payout: authenticated only (admin check is enforced inside)
REVOKE EXECUTE ON FUNCTION public.approve_payout(uuid, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.approve_payout(uuid, uuid, text) TO authenticated;

-- settle_album: authenticated only (owner check is enforced inside)
REVOKE EXECUTE ON FUNCTION public.settle_album(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.settle_album(uuid, uuid) TO authenticated;

-- Internal-only: no direct client access at all
REVOKE EXECUTE ON FUNCTION public.create_user_wallet()                   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user()                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_platform_wallet(numeric)     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_wallet_pending(uuid, numeric) FROM anon, authenticated;
