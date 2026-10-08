-- Профайл зураг (avatars) болон арын зураг / лого (covers) хадгалах bucket-ууд.
-- Supabase-ийг шинээр үүсгэхэд эдгээр bucket алга болсон тул зураг байршуулж чадахгүй байсан.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880,  ARRAY['image/jpeg','image/png','image/webp']),
  ('covers',  'covers',  true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Хэн ч харж болно (сайт дээр харагдана)
DROP POLICY IF EXISTS "avatars_covers_public_read" ON storage.objects;
CREATE POLICY "avatars_covers_public_read" ON storage.objects
  FOR SELECT USING (bucket_id IN ('avatars','covers'));

-- Нэвтэрсэн хэрэглэгч зөвхөн өөрийн хавтаст (<uid>/... эсвэл watermarks/<uid>/...) бичнэ
DROP POLICY IF EXISTS "avatars_covers_own_insert" ON storage.objects;
CREATE POLICY "avatars_covers_own_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('avatars','covers') AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      ((storage.foldername(name))[1] = 'watermarks' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "avatars_covers_own_update" ON storage.objects;
CREATE POLICY "avatars_covers_own_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('avatars','covers') AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      ((storage.foldername(name))[1] = 'watermarks' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "avatars_covers_own_delete" ON storage.objects;
CREATE POLICY "avatars_covers_own_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('avatars','covers') AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      ((storage.foldername(name))[1] = 'watermarks' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
  );
