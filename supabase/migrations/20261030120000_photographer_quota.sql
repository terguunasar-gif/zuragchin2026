-- update-49: «Худалдах» цомогт зурагчин бүрийн зургийн хязгаар
--
-- * Зурагчин нэг цомогт үнэгүй 1,000 зураг (platform_settings.photo_quota_free) оруулна.
-- * Хэтэрвэл нэмэлт багц (platform_settings.photo_quota_packages) QPay-ээр авна — орлого платформд.
-- * AI бүүтийн зураг тооцогдохгүй (тэр нь платформын орлого).
-- * «Үнэгүй хуваалцах» цомогт хамаарахгүй — тэнд цомгийн багцын хязгаар (photo_limit_guard) хэвээр.
-- * Нуусан (hidden_at) зураг тооцогдохгүй.
-- Дахин ажиллуулахад эвдрэхгүй.

INSERT INTO public.platform_settings (key, value) VALUES
  ('photo_quota_free', '1000'::jsonb),
  ('photo_quota_packages', '[
    {"code":"p500","name":"+500 зураг","photos":500,"price":5000},
    {"code":"p2000","name":"+2,000 зураг","photos":2000,"price":15000}
  ]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Зурагчин бүрийн цомог дахь нэмэлт эрх
CREATE TABLE IF NOT EXISTS public.album_photographer_quota (
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  photographer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  extra_photos integer NOT NULL DEFAULT 0 CHECK (extra_photos >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, photographer_id)
);
ALTER TABLE public.album_photographer_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.album_photographer_quota FROM anon, authenticated;

-- Нэмэлт багцын захиалга (QPay)
CREATE TABLE IF NOT EXISTS public.photo_quota_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  photographer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  package_code text NOT NULL,
  photos integer NOT NULL CHECK (photos > 0),
  amount numeric(10,2) NOT NULL,
  qpay_invoice_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  qpay_payment_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
ALTER TABLE public.photo_quota_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_quota_orders FROM anon, authenticated;

-- Үнэгүй хязгаар
CREATE OR REPLACE FUNCTION public.photo_quota_free()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::integer FROM public.platform_settings WHERE key = 'photo_quota_free'), 1000);
$$;

-- Нэвтэрсэн зурагчны тухайн цомог дахь хэрэглээ
CREATE OR REPLACE FUNCTION public.photographer_quota(p_album_id uuid)
RETURNS TABLE (applies boolean, used integer, free_quota integer, extra integer, quota integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_free integer := public.photo_quota_free(); v_extra integer; v_used integer; v_is_free boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нэвтэрнэ үү'; END IF;
  SELECT a.is_free INTO v_is_free FROM public.albums a WHERE a.id = p_album_id;
  SELECT COALESCE(q.extra_photos, 0) INTO v_extra FROM public.album_photographer_quota q
   WHERE q.album_id = p_album_id AND q.photographer_id = auth.uid();
  SELECT count(*)::integer INTO v_used FROM public.photo_uploads ph
   WHERE ph.album_id = p_album_id AND ph.photographer_id = auth.uid()
     AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL;
  RETURN QUERY SELECT NOT COALESCE(v_is_free, false), v_used, v_free, COALESCE(v_extra, 0), v_free + COALESCE(v_extra, 0);
END $$;
REVOKE EXECUTE ON FUNCTION public.photographer_quota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.photographer_quota(uuid) TO authenticated;

-- Хязгаараас хэтэрсэн оруулалтыг өгөгдлийн сангийн түвшинд хориглоно
CREATE OR REPLACE FUNCTION public.photographer_quota_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_free boolean; v_used integer; v_quota integer;
BEGIN
  IF NEW.source IS NOT DISTINCT FROM 'ai_booth' OR NEW.photographer_id IS NULL THEN RETURN NEW; END IF;
  SELECT is_free INTO v_is_free FROM public.albums WHERE id = NEW.album_id;
  IF COALESCE(v_is_free, false) THEN RETURN NEW; END IF;
  SELECT public.photo_quota_free() + COALESCE((SELECT extra_photos FROM public.album_photographer_quota
           WHERE album_id = NEW.album_id AND photographer_id = NEW.photographer_id), 0) INTO v_quota;
  SELECT count(*)::integer INTO v_used FROM public.photo_uploads
   WHERE album_id = NEW.album_id AND photographer_id = NEW.photographer_id
     AND source IS DISTINCT FROM 'ai_booth' AND hidden_at IS NULL;
  IF v_used >= v_quota THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: Энэ цомогт таны зургийн хязгаар (% зураг) дүүрсэн. Нэмэлт багц авна уу.', v_quota;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS photographer_quota_guard ON public.photo_uploads;
CREATE TRIGGER photographer_quota_guard BEFORE INSERT ON public.photo_uploads
  FOR EACH ROW EXECUTE FUNCTION public.photographer_quota_guard();

-- Төлбөр баталгаажсан нэмэлт багцыг нэг л удаа олгоно (qpay функц service role-оор дуудна)
CREATE OR REPLACE FUNCTION public.apply_photo_quota_order(p_invoice_id text, p_payment_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  UPDATE public.photo_quota_orders
     SET status = 'paid', paid_at = now(), qpay_payment_id = COALESCE(p_payment_id, '')
   WHERE qpay_invoice_id = p_invoice_id AND status = 'pending'
   RETURNING * INTO o;
  IF NOT FOUND THEN
    RETURN (SELECT 'paid' FROM public.photo_quota_orders WHERE qpay_invoice_id = p_invoice_id AND status = 'paid');
  END IF;
  INSERT INTO public.album_photographer_quota (album_id, photographer_id, extra_photos, updated_at)
  VALUES (o.album_id, o.photographer_id, o.photos, now())
  ON CONFLICT (album_id, photographer_id)
  DO UPDATE SET extra_photos = public.album_photographer_quota.extra_photos + EXCLUDED.extra_photos, updated_at = now();
  RETURN 'applied';
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_photo_quota_order(text, text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
