-- Цомог бүрийн угаалгах захиалга авах эцсийн хугацаа.
-- NULL = хязгааргүй (одоо байгаа цомгууд). Энэ файлыг production дээр хараахан ажиллуулаагүй.

ALTER TABLE public.albums
  ADD COLUMN IF NOT EXISTS print_deadline timestamptz;

COMMENT ON COLUMN public.albums.print_deadline IS
  'Угаалгах захиалга авах эцсийн хугацаа. NULL бол хязгааргүй. Татах энэ хугацаанаас хамаарахгүй.';
