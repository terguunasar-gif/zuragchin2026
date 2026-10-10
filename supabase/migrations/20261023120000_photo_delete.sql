-- Цомгоос зураг устгах (зурагчин өөрийн зургийг, цомгийн эзэн / админ бүх зургийг).
-- Худалдагдсан зургийг устгахгүй — нуудаг (hidden_at). Ингэснээр худалдан авагчийн баримт, татах холбоос ажилласаар байна.

ALTER TABLE public.photo_uploads ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

CREATE OR REPLACE FUNCTION public.delete_album_photo(p_photo_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ph record;
BEGIN
  SELECT id, album_id, photographer_id INTO ph FROM public.photo_uploads WHERE id = p_photo_id;
  IF NOT FOUND THEN RETURN 'deleted'; END IF;
  IF auth.uid() IS NULL OR NOT (ph.photographer_id = auth.uid() OR public.ai_can_manage_album(ph.album_id)) THEN
    RAISE EXCEPTION 'Эрх хүрэлцэхгүй';
  END IF;
  IF EXISTS (SELECT 1 FROM public.purchases WHERE photo_id = p_photo_id AND payment_status = 'paid') THEN
    UPDATE public.photo_uploads SET hidden_at = now() WHERE id = p_photo_id;
    UPDATE public.albums SET cover_photo_id = NULL WHERE cover_photo_id = p_photo_id;
    RETURN 'hidden';
  END IF;
  DELETE FROM public.photo_uploads WHERE id = p_photo_id;
  RETURN 'deleted';
END $$;
REVOKE EXECUTE ON FUNCTION public.delete_album_photo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_album_photo(uuid) TO authenticated;

-- Нуусан зургийг нийтийн цомгийн жагсаалт, тоонд оруулахгүй
DO $$
BEGIN
  IF to_regprocedure('public.list_public_albums(text,text,uuid,integer,integer)') IS NOT NULL THEN
    EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.list_public_albums(
      p_category text DEFAULT NULL, p_q text DEFAULT NULL, p_photographer uuid DEFAULT NULL,
      p_limit integer DEFAULT 24, p_offset integer DEFAULT 0
    ) RETURNS TABLE (
      id uuid, name text, share_link text, cover_url text, photographers text,
      photo_count integer, price numeric, category text, location text, event_date date
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $q$
      SELECT a.id,
             COALESCE(NULLIF(a.title, ''), a.name),
             a.share_link,
             COALESCE(
               (SELECT ph.preview_url FROM public.photo_uploads ph WHERE ph.id = a.cover_photo_id AND ph.hidden_at IS NULL),
               (SELECT ph.preview_url FROM public.photo_uploads ph
                 WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL
                 ORDER BY ph.created_at DESC LIMIT 1)),
             (SELECT string_agg(n, ', ') FROM (
                SELECT DISTINCT COALESCE(NULLIF(pp.display_name, ''), NULLIF(u.name, ''), 'Зурагчин') AS n
                  FROM public.photo_uploads ph
                  LEFT JOIN public.photographer_profiles pp ON pp.user_id = ph.photographer_id
                  LEFT JOIN public.users u ON u.id = ph.photographer_id
                 WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL
                 LIMIT 3) s),
             (SELECT count(*)::integer FROM public.photo_uploads ph
               WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL),
             a.download_price, a.listing_category, a.listing_location, a.event_date
        FROM public.albums a
       WHERE a.listed_until > now()
         AND NOT a.listing_hidden
         AND a.status = 'active'
         AND NOT a.is_free
         AND COALESCE(a.share_link, '') <> ''
         AND (a.expires_at IS NULL OR a.expires_at > now())
         AND a.files_purged_at IS NULL
         AND (p_category IS NULL OR p_category = '' OR a.listing_category = p_category)
         AND (p_q IS NULL OR p_q = '' OR COALESCE(a.title, '') ILIKE '%' || p_q || '%' OR a.name ILIKE '%' || p_q || '%'
              OR a.listing_location ILIKE '%' || p_q || '%')
         AND (p_photographer IS NULL OR EXISTS (
              SELECT 1 FROM public.photo_uploads ph WHERE ph.album_id = a.id AND ph.photographer_id = p_photographer AND ph.hidden_at IS NULL))
         AND EXISTS (SELECT 1 FROM public.photo_uploads ph WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL)
       ORDER BY a.listed_at DESC NULLS LAST, a.created_at DESC
       LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
    $q$;
    $f$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
