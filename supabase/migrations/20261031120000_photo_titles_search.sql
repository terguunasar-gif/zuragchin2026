-- update-50: зурагт нэр өгөх, нүүр хуудаснаас зургийн нэрээр хайх
-- Дахин ажиллуулахад эвдрэхгүй.

ALTER TABLE public.photo_uploads ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';

-- Зурагчин (эсвэл цомгийн эзэн, админ) сонгосон зургуудад нэр өгнө. Хоосон бол нэрийг арилгана.
CREATE OR REPLACE FUNCTION public.set_photo_title(p_photo_ids uuid[], p_title text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; v text := left(btrim(COALESCE(p_title, '')), 120);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нэвтэрнэ үү'; END IF;
  UPDATE public.photo_uploads ph SET title = v
   WHERE ph.id = ANY ((COALESCE(p_photo_ids, ARRAY[]::uuid[]))[1:1000])
     AND (ph.photographer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.albums a WHERE a.id = ph.album_id AND a.owner_id = auth.uid())
          OR public.ai_is_admin());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_photo_title(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_photo_title(uuid[], text) TO authenticated;

-- Нүүр хуудсанд нийтлэгдсэн «Худалдах» цомгуудын зургийг нэрээр нь хайна (нэвтрэлгүй)
CREATE OR REPLACE FUNCTION public.search_public_photos(p_q text, p_limit integer DEFAULT 24)
RETURNS TABLE (
  id uuid, title text, preview_url text, album_id uuid, album_name text, share_link text,
  price numeric, photographer text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ph.id, ph.title, ph.preview_url, a.id, COALESCE(NULLIF(a.title, ''), a.name), a.share_link,
         COALESCE(ph.download_price, a.download_price),
         COALESCE(NULLIF(pp.display_name, ''), NULLIF(u.name, ''), 'Зурагчин')
    FROM public.photo_uploads ph
    JOIN public.albums a ON a.id = ph.album_id
    LEFT JOIN public.photographer_profiles pp ON pp.user_id = ph.photographer_id
    LEFT JOIN public.users u ON u.id = ph.photographer_id
   WHERE length(btrim(COALESCE(p_q, ''))) >= 2
     AND ph.title ILIKE '%' || btrim(p_q) || '%'
     AND ph.source IS DISTINCT FROM 'ai_booth'
     AND ph.hidden_at IS NULL
     AND a.listed_until > now()
     AND NOT a.listing_hidden
     AND a.status = 'active'
     AND NOT a.is_free
     AND COALESCE(a.share_link, '') <> ''
     AND (a.expires_at IS NULL OR a.expires_at > now())
     AND a.files_purged_at IS NULL
   ORDER BY (lower(ph.title) = lower(btrim(p_q))) DESC, a.listed_at DESC NULLS LAST, ph.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60);
$$;
REVOKE EXECUTE ON FUNCTION public.search_public_photos(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_photos(text, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
