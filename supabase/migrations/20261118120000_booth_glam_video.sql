-- update-86: AI бүүтийн видео — «✨ Slow-motion Glam» төрөл
--
-- Зочин сэлфигээ оруулж темплетээр AI зураг бүтээлгээд, түүнийгээ хоёр төрлийн видео болгож болно:
--   video_style = 'motion' (анхдагч, хуучнаараа) — AI зурагт тохирох хөдөлгөөн сонгоно (бүжиг, хөөс…)
--   video_style = 'glam'                         — Glambot маягийн удаашруулсан кино камер, хүмүүс байрлалаа хадгална
-- Үнэ хоёуланд ижил (platform_settings.ai_video_price). Дахин ажиллуулахад эвдрэхгүй.

ALTER TABLE public.ai_jobs
  ADD COLUMN IF NOT EXISTS video_style text NOT NULL DEFAULT 'motion';

DO $$ BEGIN
  ALTER TABLE public.ai_jobs
    ADD CONSTRAINT ai_jobs_video_style_check CHECK (video_style IN ('motion', 'glam'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
