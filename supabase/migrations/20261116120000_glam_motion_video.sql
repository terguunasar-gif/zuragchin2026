-- update-84: «✨ Glam Motion» — Glambot маягийн удаашруулсан кино камерын видео
--
-- Шинэ видео систем үүсгэхгүй: одоо байгаа «Цомгийн AI видео» (album-video, update-66) дээр
-- загварын төрөл нэмнэ:
--   style = 'action' (анхдагч) — эхний 2 сек зураг царцсан, дараа нь загварын үйлдэл (хуучнаараа)
--   style = 'glam'             — бүхэлдээ slow-motion, камер аажим хөдөлнө, үс/даавуу намирна (6 сек)
--
-- Үнэ, орлогын хуваарилалт, QPay, хадгалалт, «🎬 AI видео» хавтас, дэлгэцийн горим — бүгд хуучнаараа.
-- Дахин ажиллуулахад эвдрэхгүй (slug давхардвал алгасна).

ALTER TABLE public.ai_video_templates
  ADD COLUMN IF NOT EXISTS style text NOT NULL DEFAULT 'action';

DO $$ BEGIN
  ALTER TABLE public.ai_video_templates
    ADD CONSTRAINT ai_video_templates_style_check CHECK (style IN ('action', 'glam'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- prompt = зөвхөн «камерын хөдөлгөөн + эффект» (англиар). Удаашруулалт, царай хадгалах,
-- гэрэлтүүлэг, дууны дүрмийг Edge Function (glamPrompt) өөрөө нэмнэ.
INSERT INTO public.ai_video_templates (slug, name, description, emoji, prompt, tags, sort_order, style) VALUES
  ('glam-push-in', 'Glam ойртолт',
   'Камер аажим ойртож, үс, даавуу удаан намирна. Ямар ч зурагт тохирно.',
   '✨',
   'A very slow, smooth dolly push-in toward the people with a slight upward arc. A soft breeze lifts hair and fabric in slow motion; tiny golden dust particles float and sparkle in the light.',
   'Бүх арга хэмжээ', 5, 'glam'),

  ('glam-parallax-drift', 'Гүн parallax',
   'Камер хажуу тийш гулсаж, урд ба арын төлөвлөгөө тусдаа хөдөлж 3D мэт харагдана.',
   '🌀',
   'The camera glides slowly sideways from left to right while gently pushing in, creating strong 3D parallax: the people stay sharp while the background drifts behind them and soft bokeh lights shimmer.',
   'Бүх арга хэмжээ, гэрэлтэй орчин', 6, 'glam'),

  ('glam-confetti', 'Алтан конфетти',
   'Алтан конфетти удаашралтай бороо мэт асгарч, камер аажим холдоно.',
   '🎊',
   'Shimmering gold and champagne-coloured confetti rains down around the people in super slow motion, catching the light. The camera slowly pulls back to reveal the whole scene.',
   'Шинэ жил, төрсөн өдөр, ой', 7, 'glam'),

  ('glam-red-carpet', 'Улаан хивс',
   'Фото флашууд тасралтгүй гялсхийж, камер нүүр рүү аажим ойртоно.',
   '📸',
   'Red-carpet atmosphere: bright photographer flashes pop around the people in slow motion with subtle lens flares; the camera performs a slow, elegant push-in to a medium close-up.',
   'Гала үдэшлэг, шагнал гардуулах', 8, 'glam'),

  ('glam-champagne', 'Шампан тост',
   'Хундага тулгах агшин, дусал цацрах нь удаашралтай.',
   '🥂',
   'The glasses or drinks in hand gently clink together in extreme slow motion; sparkling droplets and bubbles fly through the air and glitter in the light while the camera slowly circles a few degrees.',
   'Хурим, ой, корпорат үдэшлэг', 9, 'glam'),

  ('glam-twirl', 'Даашинзны эргэлт',
   'Даашинз, дээл, хормой удаан эргэлдэж намирна.',
   '💃',
   'The clothing — dresses, deel, skirts and scarves — swirls and flows gracefully in slow motion as if caught in a gentle spinning breeze, while the camera rises slowly from a low angle.',
   'Хурим, төгсөлт, гоо сайхан', 10, 'glam'),

  ('glam-snow', 'Өвлийн гялбаа',
   'Цасан ширхэг удаан бууж, гэрлүүд анивчина. Шинэ жилд.',
   '❄️',
   'Large soft snowflakes drift down slowly in front of the camera and catch warm festive lights; fairy lights twinkle in the background bokeh while the camera slowly cranes upward.',
   'Шинэ жил, өвлийн арга хэмжээ', 11, 'glam'),

  ('glam-hair-wind', 'Салхин үс',
   'Үс салхинд удаан хийсэж, камер бага зэрэг эргэлдэнэ — Glambot-ын сонгодог.',
   '🌬️',
   'A cinematic wind machine blows from the side: hair whips and flows beautifully in extreme slow motion, fabric ripples, and the camera arcs slowly around the people by a few degrees.',
   'Гоо сайхан, фэшн, төгсөлт', 12, 'glam')
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
