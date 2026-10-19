-- update-69: Үнийн санал зөвхөн уран сайхны зурагт
--
-- Олон нийтийн арга хэмжээний (тэмцээн, хурим, наадам…) зурагт «Үнийн санал илгээх» шаардлагагүй.
-- * Шинэ цомогт үнийн санал анхнаасаа ХААЛТТАЙ. Уран сайхны зураг зардаг хүн өөрөө асаана.
-- * Одоо байгаа цомгуудаас нүүр хуудсанд уран сайхны төрлөөр (Хөрөг, Байгаль…) нийтлэгдээгүй,
--   автомат зөвшөөрөх хувь тохируулаагүй (өөрөө санаатай тохируулаагүй) цомгуудад санал хаагдана.
-- Дахин ажиллуулахад эвдрэхгүй.

ALTER TABLE public.albums ALTER COLUMN accept_offers SET DEFAULT false;

UPDATE public.albums
   SET accept_offers = false
 WHERE accept_offers
   AND offer_auto_accept_ratio IS NULL
   AND COALESCE(listing_category, '') NOT IN
       ('Хөрөг', 'Байгаль', 'Гэр бүл', 'Загвар, моод', 'Гудамж', 'Архитектур', 'Амьтан', 'Хоол', 'Уран сайхан');

-- Тохиргоо хадгалахад утга өгөөгүй бол хаалттай гэж үзнэ
CREATE OR REPLACE FUNCTION public.set_album_offer_settings(p_album_id uuid, p_accept boolean, p_auto_ratio numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ai_can_manage_album(p_album_id) THEN RAISE EXCEPTION 'Эрх хүрэлцэхгүй'; END IF;
  IF p_auto_ratio IS NOT NULL AND (p_auto_ratio <= 0 OR p_auto_ratio > 1) THEN
    RAISE EXCEPTION 'Автомат зөвшөөрөх хувь 1–100%% хооронд байна';
  END IF;
  UPDATE public.albums SET accept_offers = COALESCE(p_accept, false), offer_auto_accept_ratio = p_auto_ratio
   WHERE id = p_album_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_album_offer_settings(uuid, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_album_offer_settings(uuid, boolean, numeric) TO authenticated;
