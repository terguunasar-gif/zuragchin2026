-- Цомгийн эзэн / зурагчин зураг бүрийг засна (гэрэл, өнгө, тайралт).
-- Эх файл өөрчлөгдөхгүй: засвар photo_uploads.adjust-д хадгалагдаж,
-- урьдчилан харах (preview/thumb) засагдсан хувилбараар солигдоно,
-- татах / угаалгах үед эх зурагт хэрэгжинэ. Худалдан авагчийн засвар үүн дээр нэмэгдэнэ.

ALTER TABLE public.photo_uploads ADD COLUMN IF NOT EXISTS adjust jsonb;

CREATE OR REPLACE FUNCTION public.set_photo_edit(p_photo_id uuid, p_adjust jsonb, p_preview_url text, p_thumb_url text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нэвтэрнэ үү'; END IF;
  IF coalesce(p_preview_url, '') !~ ('/storage/v1/object/public/photos-preview/' || auth.uid()::text || '/') THEN
    RAISE EXCEPTION 'Буруу холбоос';
  END IF;
  IF p_thumb_url IS NOT NULL AND p_thumb_url !~ ('/storage/v1/object/public/photos-preview/' || auth.uid()::text || '/') THEN
    RAISE EXCEPTION 'Буруу холбоос';
  END IF;
  SELECT (ph.photographer_id = auth.uid() OR a.owner_id = auth.uid() OR public.ai_is_admin())
    INTO v_ok
    FROM public.photo_uploads ph JOIN public.albums a ON a.id = ph.album_id
   WHERE ph.id = p_photo_id;
  IF NOT coalesce(v_ok, false) THEN RAISE EXCEPTION 'Зураг олдсонгүй эсвэл эрх хүрэлцэхгүй'; END IF;
  UPDATE public.photo_uploads
     SET adjust = CASE WHEN p_adjust IS NULL OR p_adjust = '{}'::jsonb THEN NULL ELSE p_adjust END,
         preview_url = p_preview_url,
         thumb_url = p_thumb_url
   WHERE id = p_photo_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_photo_edit(uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_photo_edit(uuid, jsonb, text, text) TO authenticated;
