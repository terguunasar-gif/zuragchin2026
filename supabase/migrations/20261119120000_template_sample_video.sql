-- update-90: Админ загварын AI жишээ зургаас жишээ видеог fal.ai-аар үүсгэнэ.
-- sample_op = боловсруулж буй fal/Veo operation (хоосон = үүсгээгүй / дууссан). Дахин ажиллуулахад эвдрэхгүй.
ALTER TABLE public.ai_video_templates
  ADD COLUMN IF NOT EXISTS sample_op text NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
