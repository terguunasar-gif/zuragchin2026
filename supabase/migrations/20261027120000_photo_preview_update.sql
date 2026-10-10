-- Зурагчин өөрийн зургийн урьдчилан харах (preview) хувилбарыг шинэчлэх — хамгаалалттай тамга руу шилжүүлэхэд.
-- Зөвхөн өөрийн хавтас дахь photos-preview файлын холбоосыг зөвшөөрнө.
CREATE OR REPLACE FUNCTION public.set_photo_preview(p_photo_id uuid, p_url text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нэвтэрнэ үү'; END IF;
  IF coalesce(p_url, '') !~ ('/storage/v1/object/public/photos-preview/' || auth.uid()::text || '/') THEN
    RAISE EXCEPTION 'Буруу холбоос';
  END IF;
  UPDATE public.photo_uploads SET preview_url = p_url
   WHERE id = p_photo_id AND photographer_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Зураг олдсонгүй эсвэл таных биш'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_photo_preview(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_photo_preview(uuid, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
