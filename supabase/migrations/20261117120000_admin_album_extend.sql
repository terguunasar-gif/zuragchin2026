-- update-85: Супер админ цомгийн хугацааг гараар сунгах
--
-- * admin_extend_album(album_id, days) — зөвхөн админ. Хугацааг max(одоо, дуусах огноо)-оос эхлэн нэмнэ
--   (төлбөрт сунгалттай ижил дүрэм). Файл нь устсан (files_purged_at) цомгийг сунгахгүй.
-- * Админы бүх сунгалт album_admin_extensions-д бүртгэгдэнэ (хэн, хэзээ, хэдэн хоног).
-- * Хэрэглэгчийн QPay сунгалт өөрчлөгдөөгүй — төлбөр ормогц apply_album_extension автоматаар сунгана.
-- Дахин ажиллуулахад эвдрэхгүй.

CREATE TABLE IF NOT EXISTS public.album_admin_extensions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id    uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  admin_id    uuid NOT NULL,
  days        integer NOT NULL,
  old_expires timestamptz,
  new_expires timestamptz NOT NULL,
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS album_admin_extensions_album_idx ON public.album_admin_extensions(album_id, created_at DESC);
ALTER TABLE public.album_admin_extensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read admin extensions" ON public.album_admin_extensions;
CREATE POLICY "Admins read admin extensions"
  ON public.album_admin_extensions FOR SELECT TO authenticated
  USING (public.ai_is_admin());
GRANT SELECT ON public.album_admin_extensions TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_extend_album(p_album_id uuid, p_days integer, p_note text DEFAULT '')
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old    timestamptz;
  v_purged timestamptz;
  v_new    timestamptz;
BEGIN
  IF NOT public.ai_is_admin() THEN RAISE EXCEPTION 'Зөвхөн админ сунгана'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN RAISE EXCEPTION 'Хоногийн тоо 1–3650 байна'; END IF;

  SELECT expires_at, files_purged_at INTO v_old, v_purged FROM public.albums WHERE id = p_album_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Цомог олдсонгүй'; END IF;
  IF v_purged IS NOT NULL THEN RAISE EXCEPTION 'Энэ цомгийн файлууд устсан тул сунгах боломжгүй'; END IF;

  -- album_expiry_guard-ыг энэ гүйлгээнд нээнэ
  PERFORM set_config('album.extend', 'on', true);
  UPDATE public.albums
     SET expires_at = GREATEST(COALESCE(expires_at, now()), now()) + make_interval(days => p_days)
   WHERE id = p_album_id
   RETURNING expires_at INTO v_new;
  PERFORM set_config('album.extend', 'off', true);

  INSERT INTO public.album_admin_extensions (album_id, admin_id, days, old_expires, new_expires, note)
  VALUES (p_album_id, auth.uid(), p_days, v_old, v_new, COALESCE(left(p_note, 300), ''));
  RETURN v_new;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_extend_album(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_extend_album(uuid, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
