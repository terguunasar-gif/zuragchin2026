-- update-80: Нүүр хуудасны «Үнэ, төлбөр» хэсэг + админаас засах үнүүд
--
-- * ai_booth_price — шинэ AI бүүтийн нэг зургийн үнэ (өмнө нь кодонд 5000 гэж тогтмол байсан).
--   Одоо байгаа бүүтүүдийн үнийг админ «Үнэ, төлбөр» тохиргооноос нэг дор шинэчилж болно.
-- * payout_min — зурагчин орлогоо татах доод дүн (функц дотор 10000 гэж default-тай байсан).
-- * home_pricing_enabled — нүүр хуудсанд үнийн хэсгийг харуулах эсэх.
-- Дахин ажиллуулахад эвдрэхгүй.

INSERT INTO public.platform_settings (key, value) VALUES
  ('ai_booth_price', '5000'::jsonb),
  ('payout_min', '10000'::jsonb),
  ('min_photo_price', '1000'::jsonb),
  ('purchase_download_days', '14'::jsonb),
  ('home_pricing_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Шинэ бүүт үүсэхэд үнийг platform_settings.ai_booth_price-аас авна
CREATE OR REPLACE FUNCTION public.ai_booth_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL OR public.ai_is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.price_mnt   := COALESCE((SELECT (value #>> '{}')::numeric::integer FROM public.platform_settings WHERE key = 'ai_booth_price'), 5000);
    NEW.owner_share := 0;
    NEW.booth_token := replace(gen_random_uuid()::text, '-', '');
  ELSE
    NEW.price_mnt   := OLD.price_mnt;
    NEW.owner_share := OLD.owner_share;
    IF coalesce(current_setting('ai_booth.rotate', true), '') <> 'on' THEN
      NEW.booth_token := OLD.booth_token;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
