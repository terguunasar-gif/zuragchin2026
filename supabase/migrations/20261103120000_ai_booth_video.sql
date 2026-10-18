-- update-59: AI бүүт — «360° видео» сонголт
--
-- * Загвар сонгосны дараа зочин «Зураг» эсвэл «360° видео»-ны аль нэгийг сонгоно (тус бүр тусдаа төлбөр).
-- * Видео: AI зургийг Google Veo-д өгч, хүмүүс хөдөлгөөнгүй, камер тойрон эргэх 6 секундын видео.
-- * Видео авсан хүн зургаа авах бол дахин төлнө (source_job_id — тэр видеоны зураг).
-- * Видео цомогт орохгүй — зөвхөн зочны утсанд.
-- Дахин ажиллуулахад эвдрэхгүй.

INSERT INTO public.platform_settings (key, value) VALUES
  ('ai_video_enabled', 'true'::jsonb),
  ('ai_video_price', '5000'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.ai_jobs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'photo';
ALTER TABLE public.ai_jobs ADD COLUMN IF NOT EXISTS video_op text NOT NULL DEFAULT '';
ALTER TABLE public.ai_jobs ADD COLUMN IF NOT EXISTS video_path text NOT NULL DEFAULT '';
ALTER TABLE public.ai_jobs ADD COLUMN IF NOT EXISTS video_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.ai_jobs ADD COLUMN IF NOT EXISTS source_job_id uuid REFERENCES public.ai_jobs(id) ON DELETE SET NULL;

DO $$
DECLARE c record;
BEGIN
  -- status-ын хуучин CHECK-ийг солино ('video_processing' нэмэгдэнэ)
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.ai_jobs'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%status%' LOOP
    EXECUTE format('ALTER TABLE public.ai_jobs DROP CONSTRAINT %I', c.conname);
  END LOOP;
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.ai_jobs'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%kind%' LOOP
    EXECUTE format('ALTER TABLE public.ai_jobs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.ai_jobs ADD CONSTRAINT ai_jobs_status_check
  CHECK (status IN ('pending_payment','paid','processing','generated','video_processing','done','failed','expired'));
ALTER TABLE public.ai_jobs ADD CONSTRAINT ai_jobs_kind_check CHECK (kind IN ('photo','video'));

NOTIFY pgrst, 'reload schema';
