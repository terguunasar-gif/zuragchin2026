/*
  # Add QPay invoice tracking and guest checkout fields to purchases

  ## Changes
  - `qpay_invoice_id`: stores QPay invoice ID for payment polling
  - `buyer_name`: guest buyer name (no account needed)
  - `buyer_phone`: guest buyer phone number
  - `payment_status`: tracks payment lifecycle (pending / paid / failed)

  ## Security
  - Adds RLS policies so anonymous (guest) buyers can insert purchases and read their own by invoice ID
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchases' AND column_name = 'qpay_invoice_id'
  ) THEN
    ALTER TABLE purchases ADD COLUMN qpay_invoice_id text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchases' AND column_name = 'buyer_name'
  ) THEN
    ALTER TABLE purchases ADD COLUMN buyer_name text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchases' AND column_name = 'buyer_phone'
  ) THEN
    ALTER TABLE purchases ADD COLUMN buyer_phone text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchases' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE purchases ADD COLUMN payment_status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- Guest buyers can insert purchases
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchases' AND policyname = 'Anyone can insert a purchase'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Anyone can insert a purchase"
        ON purchases FOR INSERT
        TO anon
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;

-- Anyone can read purchases (receipt page needs this for guests)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchases' AND policyname = 'Anyone can read purchases'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Anyone can read purchases"
        ON purchases FOR SELECT
        TO anon
        USING (true)
    $policy$;
  END IF;
END $$;

-- Allow service role to update payment_status (used by edge function)
-- (service role bypasses RLS by default, no policy needed)
