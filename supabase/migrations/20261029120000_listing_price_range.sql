-- update-41: нүүр хуудасны цомгийн картанд зураг тус бүрийн үнийг тусгах
-- price = цомгийн зургуудын хамгийн бага үнэ, max_price = хамгийн өндөр үнэ
-- (зураг тус бүрийн үнэ байхгүй бол цомгийн анхдагч үнэ). update-40-ийн дараа ажиллуулна.
-- Буцаах төрөл өөрчлөгдсөн тул DROP хийгээд дахин үүсгэнэ. Дахин ажиллуулахад эвдрэхгүй.

DROP FUNCTION IF EXISTS public.list_public_albums(text, text, uuid, integer, integer);
CREATE OR REPLACE FUNCTION public.list_public_albums(
  p_category text DEFAULT NULL, p_q text DEFAULT NULL, p_photographer uuid DEFAULT NULL,
  p_limit integer DEFAULT 24, p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid, name text, share_link text, cover_url text, photographers text,
  photo_count integer, price numeric, category text, location text, event_date date,
  max_price numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
         (SELECT min(COALESCE(ph.download_price, a.download_price)) FROM public.photo_uploads ph
          WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL),
       a.listing_category, a.listing_location, a.event_date,
       (SELECT max(COALESCE(ph.download_price, a.download_price)) FROM public.photo_uploads ph
          WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL)
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
$$;

REVOKE EXECUTE ON FUNCTION public.list_public_albums(text, text, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_albums(text, text, uuid, integer, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
