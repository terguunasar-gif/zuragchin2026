-- Цомог эзэмшигч (болон админ) өөрийн цомогт зураг байршуулж болдог болгоно.
-- Өмнө нь зөвхөн album_photographers-д 'approved' төлөвтэй зурагчин л байршуулж чаддаг байсан.
DROP POLICY IF EXISTS "Album owners can upload photos to own albums" ON public.photo_uploads;
CREATE POLICY "Album owners can upload photos to own albums"
  ON public.photo_uploads FOR INSERT TO authenticated
  WITH CHECK (photographer_id = auth.uid() AND public.ai_can_manage_album(album_id));

NOTIFY pgrst, 'reload schema';
