-- Царайгаар хайх. Зурган дахь царай бүрийн 128 тоот «хээ»(descriptor)-г хадгална —
-- зураг, selfie-г хадгалахгүй. Хээг хэн ч шууд уншиж чадахгүй, зөвхөн face_search()
-- функцээр харьцуулна. Зохион байгуулагч цомог бүрт асааж/унтраана.

ALTER TABLE public.albums
  ADD COLUMN IF NOT EXISTS face_search_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.photo_uploads
  ADD COLUMN IF NOT EXISTS faces_scanned_at timestamptz;

CREATE TABLE IF NOT EXISTS public.photo_faces (
  id bigserial PRIMARY KEY,
  photo_id uuid NOT NULL REFERENCES public.photo_uploads(id) ON DELETE CASCADE,
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  descriptor real[] NOT NULL CHECK (array_length(descriptor, 1) = 128),
  box jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photo_faces_album_idx ON public.photo_faces (album_id);
CREATE INDEX IF NOT EXISTS photo_faces_photo_idx ON public.photo_faces (photo_id);

-- Шууд унших/бичих эрхгүй (зөвхөн доорх функцүүдээр)
ALTER TABLE public.photo_faces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_faces FROM anon, authenticated;

-- Нэг зургийн царайнуудыг хадгалах (өмнөхийг сольж). p_faces = [{"d":[128 тоо],"b":{x,y,w,h}}, ...]
CREATE OR REPLACE FUNCTION public.save_photo_faces(p_photo_id uuid, p_faces jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_album uuid; v_owner uuid; n integer := 0; f jsonb; d real[];
BEGIN
  SELECT album_id, photographer_id INTO v_album, v_owner FROM public.photo_uploads WHERE id = p_photo_id;
  IF v_album IS NULL THEN RAISE EXCEPTION 'Зураг олдсонгүй'; END IF;
  IF NOT (public.ai_can_manage_album(v_album) OR (v_owner = auth.uid() AND public.can_contribute_album(v_album))) THEN
    RAISE EXCEPTION 'Эрх хүрэлцэхгүй';
  END IF;
  IF jsonb_typeof(p_faces) <> 'array' OR jsonb_array_length(p_faces) > 60 THEN
    RAISE EXCEPTION 'Буруу өгөгдөл';
  END IF;

  DELETE FROM public.photo_faces WHERE photo_id = p_photo_id;
  FOR f IN SELECT * FROM jsonb_array_elements(p_faces) LOOP
    SELECT array_agg(x::real) INTO d FROM jsonb_array_elements_text(f->'d') AS x;
    IF array_length(d, 1) = 128 THEN
      INSERT INTO public.photo_faces (photo_id, album_id, descriptor, box) VALUES (p_photo_id, v_album, d, f->'b');
      n := n + 1;
    END IF;
  END LOOP;
  UPDATE public.photo_uploads SET faces_scanned_at = now() WHERE id = p_photo_id;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.save_photo_faces(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_photo_faces(uuid, jsonb) TO authenticated;

-- Зочны selfie-ийн хээгээр цомгоос тохирох зургуудыг олох (selfie хадгалагдахгүй)
CREATE OR REPLACE FUNCTION public.face_search(p_album_id uuid, p_descriptor real[], p_threshold real DEFAULT 0.52)
RETURNS TABLE (photo_id uuid, distance real)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF array_length(p_descriptor, 1) IS DISTINCT FROM 128 THEN
    RAISE EXCEPTION 'Буруу өгөгдөл';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.albums a
                 WHERE a.id = p_album_id AND a.status = 'active' AND a.face_search_enabled) THEN
    RAISE EXCEPTION 'Энэ цомогт царайгаар хайх боломжгүй';
  END IF;
  RETURN QUERY
    SELECT s.photo_id, min(s.dist)::real AS distance
    FROM (
      SELECT f.photo_id,
             sqrt((SELECT sum((a.x - b.y) * (a.x - b.y))
                   FROM unnest(f.descriptor) WITH ORDINALITY a(x, i)
                   JOIN unnest(p_descriptor) WITH ORDINALITY b(y, j) ON a.i = b.j)) AS dist
      FROM public.photo_faces f
      WHERE f.album_id = p_album_id
    ) s
    WHERE s.dist < LEAST(GREATEST(p_threshold, 0.3), 0.6)
    GROUP BY s.photo_id
    ORDER BY min(s.dist)
    LIMIT 500;
END $$;
REVOKE EXECUTE ON FUNCTION public.face_search(uuid, real[], real) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.face_search(uuid, real[], real) TO anon, authenticated;

-- Цомгийн бүх царайны мэдээллийг устгах (эзэн/админ)
CREATE OR REPLACE FUNCTION public.clear_album_faces(p_album_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.ai_can_manage_album(p_album_id) THEN RAISE EXCEPTION 'Эрх хүрэлцэхгүй'; END IF;
  DELETE FROM public.photo_faces WHERE album_id = p_album_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.photo_uploads SET faces_scanned_at = NULL WHERE album_id = p_album_id;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.clear_album_faces(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_album_faces(uuid) TO authenticated;

-- Царайгаар хайхыг асаах/унтраах (эзэн/админ). Унтраахад хээ устахгүй — тусад нь устгана.
CREATE OR REPLACE FUNCTION public.set_face_search(p_album_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ai_can_manage_album(p_album_id) THEN RAISE EXCEPTION 'Эрх хүрэлцэхгүй'; END IF;
  UPDATE public.albums SET face_search_enabled = p_enabled WHERE id = p_album_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_face_search(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_face_search(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
