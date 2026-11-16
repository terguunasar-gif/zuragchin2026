-- Цомгийн хурд (update: album speed)
-- 1) Зураг бүрийн жижиг (~640px) хувилбар — сүлжээнд 1000–1600px preview-ийн оронд thumb_url.
-- 2) base64 логог цомгийн тохиргооноос гаргах админ функц.
-- Дахин ажиллуулахад эвдрэхгүй.

ALTER TABLE public.photo_uploads ADD COLUMN IF NOT EXISTS thumb_url text;

-- Жижиг хувилбарын холбоосыг бүртгэх.
-- Зурагчин өөрийн зураг, цомгийн эзэн өөрийн цомгийн зураг, админ бүх зурагт тавьж болно.
-- Файл нь заавал дуудаж буй хүний өөрийн photos-preview хавтаст байна.
CREATE OR REPLACE FUNCTION public.set_photo_thumb(p_photo_id uuid, p_url text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нэвтэрнэ үү'; END IF;
  IF coalesce(p_url, '') !~ ('/storage/v1/object/public/photos-preview/' || auth.uid()::text || '/') THEN
    RAISE EXCEPTION 'Буруу холбоос';
  END IF;
  UPDATE public.photo_uploads ph SET thumb_url = p_url
   WHERE ph.id = p_photo_id
     AND (ph.photographer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.albums a WHERE a.id = ph.album_id AND a.owner_id = auth.uid())
          OR public.ai_is_admin());
  IF NOT FOUND THEN RAISE EXCEPTION 'Зураг олдсонгүй эсвэл эрхгүй'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_photo_thumb(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_photo_thumb(uuid, text) TO authenticated;

-- Preview солигдоход (тамгыг дахин тавих) хуучин жижиг хувилбарыг хүчингүй болгоно.
CREATE OR REPLACE FUNCTION public.set_photo_preview(p_photo_id uuid, p_url text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нэвтэрнэ үү'; END IF;
  IF coalesce(p_url, '') !~ ('/storage/v1/object/public/photos-preview/' || auth.uid()::text || '/') THEN
    RAISE EXCEPTION 'Буруу холбоос';
  END IF;
  UPDATE public.photo_uploads SET preview_url = p_url, thumb_url = NULL
   WHERE id = p_photo_id AND photographer_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Зураг олдсонгүй эсвэл таных биш'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_photo_preview(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_photo_preview(uuid, text) TO authenticated;

-- Түгжээтэй цомгийн зургуудад thumb_url нэмнэ (буцаах төрөл өөрчлөгдөх тул DROP хийнэ).
DROP FUNCTION IF EXISTS public.locked_album_photos(uuid, text);
CREATE FUNCTION public.locked_album_photos(p_album_id uuid, p_token text)
RETURNS TABLE (
  id uuid, preview_url text, filename text, photographer_id uuid, print_prices jsonb,
  folder_id uuid, source text, download_price numeric, title text, created_at timestamptz,
  thumb_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ph.id, ph.preview_url, ph.filename, ph.photographer_id, to_jsonb(ph.print_prices),
         ph.folder_id, ph.source, ph.download_price, ph.title, ph.created_at,
         ph.thumb_url
    FROM public.photo_uploads ph
   WHERE ph.album_id = p_album_id
     AND ph.hidden_at IS NULL
     AND public.album_lock_state(p_album_id, p_token) IN ('open', 'ok', 'bypass')
   ORDER BY ph.created_at ASC;
$$;
REVOKE EXECUTE ON FUNCTION public.locked_album_photos(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.locked_album_photos(uuid, text) TO anon, authenticated;

-- Цомгийн зургийг эрэмбээр хурдан уншина
CREATE INDEX IF NOT EXISTS photo_uploads_album_created_idx ON public.photo_uploads (album_id, created_at);

-- base64 (data URL) логог байршуулсан холбоосоор солих — цомгийн эзэн эсвэл админ.
-- Шинэ утга нь заавал base64 зураггүй байна (дахин том болохоос сэргийлнэ).
CREATE OR REPLACE FUNCTION public.set_album_watermark_value(p_album_id uuid, p_value text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нэвтэрнэ үү'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.albums a WHERE a.id = p_album_id AND (a.owner_id = auth.uid() OR public.ai_is_admin())) THEN
    RAISE EXCEPTION 'Зөвхөн цомгийн эзэн эсвэл админ';
  END IF;
  IF coalesce(p_value, '') LIKE '%data:image%' THEN RAISE EXCEPTION 'base64 зураг хадгалахгүй'; END IF;
  UPDATE public.albums SET watermark_value = p_value WHERE id = p_album_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_album_watermark_value(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_album_watermark_value(uuid, text) TO authenticated;

-- Админд: base64 логотой цомгуудын жагсаалт (өөрөө том утгыг татахгүйгээр)
CREATE OR REPLACE FUNCTION public.albums_with_inline_logos()
RETURNS TABLE (id uuid, title text, owner_id uuid, value_bytes integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ai_is_admin() THEN RAISE EXCEPTION 'Зөвхөн админ'; END IF;
  RETURN QUERY
  SELECT a.id, coalesce(a.title, a.name)::text, a.owner_id, octet_length(a.watermark_value)
    FROM public.albums a
   WHERE a.watermark_value LIKE '%data:image%'
   ORDER BY octet_length(a.watermark_value) DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.albums_with_inline_logos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.albums_with_inline_logos() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_album_watermark_value(p_album_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ai_is_admin() THEN RAISE EXCEPTION 'Зөвхөн админ'; END IF;
  RETURN (SELECT a.watermark_value FROM public.albums a WHERE a.id = p_album_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_album_watermark_value(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_album_watermark_value(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
