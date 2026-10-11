-- Зураг бүрийн үнэ, үнийн санал, худалдан авсан зургийг татах хугацаа (update-40)
--
-- 1) photo_uploads.download_price — зураг тус бүрийн татах үнэ. NULL бол цомгийн анхдагч үнэ (albums.download_price).
-- 2) price_offers — зочин зурагчинд үнийн санал илгээнэ; зурагчин зөвшөөрөх / татгалзах / эсрэг санал тавина.
--    Санал үүсгэх, хариулах нь qpay edge функцээр (SMS мэдэгдэлтэй) явна; энд зөвхөн хүснэгт, RLS, туслах RPC.
-- 3) purchases.download_expires_at — төлбөр хийснээс хойш 14 хоног (platform_settings.purchase_download_days).
--    purchases.license_accepted_at — «Хувийн хэрэглээний лиценз»-ийг зөвшөөрсөн цаг.
--    purchases.offer_id — үнийн саналаар хийгдсэн худалдан авалт.
--    purchases.file_stamped_at — захиалгын ID суулгасан хуулбар (purchases bucket) үүссэн цаг.
-- Дахин ажиллуулахад эвдрэхгүй.

-- ── Тохиргоо ────────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value) VALUES
  ('purchase_download_days', '14'::jsonb),   -- төлсний дараа татах хугацаа (хоног)
  ('offer_min_ratio', '0.5'::jsonb),         -- санал үнийн хамгийн багадаа 50%
  ('offer_response_hours', '48'::jsonb),     -- зурагчин хариулах хугацаа
  ('offer_pay_hours', '24'::jsonb),          -- зөвшөөрөгдсөн үнээр төлөх хугацаа
  ('min_photo_price', '1000'::jsonb)         -- зураг тус бүрийн үнийн доод хэмжээ
ON CONFLICT (key) DO NOTHING;

-- ── Зураг бүрийн үнэ ────────────────────────────────────────────────────────
ALTER TABLE public.photo_uploads ADD COLUMN IF NOT EXISTS download_price numeric(10,2);

-- ── Цомгийн саналын тохиргоо ───────────────────────────────────────────────
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS accept_offers boolean NOT NULL DEFAULT true;
-- Жишээ 0.8 = үнийн 80%-иас дээш саналыг автоматаар зөвшөөрнө. NULL = автомат зөвшөөрөлгүй.
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS offer_auto_accept_ratio numeric(4,3);

-- ── Худалдан авалт ──────────────────────────────────────────────────────────
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS download_expires_at timestamptz;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS license_accepted_at timestamptz;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS offer_id uuid;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS file_stamped_at timestamptz;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0;

-- Өмнө нь төлөгдсөн татах захиалгууд: одооноос 14 хоног (хуучин худалдан авагчдыг гэнэт хасахгүй)
UPDATE public.purchases
   SET download_expires_at = now() + interval '14 days'
 WHERE type = 'download' AND payment_status = 'paid' AND download_expires_at IS NULL;

-- ── Үнийн санал ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.price_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  photo_id uuid NOT NULL REFERENCES public.photo_uploads(id) ON DELETE CASCADE,
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  photographer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  buyer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  buyer_name text NOT NULL DEFAULT '',
  buyer_phone text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  list_price numeric(10,2) NOT NULL,
  offer_amount numeric(10,2) NOT NULL,
  counter_amount numeric(10,2),
  final_amount numeric(10,2),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'countered', 'accepted', 'rejected', 'paid', 'cancelled')),
  auto_accepted boolean NOT NULL DEFAULT false,
  respond_by timestamptz NOT NULL,          -- зурагчин (эсвэл эсрэг саналд зочин) хариулах хугацаа
  pay_by timestamptz,                       -- зөвшөөрсний дараа төлөх хугацаа
  responded_at timestamptz,
  qpay_invoice_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_offers_photographer_idx ON public.price_offers (photographer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS price_offers_album_idx ON public.price_offers (album_id, created_at DESC);
CREATE INDEX IF NOT EXISTS price_offers_phone_idx ON public.price_offers (buyer_phone, photo_id, created_at DESC);

ALTER TABLE public.price_offers ENABLE ROW LEVEL SECURITY;
-- Зурагчин өөрийн зургийн, цомгийн эзэн өөрийн цомгийн саналыг харна. Бичих нь зөвхөн edge функц/RPC-ээр.
DROP POLICY IF EXISTS "price_offers_read_own" ON public.price_offers;
CREATE POLICY "price_offers_read_own" ON public.price_offers
  FOR SELECT TO authenticated
  USING (photographer_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.albums a WHERE a.id = album_id AND a.owner_id = auth.uid())
         OR public.ai_is_admin());
GRANT SELECT ON public.price_offers TO authenticated;

-- ── Зураг тус бүрийн үнэ тавих (олон зураг нэг дор). p_price NULL = цомгийн үнэ рүү буцаах ──
CREATE OR REPLACE FUNCTION public.set_photo_download_price(p_photo_ids uuid[], p_price numeric)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer;
  v_min numeric := COALESCE((SELECT (value #>> '{}')::numeric FROM public.platform_settings WHERE key = 'min_photo_price'), 1000);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нэвтэрнэ үү'; END IF;
  IF p_price IS NOT NULL AND p_price < v_min THEN
    RAISE EXCEPTION 'Зургийн үнэ хамгийн багадаа %₮ байна', v_min;
  END IF;
  IF p_price IS NOT NULL AND p_price > 10000000 THEN RAISE EXCEPTION 'Үнэ хэт өндөр байна'; END IF;
  UPDATE public.photo_uploads ph
     SET download_price = p_price
   WHERE ph.id = ANY ((COALESCE(p_photo_ids, ARRAY[]::uuid[]))[1:1000])
     AND COALESCE(ph.source, 'upload') <> 'ai_booth'           -- AI бүүтийн үнийг зөвхөн админ
     AND (ph.photographer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.albums a WHERE a.id = ph.album_id AND a.owner_id = auth.uid())
          OR public.ai_is_admin());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_photo_download_price(uuid[], numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_photo_download_price(uuid[], numeric) TO authenticated;

-- ── Цомгийн саналын тохиргоо (эзэн/админ) ──
CREATE OR REPLACE FUNCTION public.set_album_offer_settings(p_album_id uuid, p_accept boolean, p_auto_ratio numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ai_can_manage_album(p_album_id) THEN RAISE EXCEPTION 'Эрх хүрэлцэхгүй'; END IF;
  IF p_auto_ratio IS NOT NULL AND (p_auto_ratio <= 0 OR p_auto_ratio > 1) THEN
    RAISE EXCEPTION 'Автомат зөвшөөрөх хувь 1–100%% хооронд байна';
  END IF;
  UPDATE public.albums SET accept_offers = COALESCE(p_accept, true), offer_auto_accept_ratio = p_auto_ratio
   WHERE id = p_album_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_album_offer_settings(uuid, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_album_offer_settings(uuid, boolean, numeric) TO authenticated;

-- ── Зурагчны самбар: ирсэн саналууд ──
CREATE OR REPLACE FUNCTION public.my_price_offers(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, photo_id uuid, album_id uuid, album_name text, preview_url text, filename text,
  buyer_name text, buyer_phone text, message text, list_price numeric, offer_amount numeric,
  counter_amount numeric, final_amount numeric, status text, auto_accepted boolean,
  respond_by timestamptz, pay_by timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.photo_id, o.album_id, COALESCE(NULLIF(a.title, ''), a.name, ''), ph.preview_url, ph.filename,
         o.buyer_name, o.buyer_phone, o.message, o.list_price, o.offer_amount,
         o.counter_amount, o.final_amount, o.status, o.auto_accepted,
         o.respond_by, o.pay_by, o.created_at
    FROM public.price_offers o
    JOIN public.albums a ON a.id = o.album_id
    LEFT JOIN public.photo_uploads ph ON ph.id = o.photo_id
   WHERE auth.uid() IS NOT NULL
     AND (o.photographer_id = auth.uid() OR a.owner_id = auth.uid())
     AND (p_status IS NULL OR o.status = p_status)
   ORDER BY (o.status = 'pending') DESC, o.created_at DESC
   LIMIT 300;
$$;
REVOKE EXECUTE ON FUNCTION public.my_price_offers(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_price_offers(text) TO authenticated;

-- Хариулаагүй саналын тоо (самбарын тэмдэгт)
CREATE OR REPLACE FUNCTION public.my_pending_offer_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer
    FROM public.price_offers o JOIN public.albums a ON a.id = o.album_id
   WHERE auth.uid() IS NOT NULL
     AND (o.photographer_id = auth.uid() OR a.owner_id = auth.uid())
     AND o.status = 'pending' AND o.respond_by > now();
$$;
REVOKE EXECUTE ON FUNCTION public.my_pending_offer_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pending_offer_count() TO authenticated;

-- ── Худалдан авагчийн захиалгын ID суулгасан хуулбарууд (хувийн bucket) ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('purchases', 'purchases', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
