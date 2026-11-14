-- update-93: Зохион байгуулагч цомгоо устгах.
-- Өмнө нь albums-д DELETE policy байгаагүй тул устгах хүсэлт 0 мөр устгаад алдаагүй буцдаг байсан
-- (refresh хийхэд цомог дахин гарч ирдэг). Одоо устгалыг qpay Edge Function (/delete-album) хийнэ:
--   • төлөгдсөн худалдан авалтгүй цомог → файлууд + мөр бүрэн устна
--   • борлуулалттай цомог → нуугдана (deleted_at, status='closed'); худалдан авагчдын татах эрх, баримт хадгалагдана
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS albums_owner_not_deleted_idx ON public.albums (owner_id) WHERE deleted_at IS NULL;
