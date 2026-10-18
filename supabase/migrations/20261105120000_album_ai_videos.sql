-- update-66: Цомгийн AI видео загварууд
--
-- Цомгийн эзэн цомгийнхоо зургийг сонгоод «Видео үүсгэх» → загвар сонгоно → QPay-ээр төлнө →
-- Google Veo Fast (720p, 8 сек)-оор видео бүтээгдэнэ: эхний ~2 секунд зураг хөдөлгөөнгүй, дараа нь
-- загварын үйлдэл эхэлнэ. Бэлэн видео цомгийн «🎬 AI видео» хавтсанд орж, дэлгэцийн горимд (LED/ТВ) гарна.
--
-- Орлого: үнэ (анхдагч 10,000₮)-ийн album_video_owner_share (анхдагч 10%) цомгийн эзний хэтэвчинд,
-- үлдсэн нь сайтад.
-- Дахин ажиллуулахад эвдрэхгүй.

-- ── Тохиргоо ─────────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value) VALUES
  ('album_video_enabled', 'true'::jsonb),
  ('album_video_price', '10000'::jsonb),
  ('album_video_owner_share', '0.1'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 1. Видео загварууд ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_video_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text UNIQUE NOT NULL,
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  emoji            text NOT NULL DEFAULT '🎬',
  -- Үйлдлийн тайлбар (англиар). «Эхний 2 сек хөдөлгөөнгүй», царай хадгалах дүрмийг Edge Function нэмнэ.
  prompt           text NOT NULL,
  -- Жишээ видео / зураг (галерейд харуулна)
  sample_video_url text NOT NULL DEFAULT '',
  preview_url      text NOT NULL DEFAULT '',
  tags             text NOT NULL DEFAULT '',
  sort_order       int  NOT NULL DEFAULT 100,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_video_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active video templates" ON public.ai_video_templates;
CREATE POLICY "Anyone can view active video templates"
  ON public.ai_video_templates FOR SELECT TO anon, authenticated
  USING (is_active OR public.ai_is_admin());

DROP POLICY IF EXISTS "Admins manage video templates" ON public.ai_video_templates;
CREATE POLICY "Admins manage video templates"
  ON public.ai_video_templates FOR ALL TO authenticated
  USING (public.ai_is_admin()) WITH CHECK (public.ai_is_admin());

GRANT SELECT ON public.ai_video_templates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_video_templates TO authenticated;

-- ── 2. Цомгийн видеонууд ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.album_ai_videos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id         uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  photo_id         uuid REFERENCES public.photo_uploads(id) ON DELETE SET NULL,
  template_id      uuid REFERENCES public.ai_video_templates(id) ON DELETE SET NULL,
  template_name    text NOT NULL DEFAULT '',
  created_by       uuid NOT NULL,
  status           text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','processing','done','failed','expired','deleted')),
  amount_mnt       int  NOT NULL DEFAULT 0 CHECK (amount_mnt >= 0),
  owner_share      numeric(4,3) NOT NULL DEFAULT 0 CHECK (owner_share >= 0 AND owner_share <= 1),
  qpay_invoice_id  text NOT NULL DEFAULT '',
  qpay_payment_id  text NOT NULL DEFAULT '',
  paid_at          timestamptz,
  aspect_ratio     text NOT NULL DEFAULT '16:9' CHECK (aspect_ratio IN ('16:9','9:16')),
  video_op         text NOT NULL DEFAULT '',
  video_attempts   int  NOT NULL DEFAULT 0,
  video_url        text NOT NULL DEFAULT '',
  poster_url       text NOT NULL DEFAULT '',
  error            text NOT NULL DEFAULT '',
  -- Эзэн цомгоос нуух / дэлгэцийн горимд харуулахгүй байх
  hidden           boolean NOT NULL DEFAULT false,
  show_on_screen   boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS album_ai_videos_album_idx ON public.album_ai_videos(album_id, created_at DESC);
CREATE INDEX IF NOT EXISTS album_ai_videos_invoice_idx ON public.album_ai_videos(qpay_invoice_id) WHERE qpay_invoice_id <> '';
ALTER TABLE public.album_ai_videos ENABLE ROW LEVEL SECURITY;

-- Эзэн (ба админ) өөрийн цомгийн бүх видеог (боловсруулж буйг ч) харна. Бичих нь зөвхөн Edge Function / RPC-ээр.
DROP POLICY IF EXISTS "Owners view album videos" ON public.album_ai_videos;
CREATE POLICY "Owners view album videos"
  ON public.album_ai_videos FOR SELECT TO authenticated
  USING (public.ai_can_manage_album(album_id));
REVOKE ALL ON public.album_ai_videos FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.album_ai_videos FROM authenticated;
GRANT SELECT ON public.album_ai_videos TO authenticated;

-- ── 3. Олон нийтэд: бэлэн видеонууд (түгжээтэй цомогт код шаардана) ──────────
DROP FUNCTION IF EXISTS public.album_ai_videos_public(uuid, text);
CREATE FUNCTION public.album_ai_videos_public(p_album_id uuid, p_token text DEFAULT NULL)
RETURNS TABLE (id uuid, template_name text, video_url text, poster_url text,
               aspect_ratio text, show_on_screen boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.template_name, v.video_url, v.poster_url, v.aspect_ratio, v.show_on_screen, v.created_at
    FROM public.album_ai_videos v
    JOIN public.albums a ON a.id = v.album_id
   WHERE v.album_id = p_album_id
     AND v.status = 'done' AND NOT v.hidden AND v.video_url <> ''
     AND a.status = 'active'
     AND public.album_lock_state(p_album_id, p_token) IN ('open', 'ok', 'bypass')
   ORDER BY v.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.album_ai_videos_public(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.album_ai_videos_public(uuid, text) TO anon, authenticated;

-- ── 4. Эзэн: нуух / дэлгэцэнд харуулах эсэх ─────────────────────────────────
DROP FUNCTION IF EXISTS public.set_album_video_flags(uuid, boolean, boolean);
CREATE FUNCTION public.set_album_video_flags(p_id uuid, p_hidden boolean DEFAULT NULL, p_show_on_screen boolean DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_album uuid;
BEGIN
  SELECT album_id INTO v_album FROM public.album_ai_videos WHERE id = p_id;
  IF v_album IS NULL OR NOT public.ai_can_manage_album(v_album) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE public.album_ai_videos
     SET hidden = COALESCE(p_hidden, hidden),
         show_on_screen = COALESCE(p_show_on_screen, show_on_screen),
         updated_at = now()
   WHERE id = p_id;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_album_video_flags(uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_album_video_flags(uuid, boolean, boolean) TO authenticated;

-- ── 5. Storage: олон нийт уншдаг видео сан (дэлгэцийн горимд шууд тоглуулна) ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('album-ai-videos', 'album-ai-videos', true, 62914560,
        ARRAY['video/mp4','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true, file_size_limit = 62914560,
      allowed_mime_types = ARRAY['video/mp4','image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS "Public read album-ai-videos" ON storage.objects;
CREATE POLICY "Public read album-ai-videos"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'album-ai-videos');

-- Админ жишээ видеог samples/ хавтсанд байршуулна
DROP POLICY IF EXISTS "Admins upload video samples" ON storage.objects;
CREATE POLICY "Admins upload video samples"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'album-ai-videos' AND (storage.foldername(name))[1] = 'samples' AND public.ai_is_admin());
DROP POLICY IF EXISTS "Admins delete video samples" ON storage.objects;
CREATE POLICY "Admins delete video samples"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'album-ai-videos' AND (storage.foldername(name))[1] = 'samples' AND public.ai_is_admin());

-- ── 6. Эхний 20 загвар ───────────────────────────────────────────────────────
INSERT INTO public.ai_video_templates (slug, name, description, emoji, prompt, tags, sort_order) VALUES
('green-giant', 'Ногоон аварга', 'Нэг хүн том булчинлаг ногоон аварга болж, цамц нь урагдана. Бусад нь цочиж ухарна.', '💚',
 'One person in the photo (preferably a man) suddenly transforms into a huge, muscular, green-skinned giant: his body grows bigger, his muscles bulge, his shirt rips apart at the seams and his skin turns bright green, while his face stays recognisable. He gives a playful roar and flexes his arms. The other people jump back in surprise, then laugh and point at him. Photorealistic, cinematic.',
 'Бүгд', 10),
('deel-magic', 'Дээлтэй болох', 'Бүгдийн хувцас гэнэт гоёмсог монгол дээл болж, алтан оч цацарна.', '🧥',
 'Golden sparkles swirl around everyone and their clothes magically transform into elegant traditional Mongolian deel robes in rich colours, with silk sashes and embroidered patterns. Everyone looks down at their new clothes, smiles in delight and poses proudly. Photorealistic, warm festive light.',
 'Цагаан сар, наадам', 20),
('wrestler-eagle', 'Бөхийн дэвээ', 'Эрэгтэйчүүд бөхийн хувцастай болж, бүргэдийн дэвээ хийнэ. Бусад нь алга ташина.', '🦅',
 'The men''s clothes magically change into traditional Mongolian wrestling outfits — a short open-chest zodog jacket, shuudag briefs and upturned gutal boots — and they perform the slow wrestlers'' eagle dance, raising and flapping their arms like soaring eagles. Everyone else claps and cheers. Photorealistic.',
 'Наадам, байгууллага', 30),
('disco', 'Диско тэсрэлт', 'Дээрээс диско бөмбөг бууж, бүгд нэгэн зэрэг бүжиглэнэ.', '🪩',
 'A glittering mirror disco ball drops down from above, colourful party lights sweep across the scene and everyone starts dancing together energetically to the beat — grooving, pointing up and waving their arms. Photorealistic, fun party atmosphere.',
 'Үдэшлэг, төгсөлт', 40),
('space-float', 'Сансрын жин алдалт', 'Өрөө сансар болж, бүгд скафандртай хөвж эргэлдэнэ.', '🚀',
 'The surroundings dissolve into outer space full of stars with a glowing blue planet in the background. Everyone becomes weightless; their clothes turn into white astronaut suits without helmets, and they float upwards and slowly spin, laughing and reaching for each other. Photorealistic, cinematic.',
 'Бүгд', 50),
('underwater', 'Усан доорх ертөнц', 'Өрөөнд ус дүүрч, загас сэлж, хөөс гарна. Үс нь усанд хөвнө.', '🐠',
 'Water quickly fills the scene; bubbles rise, colourful tropical fish and a friendly sea turtle swim past, and everyone''s hair floats gently in the water as they look around in amazement and wave at the fish. Photorealistic, soft blue underwater light.',
 'Бүгд', 60),
('ice-statue', 'Мөсөн хаант улс', 'Мөс тархаж бүгд мөсөн хөшөө болно, тэгээд гялалзан хагарч чөлөөлөгдөнө.', '🧊',
 'Frost spreads over the whole image and everyone freezes into glistening, transparent ice statues; then the ice cracks and shatters into sparkling shards, and they burst free, laughing and shaking the frost off their shoulders. Photorealistic, cinematic.',
 'Шинэ жил, өвөл', 70),
('snowman', 'Цасан хүн', 'Нэг хүнийг тойрон цас эргэлдэж, инээдтэй цасан хүн болно.', '⛄',
 'A swirl of snow whirls around one person and turns them into a cute, round snowman with a carrot nose, coal buttons and a knitted scarf, whose eyes still blink happily. The other people laugh and gently pat the snowman''s head as snowflakes fall. Photorealistic, winter mood.',
 'Шинэ жил', 80),
('cake-face', 'Бялуу нүүр рүү', 'Гэнэт бялуу нисэж ирээд нэг хүний нүүрэнд буун тусна, бүгд инээлдэнэ.', '🎂',
 'A big cream birthday cake flies into the frame and lands with a soft splat on one person''s face. Cream covers their face; they slowly wipe it off and start laughing, and everyone around them bursts into laughter. Photorealistic, comedic.',
 'Төрсөн өдөр', 90),
('clone-dance', 'Клон бүжиг', 'Нэг хүн 5 хуулбар болж олшроод хамтдаа бүжиглэнэ.', '👯',
 'One person suddenly multiplies into five identical copies of themselves, who step out to the sides and perform a perfectly synchronised dance routine together, while the other people stare in amazement and then cheer. Photorealistic, fun.',
 'Үдэшлэг', 100),
('robot', 'Робот болох', 'Нэг хүн мөнгөлөг робот болж робот бүжиг хийнэ.', '🤖',
 'One person''s body turns into shiny silver metal with glowing blue lines like a friendly robot, while their face stays recognisable, and they perform a funny, jerky robot dance; the other people copy the robot moves and laugh. Photorealistic, playful.',
 'Бүгд', 110),
('cartoon', 'Хүүхэлдэйн кино', 'Бүгд 3D хүүхэлдэйн киноны дүр болж хувираад гараа даллана.', '🎨',
 'With a magical shimmer, everyone transforms into colourful 3D animated cartoon characters with big expressive eyes, keeping their hairstyles, clothing colours and recognisable features, and they bounce happily and wave at the camera. High-quality 3D animation style.',
 'Бүгд', 120),
('silent-film', 'Хуучин хар цагаан кино', 'Дүрс хар цагаан болж, 1920-иод оны чимээгүй кино шиг хурдан, инээдтэй хөдөлнө.', '🎞️',
 'The image turns black-and-white with old film grain, flicker and scratches, like a 1920s silent movie. Everyone moves in fast, jerky, comical motions — an exaggerated bow, a funny stumble, a tip of an imaginary hat — like slapstick comedians. Old piano music.',
 'Бүгд', 130),
('money-rain', 'Мөнгөн бороо', 'Дээрээс мөнгөн дэвсгэрт бороо шиг асгарч, бүгд баярлан шүүрнэ.', '💸',
 'Banknotes start raining down from above. Everyone looks up in delight and excitedly tries to catch the falling money, throwing handfuls into the air and laughing. Photorealistic, celebratory.',
 'Байгууллага, шагнал', 140),
('camel-visit', 'Тэмээ зочилно', 'Хажуунаас инээдтэй тэмээ орж ирээд нэг хүнийг үнэрлэнэ.', '🐫',
 'A friendly, funny two-humped Bactrian camel pokes its head into the frame from the side, curiously sniffs one person and gives them a playful lick on the cheek. Everyone jumps in surprise and bursts out laughing. Photorealistic, comedic.',
 'Бүгд', 150),
('giant-kitten', 'Аварга муур', 'Дээрээс аварга том хөөрхөн муурын сарвуу орж ирээд нэг хүнийг тоглож түлхэнэ.', '🐱',
 'A gigantic, fluffy, cute kitten paw reaches into the frame from above and playfully pats one person on the head as if they were a tiny toy; everyone looks up in shock, then laughs. Photorealistic, whimsical.',
 'Бүгд', 160),
('balloons', 'Бөмбөлгөөр нисэх', 'Хүн бүрийн гарт өнгийн бөмбөлөг гарч ирээд бүгдийг дээш хөөргөнө.', '🎈',
 'Bunches of colourful helium balloons appear in everyone''s hands and gently lift them off the ground; they float upwards, kicking their feet and laughing with joy. Photorealistic, joyful.',
 'Хүүхдийн өдөр, төрсөн өдөр', 170),
('golden-dragon', 'Луу нисэн өнгөрөх', 'Ард нь найрсаг алтан луу нисэн өнгөрч, бүгдийн үс салхинд хийснэ.', '🐉',
 'A friendly golden Asian dragon with a long glittering body flies past behind the group; a gust of wind from it blows everyone''s hair and clothes, and they turn to look at it and cheer. Photorealistic, cinematic, epic.',
 'Шинэ жил, Цагаан сар', 180),
('flower-bloom', 'Цэцгийн дэлбэрэлт', 'Эргэн тойронд цэцэг дэлгэрч, эрвээхэй нисэж, зүрхэн салют буудна.', '🌸',
 'Flowers bloom all around them, petals swirl through the air, butterflies flutter past, and golden heart-shaped fireworks burst behind them as they smile warmly at each other. Photorealistic, romantic.',
 'Хурим, сүй тавих', 190),
('time-stop', 'Цаг зогсоох', 'Бүгд хөлдсөн байхад нэг хүн л хөдөлж, бусдыг хуруугаараа «тоншино».', '⏱️',
 'Everyone stays perfectly frozen in time, except one person who comes alive, looks around in surprise, then walks among the frozen people and playfully pokes their cheeks while they stay completely still. Photorealistic, cinematic.',
 'Бүгд', 200)
ON CONFLICT (slug) DO NOTHING;
