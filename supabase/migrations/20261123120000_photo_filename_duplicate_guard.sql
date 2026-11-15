-- Цомогт ижил эх файлын нэрээр дахин мөр үүсгэхгүй.
-- UNIQUE индекс тавиагүй: production дээр (album_id, lower(filename)) давхардсан
-- мөрүүд аль хэдийн байгаа тул constraint нэмэх нь одоогийн өгөгдөл дээр унана.
-- Шинэ INSERT-ийг л шалгана. Нуусан (hidden_at) зургийн нэр ч тооцогдоно.
-- Хэмжээ хадгалдаг багана байхгүй тул тааруулалт нь зөвхөн нэр (том/жижиг үсэг хамаарахгүй).

CREATE INDEX IF NOT EXISTS photo_uploads_album_filename_lower_idx
  ON public.photo_uploads (album_id, lower(filename));

CREATE OR REPLACE FUNCTION public.photo_filename_duplicate_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.filename IS NULL OR btrim(NEW.filename) = '' THEN
    RETURN NEW;
  END IF;
  -- AI бүүт өөрийн үүсгэсэн нэрээр оруулдаг. Тэр замыг хэвээр үлдээнэ.
  IF NEW.source IS NOT DISTINCT FROM 'ai_booth' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.photo_uploads ph
     WHERE ph.album_id = NEW.album_id
       AND ph.filename IS NOT NULL
       AND lower(ph.filename) = lower(NEW.filename)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_FILENAME: Энэ цомогт "%" нэртэй зураг аль хэдийн байна', NEW.filename;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.photo_filename_duplicate_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS photo_filename_duplicate_guard ON public.photo_uploads;
CREATE TRIGGER photo_filename_duplicate_guard
  BEFORE INSERT ON public.photo_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.photo_filename_duplicate_guard();

NOTIFY pgrst, 'reload schema';
