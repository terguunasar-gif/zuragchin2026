-- Худалдан авагчийн имэйл: өөр төхөөрөмжөөс захиалгаа имэйл кодоор сэргээхэд.
-- Хоосон мөр (хуучин захиалга, имэйл оруулаагүй) зөвшөөрнө.
-- Жижиг үсгээр хадгална. Хөтөч шууд уншихгүй — одоогийн purchases RLS хэвээр.

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS buyer_email text NOT NULL DEFAULT '';

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_buyer_email_chk;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_buyer_email_chk
  CHECK (
    buyer_email = ''
    OR (
      char_length(buyer_email) BETWEEN 6 AND 254
      AND buyer_email = lower(buyer_email)
      AND buyer_email ~ '^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    )
  );

COMMENT ON COLUMN public.purchases.buyer_email IS
  'Optional buyer email, stored lowercase. Used to recover paid download and print purchases after an email code.';

CREATE INDEX IF NOT EXISTS purchases_paid_buyer_email_idx
  ON public.purchases (buyer_email, created_at DESC)
  WHERE payment_status = 'paid' AND buyer_email <> '';

NOTIFY pgrst, 'reload schema';
