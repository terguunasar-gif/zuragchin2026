-- Супер админ аль ч цомгийн зургийн файлыг (эх, preview) хадгалалтаас устгах эрх
DROP POLICY IF EXISTS "Admins can delete photo files" ON storage.objects;
CREATE POLICY "Admins can delete photo files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id IN ('photos-original', 'photos-preview') AND public.ai_is_admin());
