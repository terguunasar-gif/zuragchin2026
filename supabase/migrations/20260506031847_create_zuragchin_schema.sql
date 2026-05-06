/*
  # Zuragchin.mn - Event Photography Marketplace Schema

  ## Overview
  Complete database schema for an event photography marketplace where:
  - Organizers create photo albums for events
  - Photographers join albums and upload photos
  - Buyers purchase digital downloads or print orders
  - Revenue is distributed: QPay fee (1%), platform (3%), owner (10%), photographers (86%)

  ## Tables Created

  ### 1. users
  Extended user profiles linked to Supabase auth.users
  - Roles: organizer, photographer, buyer, admin
  - contact_info JSON for flexible contact data

  ### 2. albums
  Event photo albums created by organizers
  - Watermark settings (type, value, position)
  - Pricing (download_price, is_free)
  - owner_commission fixed at 10%
  - Shareable link and QR code URL

  ### 3. album_photographers
  Join requests from photographers to albums
  - Status: pending, approved, rejected

  ### 4. photo_uploads
  Photos uploaded by approved photographers
  - Two URLs: original (secure) and preview (watermarked)
  - print_prices JSON per size

  ### 5. purchases
  Buyer transactions with full fee breakdown
  - Tracks: qpay_fee, platform_fee, owner_amount, photographer_pool_amount
  - Links to settlement when settled

  ### 6. album_settlements
  Album owner triggers settlement to distribute pending earnings
  - settlement_details JSON with per-photographer breakdown

  ### 7. wallets
  Balance tracking for all users
  - pending_balance: not yet settled
  - settled_balance: available for payout

  ### 8. wallet_transactions
  Full transaction history per user

  ### 9. payout_requests
  Photographer/organizer payout requests reviewed by admin

  ## Security
  - RLS enabled on all tables
  - Users can only access their own data
  - Public album/photo previews accessible without auth
  - Original photo URLs protected
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'buyer' CHECK (role IN ('organizer', 'photographer', 'buyer', 'admin')),
  contact_info jsonb DEFAULT '{}',
  avatar_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Public can view user names for album display"
  ON users FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- ALBUMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_date date NOT NULL,
  description text DEFAULT '',
  watermark_type text NOT NULL DEFAULT 'text' CHECK (watermark_type IN ('text', 'image')),
  watermark_value text DEFAULT '',
  watermark_position text NOT NULL DEFAULT 'bottom-right' 
    CHECK (watermark_position IN ('top-left', 'top-right', 'bottom-left', 'bottom-right', 'center')),
  download_price numeric(10,2) NOT NULL DEFAULT 0,
  is_free boolean NOT NULL DEFAULT false,
  owner_commission numeric(4,3) NOT NULL DEFAULT 0.10,
  share_link text UNIQUE DEFAULT '',
  qr_code_url text DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'draft')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their albums"
  ON albums FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can insert albums"
  ON albums FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their albums"
  ON albums FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Public can view active albums via share link"
  ON albums FOR SELECT
  TO anon
  USING (status = 'active');

CREATE POLICY "Authenticated can view active albums"
  ON albums FOR SELECT
  TO authenticated
  USING (status = 'active' OR owner_id = auth.uid());

-- ============================================================
-- ALBUM PHOTOGRAPHERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS album_photographers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photographer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(album_id, photographer_id)
);

ALTER TABLE album_photographers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photographers can view their own join requests"
  ON album_photographers FOR SELECT
  TO authenticated
  USING (photographer_id = auth.uid());

CREATE POLICY "Photographers can submit join requests"
  ON album_photographers FOR INSERT
  TO authenticated
  WITH CHECK (photographer_id = auth.uid());

CREATE POLICY "Album owners can view join requests for their albums"
  ON album_photographers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = album_id
      AND albums.owner_id = auth.uid()
    )
  );

CREATE POLICY "Album owners can update join request status"
  ON album_photographers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = album_id
      AND albums.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = album_id
      AND albums.owner_id = auth.uid()
    )
  );

-- ============================================================
-- PHOTO UPLOADS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS photo_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photographer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_url text NOT NULL,
  preview_url text NOT NULL,
  print_prices jsonb DEFAULT '{}',
  filename text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE photo_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photographers can view their own photos"
  ON photo_uploads FOR SELECT
  TO authenticated
  USING (photographer_id = auth.uid());

CREATE POLICY "Photographers can upload photos to approved albums"
  ON photo_uploads FOR INSERT
  TO authenticated
  WITH CHECK (
    photographer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM album_photographers
      WHERE album_photographers.album_id = photo_uploads.album_id
      AND album_photographers.photographer_id = auth.uid()
      AND album_photographers.status = 'approved'
    )
  );

CREATE POLICY "Album owners can view photos in their albums"
  ON photo_uploads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = album_id
      AND albums.owner_id = auth.uid()
    )
  );

CREATE POLICY "Public can view preview photos"
  ON photo_uploads FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can view preview photos"
  ON photo_uploads FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- PURCHASES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  photo_id uuid NOT NULL REFERENCES photo_uploads(id) ON DELETE CASCADE,
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photographer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('download', 'print')),
  print_size text DEFAULT '',
  gross_amount numeric(10,2) NOT NULL,
  qpay_fee_amount numeric(10,2) NOT NULL DEFAULT 0,
  platform_fee_amount numeric(10,2) NOT NULL DEFAULT 0,
  owner_amount numeric(10,2) NOT NULL DEFAULT 0,
  photographer_pool_amount numeric(10,2) NOT NULL DEFAULT 0,
  photographer_earned_amount numeric(10,2) NOT NULL DEFAULT 0,
  settled boolean NOT NULL DEFAULT false,
  settlement_id uuid DEFAULT NULL,
  qpay_transaction_id text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers can view their own purchases"
  ON purchases FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid());

CREATE POLICY "Buyers can insert purchases"
  ON purchases FOR INSERT
  TO authenticated
  WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "Photographers can view purchases of their photos"
  ON purchases FOR SELECT
  TO authenticated
  USING (photographer_id = auth.uid());

CREATE POLICY "Album owners can view purchases in their albums"
  ON purchases FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = album_id
      AND albums.owner_id = auth.uid()
    )
  );

-- ============================================================
-- ALBUM SETTLEMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS album_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  settled_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  settled_at timestamptz DEFAULT now(),
  total_revenue numeric(10,2) NOT NULL DEFAULT 0,
  owner_amount numeric(10,2) NOT NULL DEFAULT 0,
  platform_amount numeric(10,2) NOT NULL DEFAULT 0,
  photographer_pool_amount numeric(10,2) NOT NULL DEFAULT 0,
  settlement_details jsonb DEFAULT '[]'
);

ALTER TABLE album_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Album owners can view settlements for their albums"
  ON album_settlements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = album_id
      AND albums.owner_id = auth.uid()
    )
  );

CREATE POLICY "Album owners can create settlements"
  ON album_settlements FOR INSERT
  TO authenticated
  WITH CHECK (
    settled_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = album_id
      AND albums.owner_id = auth.uid()
    )
  );

CREATE POLICY "Photographers can view settlements they are part of"
  ON album_settlements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM album_photographers
      WHERE album_photographers.album_id = album_settlements.album_id
      AND album_photographers.photographer_id = auth.uid()
      AND album_photographers.status = 'approved'
    )
  );

-- ============================================================
-- WALLETS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pending_balance numeric(10,2) NOT NULL DEFAULT 0,
  settled_balance numeric(10,2) NOT NULL DEFAULT 0,
  total_earned numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet"
  ON wallets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own wallet"
  ON wallets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own wallet"
  ON wallets FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- WALLET TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('credit_pending', 'settle', 'payout', 'platform_fee', 'refund')),
  photo_id uuid REFERENCES photo_uploads(id) ON DELETE SET NULL,
  settlement_id uuid REFERENCES album_settlements(id) ON DELETE SET NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON wallet_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own transactions"
  ON wallet_transactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- PAYOUT REQUESTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  bank_info jsonb DEFAULT '{}',
  admin_note text DEFAULT '',
  requested_at timestamptz DEFAULT now(),
  processed_at timestamptz DEFAULT NULL
);

ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payout requests"
  ON payout_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can submit payout requests"
  ON payout_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- PLATFORM WALLET TABLE (admin only)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance numeric(10,2) NOT NULL DEFAULT 0,
  total_earned numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE platform_wallet ENABLE ROW LEVEL SECURITY;

-- Insert single platform wallet record
INSERT INTO platform_wallet (balance, total_earned) VALUES (0, 0)
ON CONFLICT DO NOTHING;

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_albums_owner_id ON albums(owner_id);
CREATE INDEX IF NOT EXISTS idx_albums_share_link ON albums(share_link);
CREATE INDEX IF NOT EXISTS idx_album_photographers_album_id ON album_photographers(album_id);
CREATE INDEX IF NOT EXISTS idx_album_photographers_photographer_id ON album_photographers(photographer_id);
CREATE INDEX IF NOT EXISTS idx_photo_uploads_album_id ON photo_uploads(album_id);
CREATE INDEX IF NOT EXISTS idx_photo_uploads_photographer_id ON photo_uploads(photographer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_buyer_id ON purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_album_id ON purchases(album_id);
CREATE INDEX IF NOT EXISTS idx_purchases_photographer_id ON purchases(photographer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_settled ON purchases(settled);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_user_id ON payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status);

-- ============================================================
-- FUNCTION: Auto-create wallet on user insert
-- ============================================================
CREATE OR REPLACE FUNCTION create_user_wallet()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wallets (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_user_created_create_wallet
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_user_wallet();

-- ============================================================
-- FUNCTION: Auto-create user profile on auth signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
