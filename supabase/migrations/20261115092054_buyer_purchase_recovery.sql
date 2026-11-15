-- Өөр төхөөрөмжөөс төлсөн захиалгаа утасны дугаараар сэргээх нэг удаагийн код.
-- Кодыг зөвхөн edge function (service role) уншиж бичнэ. Хөтчөөс шууд хандахгүй.
-- Кодын ил текст хадгалахгүй — HMAC хэш, 5 минутын хугацаа, оролдлогын хязгаар.

CREATE TABLE IF NOT EXISTS public.buyer_purchase_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  request_ip text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buyer_purchase_otps_phone_chk CHECK (phone ~ '^[0-9]{8}$'),
  CONSTRAINT buyer_purchase_otps_attempts_chk CHECK (attempts >= 0 AND attempts <= 10),
  CONSTRAINT buyer_purchase_otps_hash_chk CHECK (char_length(code_hash) = 64)
);

CREATE INDEX IF NOT EXISTS buyer_purchase_otps_phone_created_idx
  ON public.buyer_purchase_otps (phone, created_at DESC);

COMMENT ON TABLE public.buyer_purchase_otps IS
  'Phone recovery OTP hashes for paid purchases. Service role only. Plaintext codes are never stored.';

CREATE TABLE IF NOT EXISTS public.buyer_purchase_otp_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  phone text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buyer_purchase_otp_hits_kind_chk CHECK (kind IN ('request', 'verify'))
);

CREATE INDEX IF NOT EXISTS buyer_purchase_otp_hits_phone_idx
  ON public.buyer_purchase_otp_hits (kind, phone, created_at DESC);

CREATE INDEX IF NOT EXISTS buyer_purchase_otp_hits_ip_idx
  ON public.buyer_purchase_otp_hits (kind, ip, created_at DESC);

COMMENT ON TABLE public.buyer_purchase_otp_hits IS
  'Rate-limit counters for purchase recovery. Service role only.';

ALTER TABLE public.buyer_purchase_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_purchase_otp_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_purchase_otps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_purchase_otp_hits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS buyer_purchase_otps_no_client ON public.buyer_purchase_otps;
CREATE POLICY buyer_purchase_otps_no_client
  ON public.buyer_purchase_otps
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS buyer_purchase_otp_hits_no_client ON public.buyer_purchase_otp_hits;
CREATE POLICY buyer_purchase_otp_hits_no_client
  ON public.buyer_purchase_otp_hits
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- service_role (edge function) л бичнэ. anon/authenticated дээрх USING (false) хэвээр.
DROP POLICY IF EXISTS buyer_purchase_otps_service ON public.buyer_purchase_otps;
CREATE POLICY buyer_purchase_otps_service
  ON public.buyer_purchase_otps
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS buyer_purchase_otp_hits_service ON public.buyer_purchase_otp_hits;
CREATE POLICY buyer_purchase_otp_hits_service
  ON public.buyer_purchase_otp_hits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.buyer_purchase_otps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.buyer_purchase_otp_hits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.buyer_purchase_otps TO service_role;
GRANT ALL ON TABLE public.buyer_purchase_otp_hits TO service_role;

-- Сэргээх үед зөвхөн тухайн 8 оронтой дугаарын төлсөн мөрүүдийг уншина.
CREATE INDEX IF NOT EXISTS purchases_paid_buyer_phone_idx
  ON public.purchases (buyer_phone, created_at DESC)
  WHERE payment_status = 'paid';

NOTIFY pgrst, 'reload schema';
