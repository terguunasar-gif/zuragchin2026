-- Зохион байгуулагчид зориулсан царай шалгах хэрэгсэл: зураг бүрт хэдэн царай уншигдсан,
-- (selfie өгвөл) тухайн selfie-ээс ямар зайтай байгааг харуулна.
CREATE OR REPLACE FUNCTION public.face_debug(p_album_id uuid, p_descriptor real[] DEFAULT NULL)
RETURNS TABLE (photo_id uuid, faces integer, distance real)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ai_can_manage_album(p_album_id) THEN RAISE EXCEPTION 'Эрх хүрэлцэхгүй'; END IF;
  IF p_descriptor IS NOT NULL AND array_length(p_descriptor, 1) IS DISTINCT FROM 128 THEN
    RAISE EXCEPTION 'Буруу өгөгдөл';
  END IF;
  RETURN QUERY
    SELECT f.photo_id,
           count(*)::integer,
           CASE WHEN p_descriptor IS NULL THEN NULL ELSE min(
             sqrt((SELECT sum((a.x - b.y) * (a.x - b.y))
                   FROM unnest(f.descriptor) WITH ORDINALITY a(x, i)
                   JOIN unnest(p_descriptor) WITH ORDINALITY b(y, j) ON a.i = b.j)))::real END
    FROM public.photo_faces f
    WHERE f.album_id = p_album_id
    GROUP BY f.photo_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.face_debug(uuid, real[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.face_debug(uuid, real[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
