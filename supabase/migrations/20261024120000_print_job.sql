-- Угаалгах захиалгыг хэвлэх (принт) товч: хэвлэсний дараа төлөв автоматаар «Угаасан» болж,
-- худалдан авагчид нэг удаа SMS очно. SMS давхар явахаас сэргийлж огноог хадгална.
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS sms_sent_at timestamptz;
NOTIFY pgrst, 'reload schema';
