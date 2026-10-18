-- update-57: цомог үзэж буй зочинд тухайн цомгийн AI бүүт рүү орох холбоос
-- Бүүт идэвхтэй, хаагдаагүй үед л токен буцаана. Дахин ажиллуулахад эвдрэхгүй.

CREATE OR REPLACE FUNCTION public.album_booth_token(p_album_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.booth_token FROM public.album_ai_booths b
   WHERE b.album_id = p_album_id AND b.enabled
     AND (b.closes_at IS NULL OR b.closes_at > now())
   LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.album_booth_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.album_booth_token(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
