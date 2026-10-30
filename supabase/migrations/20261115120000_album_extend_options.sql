-- update-82: цомгийн хугацаа сунгах сонголтууд (30 хоног 10,000₮ · 60 хоног 18,000₮)
--
-- * platform_settings.album_extend_options — [{days, price}], супер админ засна.
-- * Хуучин album_extend_price / album_extend_days нь эхний сонголттой ижил байлгагдана (хуучин код эвдрэхгүй).
-- * Сунгалт нь цомгийн хугацааг max(одоо, дуусах огноо)-оос эхлэн нэмнэ (apply_album_extension хэвээр).
-- Дахин ажиллуулахад эвдрэхгүй.

INSERT INTO public.platform_settings (key, value) VALUES
  ('album_extend_options', '[{"days":30,"price":10000},{"days":60,"price":18000}]'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
