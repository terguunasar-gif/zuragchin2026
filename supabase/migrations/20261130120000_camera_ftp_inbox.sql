-- 📷 Камераас шууд (FTP → Couchdrop → Supabase Storage → цомог)
-- Sony камер FTP-ээр Couchdrop руу дарна → Couchdrop файлыг ХУВИЙН `camera-inbox/<album_id>/` руу хуулна →
-- зурагчны «Камераас шууд» горим нээлттэй хуудас шинэ файлыг авч, ердийн байршуулалттай яг адил
-- (шахалт, тамга, preview, thumb, квот, царай) боловсруулаад photo_uploads-д бүртгэж, inbox-оос устгана.
-- Эх зураг хэзээ ч нийтийн bucket-д орохгүй. Дахин ажиллуулахад эвдрэхгүй.

-- 1) Хувийн inbox bucket (MIME/хэмжээний хязгааргүй — Couchdrop octet-stream илгээж болно)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('camera-inbox', 'camera-inbox', false, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = false, allowed_mime_types = NULL;

-- 2) Объектын нэрийн эхний хавтас = цомгийн ID. Тухайн цомогт хувь нэмэр оруулах эрхтэй хүн л харна/устгана.
CREATE OR REPLACE FUNCTION public.camera_inbox_allowed(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_seg text := split_part(coalesce(p_name, ''), '/', 1);
BEGIN
  IF v_seg !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  RETURN public.can_contribute_album(v_seg::uuid);
END $$;
REVOKE EXECUTE ON FUNCTION public.camera_inbox_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.camera_inbox_allowed(text) TO authenticated;

DROP POLICY IF EXISTS "camera_inbox_select" ON storage.objects;
CREATE POLICY "camera_inbox_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'camera-inbox' AND public.camera_inbox_allowed(name));

DROP POLICY IF EXISTS "camera_inbox_delete" ON storage.objects;
CREATE POLICY "camera_inbox_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'camera-inbox' AND public.camera_inbox_allowed(name));
-- INSERT бодлого санаатайгаар байхгүй: зөвхөн Couchdrop (S3 түлхүүр = service) бичнэ.

-- 3) Хоёр төхөөрөмж зэрэг нээлттэй байсан ч нэг файлыг нэг л удаа боловсруулна
CREATE TABLE IF NOT EXISTS public.camera_inbox_claims (
  object_id uuid PRIMARY KEY,
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  name text NOT NULL,
  claimed_by uuid NOT NULL DEFAULT auth.uid(),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  photo_id uuid,
  error text
);
ALTER TABLE public.camera_inbox_claims ENABLE ROW LEVEL SECURITY;
-- Шууд хандалтгүй — зөвхөн доорх функцээр

-- Файлыг «би боловсруулж байна» гэж тэмдэглэнэ. 3 минутаас удаан гацсан тэмдэглэгээг дахин авна.
CREATE OR REPLACE FUNCTION public.camera_inbox_claim(p_object_id uuid, p_name text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_album uuid; n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нэвтэрнэ үү'; END IF;
  IF NOT public.camera_inbox_allowed(p_name) THEN RAISE EXCEPTION 'Эрхгүй'; END IF;
  v_album := split_part(p_name, '/', 1)::uuid;
  INSERT INTO public.camera_inbox_claims (object_id, album_id, name)
  VALUES (p_object_id, v_album, p_name)
  ON CONFLICT (object_id) DO UPDATE
     SET claimed_by = auth.uid(), claimed_at = now(), error = NULL
   WHERE camera_inbox_claims.photo_id IS NULL
     AND camera_inbox_claims.claimed_at < now() - interval '3 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE EXECUTE ON FUNCTION public.camera_inbox_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.camera_inbox_claim(uuid, text) TO authenticated;

-- Үр дүнг тэмдэглэнэ (амжилттай бол photo_id, алдаа бол error)
CREATE OR REPLACE FUNCTION public.camera_inbox_done(p_object_id uuid, p_photo_id uuid, p_error text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.camera_inbox_claims
     SET photo_id = p_photo_id, error = left(p_error, 500)
   WHERE object_id = p_object_id AND claimed_by = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.camera_inbox_done(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.camera_inbox_done(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
