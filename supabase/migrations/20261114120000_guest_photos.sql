-- update-81: «Зочдын зураг» — хамт олны гишүүд утсаар авсан зургаа цомогт үнэгүй хуваалцана
--
-- * Зочдын зураг ЗАРАГДАХГҮЙ: үнэ, худалдан авах товч байхгүй, хүн бүр үнэгүй татна.
--   Зохион байгуулагч, зурагчин, платформ хэн нь ч зочны зургаас орлого авахгүй.
-- * Хадгалах зардлыг цомгийн эзэн (зохион байгуулагч) багцаар нэг удаа төлнө (Б хувилбар):
--   platform_settings.guest_photo_packages — 5,000₮/500, 10,000₮/1,500, 20,000₮/4,000 (админ засна).
--   Багц нэмэх тусам цомгийн нийт зочны зургийн хязгаар нэмэгдэнэ. Зочин тус бүрт хязгаар байхгүй.
-- * Зураг ~1 MB (2048px) болж шахагдаж, жижиг thumbnail-тай хадгалагдана (guest-photos сан).
-- * Түгжээтэй цомогт кодоор нээсэн хүн л харж, оруулна.
-- * Нэвтэрсэн хэрэглэгч л оруулна; оруулсан хүн, цомгийн эзэн, админ устгана.
-- Дахин ажиллуулахад эвдрэхгүй.

INSERT INTO public.platform_settings (key, value) VALUES
  ('guest_photo_packages', '[
    {"code":"g500","name":"Жижиг","photos":500,"price":5000},
    {"code":"g1500","name":"Дунд","photos":1500,"price":10000},
    {"code":"g4000","name":"Том","photos":4000,"price":20000}
  ]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── Хүснэгтүүд ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.album_guest_settings (
  album_id    uuid PRIMARY KEY REFERENCES public.albums(id) ON DELETE CASCADE,
  photo_limit integer NOT NULL DEFAULT 0 CHECK (photo_limit >= 0),
  enabled     boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.album_guest_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.album_guest_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.album_guest_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  uploader_name text NOT NULL DEFAULT '',
  path          text NOT NULL,
  thumb_path    text NOT NULL,
  bytes         integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS album_guest_photos_album_idx ON public.album_guest_photos(album_id, created_at DESC);
ALTER TABLE public.album_guest_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.album_guest_photos FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.guest_photo_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id        uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  buyer_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  package_code    text NOT NULL,
  photos          integer NOT NULL CHECK (photos > 0),
  amount          numeric(10,2) NOT NULL,
  qpay_invoice_id text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  qpay_payment_id text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  paid_at         timestamptz
);
ALTER TABLE public.guest_photo_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_photo_orders FROM anon, authenticated;

-- ── Туслах функцууд ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.album_can_manage_guests(p_album_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.albums a WHERE a.id = p_album_id AND a.owner_id = auth.uid())
    OR public.ai_is_admin());
$$;
GRANT EXECUTE ON FUNCTION public.album_can_manage_guests(uuid) TO anon, authenticated;

-- Зочин одоо зураг оруулж болох эсэх (асаалттай, хязгаар дүүрээгүй, цомог идэвхтэй)
CREATE OR REPLACE FUNCTION public.guest_upload_open(p_album_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.album_guest_settings s
      JOIN public.albums a ON a.id = s.album_id
     WHERE s.album_id = p_album_id AND s.enabled AND s.photo_limit > 0
       AND a.status = 'active' AND a.files_purged_at IS NULL
       AND (a.expires_at IS NULL OR a.expires_at > now())
       AND (SELECT count(*) FROM public.album_guest_photos g WHERE g.album_id = p_album_id) < s.photo_limit);
$$;
GRANT EXECUTE ON FUNCTION public.guest_upload_open(uuid) TO anon, authenticated;

-- Storage policy-д: замын эхний хавтас (текст) → цомгийн id
CREATE OR REPLACE FUNCTION public.guest_folder_album(p_folder text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN p_folder::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- ── Нийтэд: төлөв + жагсаалт ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guest_photo_info(p_album_id uuid)
RETURNS TABLE (enabled boolean, photo_limit integer, used integer, can_upload boolean, can_manage boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.enabled, false), COALESCE(s.photo_limit, 0),
         (SELECT count(*)::integer FROM public.album_guest_photos g WHERE g.album_id = p_album_id),
         public.guest_upload_open(p_album_id),
         public.album_can_manage_guests(p_album_id)
    FROM (SELECT 1) x LEFT JOIN public.album_guest_settings s ON s.album_id = p_album_id;
$$;
REVOKE EXECUTE ON FUNCTION public.guest_photo_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_photo_info(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.album_guest_photo_list(p_album_id uuid, p_token text DEFAULT NULL)
RETURNS TABLE (id uuid, path text, thumb_path text, uploader_name text, mine boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.path, g.thumb_path, g.uploader_name,
         (auth.uid() IS NOT NULL AND g.user_id = auth.uid()), g.created_at
    FROM public.album_guest_photos g
   WHERE g.album_id = p_album_id
     AND public.album_lock_state(p_album_id, p_token) IN ('open', 'ok', 'bypass')
   ORDER BY g.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.album_guest_photo_list(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.album_guest_photo_list(uuid, text) TO anon, authenticated;

-- ── Зочин: зураг бүртгэх (файлыг storage руу өмнө нь оруулсан) ──────────────
CREATE OR REPLACE FUNCTION public.add_guest_photo(p_album_id uuid, p_path text, p_thumb_path text, p_bytes integer, p_token text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_limit integer; v_used integer; v_name text; v_id uuid;
  v_prefix text := p_album_id::text || '/' || auth.uid()::text || '/';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Нэвтэрнэ үү'; END IF;
  IF left(COALESCE(p_path, ''), length(v_prefix)) <> v_prefix OR left(COALESCE(p_thumb_path, ''), length(v_prefix)) <> v_prefix THEN
    RAISE EXCEPTION 'Файлын зам буруу';
  END IF;
  IF public.album_lock_state(p_album_id, p_token) NOT IN ('open', 'ok', 'bypass') THEN
    RAISE EXCEPTION 'Цомог кодоор түгжээтэй';
  END IF;
  -- Олон хүн зэрэг оруулахад хязгаар давахгүйн тулд мөрийг түгжинэ
  SELECT photo_limit INTO v_limit FROM public.album_guest_settings WHERE album_id = p_album_id FOR UPDATE;
  IF NOT public.guest_upload_open(p_album_id) THEN
    RAISE EXCEPTION 'GUEST_FULL: Зочдын зураг оруулах боломж хаалттай эсвэл хязгаар дүүрсэн байна';
  END IF;
  SELECT count(*)::integer INTO v_used FROM public.album_guest_photos WHERE album_id = p_album_id;
  IF v_used >= v_limit THEN RAISE EXCEPTION 'GUEST_FULL: Зочдын зургийн хязгаар дүүрсэн'; END IF;
  SELECT COALESCE(NULLIF(btrim(name), ''), 'Зочин') INTO v_name FROM public.users WHERE id = v_uid;
  INSERT INTO public.album_guest_photos (album_id, user_id, uploader_name, path, thumb_path, bytes)
  VALUES (p_album_id, v_uid, COALESCE(v_name, 'Зочин'), p_path, p_thumb_path, GREATEST(COALESCE(p_bytes, 0), 0))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.add_guest_photo(uuid, text, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_guest_photo(uuid, text, text, integer, text) TO authenticated;

-- Устгах: оруулсан хүн, цомгийн эзэн, админ. Storage-ийн файлыг клиент устгана (замыг буцаана).
CREATE OR REPLACE FUNCTION public.delete_guest_photo(p_id uuid)
RETURNS TABLE (path text, thumb_path text) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE g record;
BEGIN
  SELECT * INTO g FROM public.album_guest_photos WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT (auth.uid() IS NOT NULL AND (g.user_id = auth.uid() OR public.album_can_manage_guests(g.album_id))) THEN
    RAISE EXCEPTION 'Устгах эрхгүй';
  END IF;
  DELETE FROM public.album_guest_photos WHERE id = p_id;
  RETURN QUERY SELECT g.path, g.thumb_path;
END $$;
REVOKE EXECUTE ON FUNCTION public.delete_guest_photo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_guest_photo(uuid) TO authenticated;

-- Эзэн: зочдын оруулалтыг түр зогсоох / дахин нээх (багц авсан байх ёстой)
CREATE OR REPLACE FUNCTION public.set_guest_upload(p_album_id uuid, p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.album_can_manage_guests(p_album_id) THEN RAISE EXCEPTION 'Зөвхөн цомгийн эзэн'; END IF;
  UPDATE public.album_guest_settings SET enabled = p_enabled, updated_at = now()
   WHERE album_id = p_album_id AND photo_limit > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Эхлээд зочдын зургийн багц авна уу'; END IF;
  RETURN p_enabled;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_guest_upload(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_guest_upload(uuid, boolean) TO authenticated;

-- Төлбөр баталгаажсан багцыг нэг л удаа олгоно (qpay функц service role-оор дуудна)
CREATE OR REPLACE FUNCTION public.apply_guest_photo_order(p_invoice_id text, p_payment_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  UPDATE public.guest_photo_orders
     SET status = 'paid', paid_at = now(), qpay_payment_id = COALESCE(p_payment_id, '')
   WHERE qpay_invoice_id = p_invoice_id AND status = 'pending'
   RETURNING * INTO o;
  IF NOT FOUND THEN
    RETURN (SELECT 'paid' FROM public.guest_photo_orders WHERE qpay_invoice_id = p_invoice_id AND status = 'paid');
  END IF;
  INSERT INTO public.album_guest_settings (album_id, photo_limit, enabled, updated_at)
  VALUES (o.album_id, o.photos, true, now())
  ON CONFLICT (album_id)
  DO UPDATE SET photo_limit = public.album_guest_settings.photo_limit + EXCLUDED.photo_limit, enabled = true, updated_at = now();
  RETURN 'applied';
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_guest_photo_order(text, text) FROM PUBLIC, anon, authenticated;

-- ── Storage: guest-photos (нийтэд уншигдана, замын нэр таамаглашгүй) ─────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('guest-photos', 'guest-photos', true, 3145728, ARRAY['image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Зам: {album_id}/{user_id}/{random}.jpg
DROP POLICY IF EXISTS "Guests upload to open albums" ON storage.objects;
CREATE POLICY "Guests upload to open albums"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'guest-photos'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.guest_upload_open(public.guest_folder_album((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS "Guests or album owner delete guest photos" ON storage.objects;
CREATE POLICY "Guests or album owner delete guest photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'guest-photos'
    AND ((storage.foldername(name))[2] = auth.uid()::text
         OR public.album_can_manage_guests(public.guest_folder_album((storage.foldername(name))[1])))
  );

NOTIFY pgrst, 'reload schema';
