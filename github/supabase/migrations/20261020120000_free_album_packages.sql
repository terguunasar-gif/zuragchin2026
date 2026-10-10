-- Үнэгүй хуваалцах цомог: зохион байгуулагч багц (зургийн тоо + хугацаа) төлж идэвхжүүлнэ,
-- зочид усан тэмдэггүй зургаа үнэгүй татна. Багцын үнийг сайтын админ тохируулна.

ALTER TABLE public.albums
  ADD COLUMN IF NOT EXISTS free_activated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_limit integer,
  ADD COLUMN IF NOT EXISTS package_code text;

INSERT INTO public.platform_settings (key, value) VALUES
  ('free_packages', '[
    {"code":"trial","name":"Туршилт","photos":20,"days":7,"price":0},
    {"code":"small","name":"Жижиг","photos":100,"days":30,"price":15000},
    {"code":"medium","name":"Дунд","photos":500,"days":30,"price":39000},
    {"code":"large","name":"Том","photos":2000,"days":30,"price":79000}
  ]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Багцын талбаруудыг эзэмшигч өөрөө өөрчлөхөөс хамгаална (хугацааны хамгаалалттай нэгтгэв)
CREATE OR REPLACE FUNCTION public.album_expiry_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('album.extend', true) IS DISTINCT FROM 'on'
     AND auth.uid() IS NOT NULL AND NOT public.ai_is_admin() THEN
    NEW.expires_at      := OLD.expires_at;
    NEW.files_purged_at := OLD.files_purged_at;
    NEW.free_activated  := OLD.free_activated;
    NEW.photo_limit     := OLD.photo_limit;
    NEW.package_code    := OLD.package_code;
  END IF;
  RETURN NEW;
END $$;

-- Шинэ цомгийг эзэмшигч үүсгэхдээ багцыг «идэвхтэй» болгож чадахгүй
CREATE OR REPLACE FUNCTION public.album_package_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.ai_is_admin() THEN
    NEW.free_activated := false;
    NEW.photo_limit := NULL;
    NEW.package_code := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS album_package_insert_guard ON public.albums;
CREATE TRIGGER album_package_insert_guard BEFORE INSERT ON public.albums
  FOR EACH ROW EXECUTE FUNCTION public.album_package_insert_guard();

-- Багцын захиалгууд
CREATE TABLE IF NOT EXISTS public.album_package_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  package_code text NOT NULL,
  photos integer NOT NULL,
  days integer NOT NULL,
  amount numeric(10,2) NOT NULL,
  qpay_invoice_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  qpay_payment_id text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
ALTER TABLE public.album_package_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.album_package_orders FROM anon, authenticated;
DROP POLICY IF EXISTS "album_package_orders_owner_read" ON public.album_package_orders;
CREATE POLICY "album_package_orders_owner_read" ON public.album_package_orders
  FOR SELECT TO authenticated USING (public.ai_can_manage_album(album_id));
GRANT SELECT ON public.album_package_orders TO authenticated;

-- Төлбөр баталгаажсаны дараа (edge функц service role) — нэг л удаа идэвхжүүлнэ
DROP FUNCTION IF EXISTS public.apply_album_package(text, text);
-- 'applied' = яг одоо идэвхжүүлсэн (орлогыг энэ үед л бүртгэнэ), 'paid' = өмнө нь хийгдсэн, NULL = олдсонгүй
CREATE OR REPLACE FUNCTION public.apply_album_package(p_invoice_id text, p_payment_id text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  UPDATE public.album_package_orders
     SET status = 'paid', paid_at = now(), qpay_payment_id = COALESCE(p_payment_id, '')
   WHERE qpay_invoice_id = p_invoice_id AND status = 'pending'
   RETURNING * INTO o;
  IF NOT FOUND THEN
    RETURN (SELECT 'paid' FROM public.album_package_orders WHERE qpay_invoice_id = p_invoice_id AND status = 'paid');
  END IF;
  PERFORM set_config('album.extend', 'on', true);
  UPDATE public.albums
     SET free_activated = true,
         photo_limit = o.photos,
         package_code = o.package_code,
         status = 'active',
         expires_at = GREATEST(COALESCE(expires_at, now()), now() + make_interval(days => o.days))
   WHERE id = o.album_id;
  RETURN 'applied';
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_album_package(text, text) FROM PUBLIC, anon, authenticated;

-- Үнэгүй туршилтын багц (нэг цомогт нэг л удаа)
CREATE OR REPLACE FUNCTION public.activate_free_trial(p_album_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pkg jsonb; v_count integer; v_album record;
BEGIN
  IF NOT public.ai_can_manage_album(p_album_id) THEN RAISE EXCEPTION 'Эрх хүрэлцэхгүй'; END IF;
  SELECT * INTO v_album FROM public.albums WHERE id = p_album_id;
  IF NOT v_album.is_free THEN RAISE EXCEPTION 'Энэ цомог үнэгүй хуваалцах горимд биш'; END IF;
  IF v_album.package_code IS NOT NULL THEN RAISE EXCEPTION 'Туршилтын багцыг аль хэдийн ашигласан'; END IF;
  SELECT p INTO pkg FROM jsonb_array_elements((SELECT value FROM public.platform_settings WHERE key = 'free_packages')) p
   WHERE p->>'code' = 'trial' AND COALESCE((p->>'price')::numeric, 0) = 0;
  IF pkg IS NULL THEN RAISE EXCEPTION 'Туршилтын багц идэвхгүй'; END IF;
  SELECT count(*) INTO v_count FROM public.photo_uploads
   WHERE album_id = p_album_id AND source IS DISTINCT FROM 'ai_booth';
  IF v_count > (pkg->>'photos')::integer THEN
    RAISE EXCEPTION 'Туршилтын багц % хүртэл зурагтай. Цомогт % зураг байна.', pkg->>'photos', v_count;
  END IF;
  PERFORM set_config('album.extend', 'on', true);
  UPDATE public.albums
     SET free_activated = true, photo_limit = (pkg->>'photos')::integer, package_code = 'trial', status = 'active',
         expires_at = now() + make_interval(days => (pkg->>'days')::integer)
   WHERE id = p_album_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.activate_free_trial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_free_trial(uuid) TO authenticated;

-- Идэвхжсэн үнэгүй цомогт багцын хязгаараас олон зураг оруулахгүй
CREATE OR REPLACE FUNCTION public.photo_limit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; v_count integer;
BEGIN
  -- AI бүүтийн зураг багцад тооцогдохгүй (тусдаа төлбөртэй)
  IF NEW.source = 'ai_booth' THEN RETURN NEW; END IF;
  SELECT is_free, free_activated, photo_limit INTO a FROM public.albums WHERE id = NEW.album_id;
  IF a.is_free AND a.free_activated AND a.photo_limit IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.photo_uploads
     WHERE album_id = NEW.album_id AND source IS DISTINCT FROM 'ai_booth';
    IF v_count >= a.photo_limit THEN
      RAISE EXCEPTION 'Багцын хязгаар (% зураг) хүрсэн. Илүү том багц сонгоно уу.', a.photo_limit;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS photo_limit_guard ON public.photo_uploads;
CREATE TRIGGER photo_limit_guard BEFORE INSERT ON public.photo_uploads
  FOR EACH ROW EXECUTE FUNCTION public.photo_limit_guard();

NOTIFY pgrst, 'reload schema';
