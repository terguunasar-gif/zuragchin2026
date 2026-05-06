/*
  # Create Storage Buckets for Photo Uploads

  ## Overview
  Sets up two Supabase storage buckets:
  - `photos-original`: Private bucket storing original unmodified photos (no public access)
  - `photos-preview`: Public bucket storing watermarked preview versions

  ## Buckets
  1. `photos-original` (private)
     - Only authenticated photographers can upload to their own folder
     - Only album owners and the uploading photographer can read
     - Max file size: 20MB, allowed MIME types: image/jpeg, image/png, image/webp

  2. `photos-preview` (public)
     - Anyone can view watermarked previews
     - Only authenticated photographers can upload
     - Max file size: 20MB, allowed MIME types: image/jpeg, image/png, image/webp

  ## Security
  - Storage RLS policies follow folder-based ownership: {photographer_id}/{filename}
  - Original photos protected from public access
  - Previews publicly readable for album sharing
*/

-- Create private bucket for originals
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos-original',
  'photos-original',
  false,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create public bucket for watermarked previews
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos-preview',
  'photos-preview',
  true,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS policies for photos-original (private) ──────────────────────────────

-- Photographers can upload to their own folder
CREATE POLICY "Photographers can upload originals"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'photos-original'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Photographers can read their own originals
CREATE POLICY "Photographers can read own originals"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'photos-original'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Photographers can delete their own originals
CREATE POLICY "Photographers can delete own originals"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'photos-original'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── RLS policies for photos-preview (public) ────────────────────────────────

-- Photographers can upload previews to their own folder
CREATE POLICY "Photographers can upload previews"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'photos-preview'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read access for watermarked previews
CREATE POLICY "Public can view previews"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'photos-preview');

-- Authenticated read access for watermarked previews
CREATE POLICY "Authenticated can view previews"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'photos-preview');

-- Photographers can delete their own previews
CREATE POLICY "Photographers can delete own previews"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'photos-preview'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
