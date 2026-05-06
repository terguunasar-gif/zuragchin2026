/*
  # Admin RLS Policies

  ## Overview
  Adds SELECT policies so users with role='admin' can read all rows across
  key tables needed for the admin dashboard.

  ## Tables covered
  - users: admins can read all user profiles
  - albums: admins can read all albums
  - purchases: admins can read all purchases
  - wallets: admins can read all wallets
  - wallet_transactions: admins can read all wallet transactions
  - photo_uploads: admins can read all photo uploads

  ## Helper
  All policies use a common sub-select on users.role = 'admin' via auth.uid().
*/

-- users: admin read-all
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='Admins can read all users') THEN
    EXECUTE $p$
      CREATE POLICY "Admins can read all users"
        ON users FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
    $p$;
  END IF;
END $$;

-- users: admin update role/status
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='Admins can update any user') THEN
    EXECUTE $p$
      CREATE POLICY "Admins can update any user"
        ON users FOR UPDATE TO authenticated
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
        WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
    $p$;
  END IF;
END $$;

-- albums: admin read-all
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='albums' AND policyname='Admins can read all albums') THEN
    EXECUTE $p$
      CREATE POLICY "Admins can read all albums"
        ON albums FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
    $p$;
  END IF;
END $$;

-- purchases: admin read-all
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='purchases' AND policyname='Admins can read all purchases') THEN
    EXECUTE $p$
      CREATE POLICY "Admins can read all purchases"
        ON purchases FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
    $p$;
  END IF;
END $$;

-- wallets: admin read-all
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wallets' AND policyname='Admins can read all wallets') THEN
    EXECUTE $p$
      CREATE POLICY "Admins can read all wallets"
        ON wallets FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
    $p$;
  END IF;
END $$;

-- wallet_transactions: admin read-all
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wallet_transactions' AND policyname='Admins can read all wallet transactions') THEN
    EXECUTE $p$
      CREATE POLICY "Admins can read all wallet transactions"
        ON wallet_transactions FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
    $p$;
  END IF;
END $$;

-- photo_uploads: admin read-all
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='photo_uploads' AND policyname='Admins can read all photo uploads') THEN
    EXECUTE $p$
      CREATE POLICY "Admins can read all photo uploads"
        ON photo_uploads FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
    $p$;
  END IF;
END $$;

-- payout_requests: admin read-all
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payout_requests' AND policyname='Admins can read all payout requests') THEN
    EXECUTE $p$
      CREATE POLICY "Admins can read all payout requests"
        ON payout_requests FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
    $p$;
  END IF;
END $$;

-- payout_requests: admin update (approve/reject)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payout_requests' AND policyname='Admins can update payout requests') THEN
    EXECUTE $p$
      CREATE POLICY "Admins can update payout requests"
        ON payout_requests FOR UPDATE TO authenticated
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
        WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
    $p$;
  END IF;
END $$;
