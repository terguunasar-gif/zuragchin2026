-- Цомог доторх хавтаснууд (сэдэв, хэсгээр ангилах). AI бүүтийн зургууд
-- source = 'ai_booth'-оор автоматаар «AI бүүт» хавтсанд харагдана (тусдаа мөр шаардахгүй).

-- Цомогт хувь нэмэр оруулж болох хүн: эзэн/админ эсвэл зөвшөөрөгдсөн зурагчин
CREATE OR REPLACE FUNCTION public.can_contribute_album(p_album_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT public.ai_can_manage_album(p_album_id)
      OR EXISTS (SELECT 1 FROM public.album_photographers ap
                 WHERE ap.album_id = p_album_id AND ap.photographer_id = auth.uid() AND ap.status = 'approved');
$$;
REVOKE EXECUTE ON FUNCTION public.can_contribute_album(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_contribute_album(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.album_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS album_folders_album_idx ON public.album_folders (album_id, sort_order);

ALTER TABLE public.album_folders ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.album_folders TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.album_folders TO authenticated;

DROP POLICY IF EXISTS "album_folders_read" ON public.album_folders;
CREATE POLICY "album_folders_read" ON public.album_folders
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "album_folders_insert" ON public.album_folders;
CREATE POLICY "album_folders_insert" ON public.album_folders
  FOR INSERT TO authenticated WITH CHECK (public.can_contribute_album(album_id));

DROP POLICY IF EXISTS "album_folders_update" ON public.album_folders;
CREATE POLICY "album_folders_update" ON public.album_folders
  FOR UPDATE TO authenticated
  USING (public.ai_can_manage_album(album_id) OR created_by = auth.uid())
  WITH CHECK (public.can_contribute_album(album_id));

DROP POLICY IF EXISTS "album_folders_delete" ON public.album_folders;
CREATE POLICY "album_folders_delete" ON public.album_folders
  FOR DELETE TO authenticated
  USING (public.ai_can_manage_album(album_id) OR created_by = auth.uid());

-- Зураг аль хавтсанд байх (хавтас устгавал зураг «Бусад»-д үлдэнэ)
ALTER TABLE public.photo_uploads
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.album_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS photo_uploads_folder_idx ON public.photo_uploads (folder_id);

-- Өөр цомгийн хавтсанд зураг хийхээс сэргийлнэ
CREATE OR REPLACE FUNCTION public.photo_folder_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.album_folders f WHERE f.id = NEW.folder_id AND f.album_id = NEW.album_id
  ) THEN
    NEW.folder_id := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS photo_folder_guard ON public.photo_uploads;
CREATE TRIGGER photo_folder_guard
  BEFORE INSERT OR UPDATE OF folder_id ON public.photo_uploads
  FOR EACH ROW EXECUTE FUNCTION public.photo_folder_guard();

-- Олон зургийг хавтас руу зөөх (эзэн/админ бүх зургийг, зурагчин зөвхөн өөрийнхийг)
CREATE OR REPLACE FUNCTION public.set_photos_folder(p_photo_ids uuid[], p_folder_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_album uuid; n integer;
BEGIN
  IF p_folder_id IS NOT NULL THEN
    SELECT album_id INTO v_album FROM public.album_folders WHERE id = p_folder_id;
    IF v_album IS NULL THEN RAISE EXCEPTION 'Хавтас олдсонгүй'; END IF;
  END IF;
  UPDATE public.photo_uploads ph
     SET folder_id = p_folder_id
   WHERE ph.id = ANY(p_photo_ids)
     AND (p_folder_id IS NULL OR ph.album_id = v_album)
     AND (public.ai_can_manage_album(ph.album_id)
          OR (ph.photographer_id = auth.uid() AND public.can_contribute_album(ph.album_id)));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_photos_folder(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_photos_folder(uuid[], uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
