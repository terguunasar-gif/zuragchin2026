-- update-61: ai-booth сан MP4 видео хадгалах боломжтой болно (өмнө нь зөвхөн зураг, 15MB)
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','video/mp4'],
       file_size_limit = 52428800
 WHERE id = 'ai-booth';
