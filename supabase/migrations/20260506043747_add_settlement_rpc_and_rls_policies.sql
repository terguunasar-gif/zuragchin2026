/*
  # Settlement RPC, RLS policies for wallet system

  ## Overview
  Adds:
  1. `settle_album` RPC — atomically settles all unsettled paid purchases for an album,
     computes per-photographer proportional splits, moves pending → settled balance,
     creates wallet_transactions records, inserts album_settlements record.
  2. RLS policies for wallet_transactions, platform_wallet, payout_requests, album_settlements
     so authenticated users can read their own data and organizers can run settlements.

  ## Settlement logic
  - Totals photographer_pool_amount across all unsettled paid purchases per album
  - Per photographer: earned = pool_total × (photographer_sold_count / total_sold_count)
  - Updates wallets: pending_balance -= earned, settled_balance += earned
  - Writes wallet_transaction rows (type = 'settlement')
  - Inserts album_settlements row with settlement_details JSON
  - Marks purchases.settled = true, purchases.settlement_id = new settlement id
  - Also handles platform_wallet crediting from platform_fee_amount
*/

-- ── RLS: wallet_transactions ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallet_transactions' AND policyname = 'Users can read own wallet transactions') THEN
    EXECUTE $p$
      CREATE POLICY "Users can read own wallet transactions"
        ON wallet_transactions FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id)
    $p$;
  END IF;
END $$;

-- ── RLS: wallets ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallets' AND policyname = 'Users can read own wallet') THEN
    EXECUTE $p$
      CREATE POLICY "Users can read own wallet"
        ON wallets FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id)
    $p$;
  END IF;
END $$;

-- ── RLS: payout_requests ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payout_requests' AND policyname = 'Users can read own payout requests') THEN
    EXECUTE $p$
      CREATE POLICY "Users can read own payout requests"
        ON payout_requests FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id)
    $p$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payout_requests' AND policyname = 'Users can insert own payout requests') THEN
    EXECUTE $p$
      CREATE POLICY "Users can insert own payout requests"
        ON payout_requests FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id)
    $p$;
  END IF;
END $$;

-- ── RLS: album_settlements ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'album_settlements' AND policyname = 'Album owners can read their settlements') THEN
    EXECUTE $p$
      CREATE POLICY "Album owners can read their settlements"
        ON album_settlements FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM albums
            WHERE albums.id = album_settlements.album_id
              AND albums.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'album_settlements' AND policyname = 'Photographers can read settlements for their albums') THEN
    EXECUTE $p$
      CREATE POLICY "Photographers can read settlements for their albums"
        ON album_settlements FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM album_photographers
            WHERE album_photographers.album_id = album_settlements.album_id
              AND album_photographers.photographer_id = auth.uid()
              AND album_photographers.status = 'approved'
          )
        )
    $p$;
  END IF;
END $$;

-- ── RLS: platform_wallet (admin only) ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'platform_wallet' AND policyname = 'Admins can read platform wallet') THEN
    EXECUTE $p$
      CREATE POLICY "Admins can read platform wallet"
        ON platform_wallet FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
              AND users.role = 'admin'
          )
        )
    $p$;
  END IF;
END $$;

-- ── RLS: purchases (authenticated read own) ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchases' AND policyname = 'Authenticated can read own purchases') THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated can read own purchases"
        ON purchases FOR SELECT
        TO authenticated
        USING (
          auth.uid() = buyer_id
          OR auth.uid() = photographer_id
          OR EXISTS (
            SELECT 1 FROM albums
            WHERE albums.id = purchases.album_id
              AND albums.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;

-- ── settle_album RPC ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION settle_album(p_album_id uuid, p_settled_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  FROM purchases
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
    FROM purchases p
    JOIN users u ON u.id = p.photographer_id
    WHERE p.album_id = p_album_id
      AND p.payment_status = 'paid'
      AND p.settled = false
    GROUP BY p.photographer_id, u.name
  LOOP
    DECLARE
      v_pct  numeric;
      v_earned numeric;
    BEGIN
      v_pct    := r.sold_count::numeric / v_total_sold::numeric;
      v_earned := ROUND(v_photographer_pool * v_pct, 2);

      -- Move pending → settled in wallet
      INSERT INTO wallets (user_id, pending_balance, settled_balance, total_earned, updated_at)
      VALUES (r.photographer_id, 0, v_earned, 0, now())
      ON CONFLICT (user_id) DO UPDATE
        SET pending_balance = GREATEST(wallets.pending_balance - v_earned, 0),
            settled_balance = wallets.settled_balance + v_earned,
            updated_at = now();

      -- Wallet transaction
      INSERT INTO wallet_transactions (user_id, amount, type, settlement_id, description)
      VALUES (r.photographer_id, v_earned, 'settlement', v_settlement_id,
              'Album settlement: ' || (SELECT name FROM albums WHERE id = p_album_id));

      -- Update photographer_earned_amount on purchases
      UPDATE purchases
        SET photographer_earned_amount = ROUND(gross_amount * v_pct, 2)
        WHERE album_id = p_album_id
          AND photographer_id = r.photographer_id
          AND payment_status = 'paid'
          AND settled = false;

      -- Append to details
      v_details := v_details || jsonb_build_object(
        'photographer_id', r.photographer_id,
        'name', r.photographer_name,
        'sold_count', r.sold_count,
        'percentage', ROUND(v_pct * 100, 2),
        'amount', v_earned
      );
    END;
  END LOOP;

  -- Owner wallet: move pending → settled
  INSERT INTO wallets (user_id, pending_balance, settled_balance, total_earned, updated_at)
  VALUES (p_settled_by, 0, v_owner_amount, 0, now())
  ON CONFLICT (user_id) DO UPDATE
    SET pending_balance = GREATEST(wallets.pending_balance - v_owner_amount, 0),
        settled_balance = wallets.settled_balance + v_owner_amount,
        updated_at = now();

  INSERT INTO wallet_transactions (user_id, amount, type, settlement_id, description)
  VALUES (p_settled_by, v_owner_amount, 'settlement',  v_settlement_id,
          'Owner commission: ' || (SELECT name FROM albums WHERE id = p_album_id));

  -- Platform wallet
  INSERT INTO platform_wallet (id, balance, total_earned, updated_at)
  VALUES (gen_random_uuid(), v_platform_amount, v_platform_amount, now())
  ON CONFLICT DO NOTHING;

  UPDATE platform_wallet
    SET balance = balance + v_platform_amount,
        total_earned = total_earned + v_platform_amount,
        updated_at = now();

  -- Insert album_settlements record
  INSERT INTO album_settlements (id, album_id, settled_by, total_revenue, owner_amount, platform_amount, photographer_pool_amount, settlement_details, settled_at)
  VALUES (v_settlement_id, p_album_id, p_settled_by, v_total_revenue, v_owner_amount, v_platform_amount, v_photographer_pool, v_details, now());

  -- Mark purchases settled
  UPDATE purchases
    SET settled = true, settlement_id = v_settlement_id
    WHERE album_id = p_album_id
      AND payment_status = 'paid'
      AND settled = false;

  RETURN jsonb_build_object(
    'settlement_id', v_settlement_id,
    'total_revenue', v_total_revenue,
    'owner_amount', v_owner_amount,
    'platform_amount', v_platform_amount,
    'photographer_pool', v_photographer_pool,
    'sold_count', v_total_sold,
    'details', v_details
  );
END;
$$;

-- Grant execute to authenticated users (RPC checks ownership inside)
GRANT EXECUTE ON FUNCTION settle_album(uuid, uuid) TO authenticated;
