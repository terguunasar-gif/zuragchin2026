-- Царайгаар хайх v2: цомогт хэдэн царай уншигдсаныг болон хамгийн ойр (0.7 хүртэл) зургуудыг буцаана.
-- Ингэснээр «яг таарсан» болон «төстэй» зургуудыг ялгаж харуулж, яагаад олдсонгүйг тайлбарлана.
CREATE OR REPLACE FUNCTION public.face_search_near(p_album_id uuid, p_descriptor real[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_faces integer; v_matches jsonb; v_nearest real;
BEGIN
  IF array_length(p_descriptor, 1) IS DISTINCT FROM 128 THEN
    RAISE EXCEPTION 'Буруу өгөгдөл';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.albums a
                 WHERE a.id = p_album_id AND a.status = 'active' AND a.face_search_enabled) THEN
    RAISE EXCEPTION 'Энэ цомогт царайгаар хайх боломжгүй';
  END IF;

  SELECT count(*) INTO v_faces FROM public.photo_faces WHERE album_id = p_album_id;

  WITH d AS (
    SELECT f.photo_id,
           sqrt((SELECT sum((a.x - b.y) * (a.x - b.y))
                 FROM unnest(f.descriptor) WITH ORDINALITY a(x, i)
                 JOIN unnest(p_descriptor) WITH ORDINALITY b(y, j) ON a.i = b.j))::real AS dist
    FROM public.photo_faces f
    WHERE f.album_id = p_album_id
  ), per_photo AS (
    SELECT photo_id, min(dist) AS dist FROM d GROUP BY photo_id
  )
  SELECT (SELECT min(dist) FROM per_photo),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('photo_id', photo_id, 'distance', round(dist::numeric, 3)) ORDER BY dist)
                   FROM (SELECT * FROM per_photo WHERE dist < 0.7 ORDER BY dist LIMIT 300) t), '[]'::jsonb)
    INTO v_nearest, v_matches;

  RETURN jsonb_build_object('faces', v_faces, 'nearest', v_nearest, 'matches', v_matches);
END $$;
REVOKE EXECUTE ON FUNCTION public.face_search_near(uuid, real[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.face_search_near(uuid, real[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
