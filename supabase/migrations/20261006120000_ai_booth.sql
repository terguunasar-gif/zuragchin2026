/*
  # AI Booth (AI зургийн бүүт)

  Арга хэмжээний цомог (album) дээр AI бүүт нэмнэ:
  - Зочин бүүтийн QR уншуулж → темплет сонгох → QPay төлөх → зураг дарах
  - Google Nano Banana 2 зураг үүсгэнэ → лого/бичиг кодоор давхарлана
  - Зочин зургаа хадгална, зөвшөөрвөл цомогт (хаалттай линк) нэмэгдэнэ

  ## Хүснэгтүүд
  1. ai_templates      — админы удирддаг темплетийн сан (prompt, жишээ зураг)
  2. album_ai_booths   — цомог тус бүрийн бүүтийн тохиргоо (лого, үнэ, темплетүүд, QR токен)
  3. ai_jobs           — нэг төлбөр = нэг зураг. Зочид нэвтрэхгүй тул бүх хандалт
                         `ai-booth` Edge Function-аар (service role) явагдана.

  ## Storage
  - ai-booth        (private) — эх селфи, AI түүхий зураг, эцсийн зураг
  - ai-booth-assets (public)  — темплетийн жишээ зураг, лавлах зураг, зохион байгуулагчийн лого

  Бүх өөрчлөлт нэмэлт (additive) бөгөөд дахин ажиллуулж болно (idempotent).
*/

-- ── Helper: admin мөн эсэх (users.role нь text[]) ───────────────────────────
CREATE OR REPLACE FUNCTION public.ai_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND 'admin' = ANY(u.role)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.ai_is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_is_admin() TO authenticated;

-- ── Helper: цомгийн эзэн эсвэл админ мөн эсэх ────────────────────────────────
-- SECURITY DEFINER тул albums/users хүснэгтийн RLS-ээс хамаарахгүй (давталтаас сэргийлнэ)
CREATE OR REPLACE FUNCTION public.ai_can_manage_album(p_album_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM public.albums a WHERE a.id = p_album_id AND a.owner_id = auth.uid())
      OR public.ai_is_admin();
$$;

REVOKE EXECUTE ON FUNCTION public.ai_can_manage_album(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_can_manage_album(uuid) TO authenticated;

-- ── photo_uploads: зургийн эх сурвалж ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'photo_uploads' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.photo_uploads ADD COLUMN source text NOT NULL DEFAULT 'upload';
  END IF;
END $$;

-- ============================================================
-- 1. AI TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text UNIQUE NOT NULL,
  name           text NOT NULL,
  description    text NOT NULL DEFAULT '',
  category       text NOT NULL DEFAULT 'general',
  -- Орчин, хувцас, гэрлийн тайлбар (англиар). Нүүр хадгалах дүрэм, хүний тооны
  -- байрлал, логоны хоосон зайг Edge Function автоматаар нэмнэ.
  scene_prompt   text NOT NULL,
  -- Хүний тоогоор байрлалыг дарж бичих (заавал биш): {"2": "...", "4": "..."}
  composition_overrides jsonb NOT NULL DEFAULT '{}',
  preview_url    text NOT NULL DEFAULT '',
  style_ref_url  text NOT NULL DEFAULT '',
  aspect_ratio   text NOT NULL DEFAULT '3:4'
    CHECK (aspect_ratio IN ('1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9')),
  max_people     int  NOT NULL DEFAULT 4 CHECK (max_people BETWEEN 1 AND 4),
  sort_order     int  NOT NULL DEFAULT 100,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active AI templates" ON public.ai_templates;
CREATE POLICY "Anyone can view active AI templates"
  ON public.ai_templates FOR SELECT
  TO anon, authenticated
  USING (is_active OR public.ai_is_admin());

DROP POLICY IF EXISTS "Admins manage AI templates" ON public.ai_templates;
CREATE POLICY "Admins manage AI templates"
  ON public.ai_templates FOR ALL
  TO authenticated
  USING (public.ai_is_admin())
  WITH CHECK (public.ai_is_admin());

-- ============================================================
-- 2. ALBUM AI BOOTH SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.album_ai_booths (
  album_id       uuid PRIMARY KEY REFERENCES public.albums(id) ON DELETE CASCADE,
  enabled        boolean NOT NULL DEFAULT false,
  -- Дэгцэн дээрх QR-ийн токен. Зөвхөн зураг ҮҮСГЭХ эрх өгнө, бусдын зургийг харуулахгүй.
  booth_token    text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  price_mnt      int  NOT NULL DEFAULT 5000 CHECK (price_mnt >= 0),
  -- Зохион байгуулагчид очих хувь (0–0.5). Зөвхөн админ өөрчилнө.
  owner_share    numeric(4,3) NOT NULL DEFAULT 0 CHECK (owner_share >= 0 AND owner_share <= 0.5),
  logo_url       text NOT NULL DEFAULT '',
  logo_position  text NOT NULL DEFAULT 'top-left',
  logo_size      int  NOT NULL DEFAULT 22 CHECK (logo_size BETWEEN 5 AND 60),
  overlay_text   text NOT NULL DEFAULT '',
  text_position  text NOT NULL DEFAULT 'bottom-center',
  text_color     text NOT NULL DEFAULT '#ffffff',
  template_ids   uuid[] NOT NULL DEFAULT '{}',
  -- Зочны зургийг цомогт нэмэх эсэх (зочин өөрөө бас зөвшөөрөх ёстой)
  add_to_album   boolean NOT NULL DEFAULT true,
  closes_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.album_ai_booths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view own album booth" ON public.album_ai_booths;
CREATE POLICY "Owners view own album booth"
  ON public.album_ai_booths FOR SELECT
  TO authenticated
  USING (
    public.ai_can_manage_album(album_id)
  );

DROP POLICY IF EXISTS "Owners insert own album booth" ON public.album_ai_booths;
CREATE POLICY "Owners insert own album booth"
  ON public.album_ai_booths FOR INSERT
  TO authenticated
  WITH CHECK (
    public.ai_can_manage_album(album_id)
  );

DROP POLICY IF EXISTS "Owners update own album booth" ON public.album_ai_booths;
CREATE POLICY "Owners update own album booth"
  ON public.album_ai_booths FOR UPDATE
  TO authenticated
  USING (
    public.ai_can_manage_album(album_id)
  )
  WITH CHECK (
    public.ai_can_manage_album(album_id)
  );

-- Үнэ, зохион байгуулагчийн хувь, токеныг зөвхөн админ (эсвэл service role) өөрчилнө
CREATE OR REPLACE FUNCTION public.ai_booth_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL OR public.ai_is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.price_mnt   := 5000;
    NEW.owner_share := 0;
    NEW.booth_token := replace(gen_random_uuid()::text, '-', '');
  ELSE
    NEW.price_mnt   := OLD.price_mnt;
    NEW.owner_share := OLD.owner_share;
    -- Токеныг зөвхөн ai_booth_rotate_token() функц солино
    IF coalesce(current_setting('ai_booth.rotate', true), '') <> 'on' THEN
      NEW.booth_token := OLD.booth_token;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_booth_guard_trg ON public.album_ai_booths;
CREATE TRIGGER ai_booth_guard_trg
  BEFORE INSERT OR UPDATE ON public.album_ai_booths
  FOR EACH ROW EXECUTE FUNCTION public.ai_booth_guard();

-- Бүүтийн QR-ийг шинэчлэх (хуучин QR ажиллахаа болино)
CREATE OR REPLACE FUNCTION public.ai_booth_rotate_token(p_album_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_token text := replace(gen_random_uuid()::text, '-', '');
BEGIN
  IF NOT (
    public.ai_can_manage_album(p_album_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  -- Энэ транзакцийн хүрээнд л guard trigger токен солихыг зөвшөөрнө
  PERFORM set_config('ai_booth.rotate', 'on', true);
  UPDATE public.album_ai_booths SET booth_token = v_token
   WHERE album_id = p_album_id;
  PERFORM set_config('ai_booth.rotate', '', true);
  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ai_booth_rotate_token(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_booth_rotate_token(uuid) TO authenticated;

-- ============================================================
-- 3. AI JOBS  (1 төлбөр = 1 зураг)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id         uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  template_id      uuid REFERENCES public.ai_templates(id) ON DELETE SET NULL,
  -- Зочны төхөөрөмжид л байх нууц түлхүүр (job-ийг удирдах эрх)
  access_key       text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  -- Үр дүнгийн хуудасны линк (/booth/r/:token) — зөвхөн энэ нэг зургийг харуулна
  result_token     text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status           text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','processing','generated','done','failed','expired')),
  amount_mnt       int  NOT NULL DEFAULT 0,
  owner_share      numeric(4,3) NOT NULL DEFAULT 0,
  qpay_invoice_id  text NOT NULL DEFAULT '',
  qpay_payment_id  text NOT NULL DEFAULT '',
  paid_at          timestamptz,
  people_count     int,
  input_path       text NOT NULL DEFAULT '',
  raw_path         text NOT NULL DEFAULT '',
  final_path       text NOT NULL DEFAULT '',
  attempts         int  NOT NULL DEFAULT 0,
  error            text NOT NULL DEFAULT '',
  add_to_album     boolean NOT NULL DEFAULT false,
  photo_upload_id  uuid REFERENCES public.photo_uploads(id) ON DELETE SET NULL,
  is_kiosk         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Эх селфи болон үр дүнг устгах хугацаа
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_album_id   ON public.ai_jobs(album_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_invoice    ON public.ai_jobs(qpay_invoice_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status     ON public.ai_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_expires_at ON public.ai_jobs(expires_at);

ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

-- Зочид (anon) болон зохион байгуулагч хүснэгтэд шууд хандахгүй (access_key нууц).
-- Зохион байгуулагч статистикаа ai_booth_stats() функцээр авна.
DROP POLICY IF EXISTS "Owners view AI jobs of own albums" ON public.ai_jobs;
DROP POLICY IF EXISTS "Admins view AI jobs" ON public.ai_jobs;
CREATE POLICY "Admins view AI jobs"
  ON public.ai_jobs FOR SELECT
  TO authenticated
  USING (public.ai_is_admin());

CREATE OR REPLACE FUNCTION public.ai_booth_stats(p_album_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT (
    public.ai_can_manage_album(p_album_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  SELECT jsonb_build_object(
    'paid_count',    count(*) FILTER (WHERE paid_at IS NOT NULL),
    'done_count',    count(*) FILTER (WHERE status = 'done'),
    'failed_count',  count(*) FILTER (WHERE status = 'failed'),
    'revenue_mnt',   coalesce(sum(amount_mnt) FILTER (WHERE paid_at IS NOT NULL), 0),
    'owner_mnt',     coalesce(sum(round(amount_mnt * owner_share)) FILTER (WHERE paid_at IS NOT NULL), 0)
  ) INTO v
  FROM public.ai_jobs WHERE album_id = p_album_id;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ai_booth_stats(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_booth_stats(uuid) TO authenticated;

-- ============================================================
-- 4. STORAGE
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ai-booth', 'ai-booth', false, 15728640, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ai-booth-assets', 'ai-booth-assets', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- ai-booth: зөвхөн service role (Edge Function). Policy шаардлагагүй.

-- ai-booth-assets: олон нийт уншина; хэрэглэгч өөрийн хавтас (uid/...) руу,
-- админ templates/ хавтас руу бичнэ.
DROP POLICY IF EXISTS "Public read ai-booth-assets" ON storage.objects;
CREATE POLICY "Public read ai-booth-assets"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'ai-booth-assets');

DROP POLICY IF EXISTS "Users upload own ai-booth-assets" ON storage.objects;
CREATE POLICY "Users upload own ai-booth-assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ai-booth-assets'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR ((storage.foldername(name))[1] = 'templates' AND public.ai_is_admin())
    )
  );

DROP POLICY IF EXISTS "Users update own ai-booth-assets" ON storage.objects;
CREATE POLICY "Users update own ai-booth-assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'ai-booth-assets'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR ((storage.foldername(name))[1] = 'templates' AND public.ai_is_admin())
    )
  );

DROP POLICY IF EXISTS "Users delete own ai-booth-assets" ON storage.objects;
CREATE POLICY "Users delete own ai-booth-assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ai-booth-assets'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR ((storage.foldername(name))[1] = 'templates' AND public.ai_is_admin())
    )
  );

-- ============================================================
-- 5. SEED: Шинэ жилийн 20 темплет
--    scene_prompt нь зөвхөн орчин/хувцас/гэрлийг тайлбарлана.
--    Нүүр хадгалах дүрэм, байрлал, логоны зай кодоор нэмэгдэнэ.
-- ============================================================
INSERT INTO public.ai_templates (slug, name, description, category, scene_prompt, sort_order) VALUES
-- Шинэ жил, өвөл
('snowy-night', 'Цасан ширхэгт шөнө', 'Цас орж буй гудамж, гэрэлт чимэглэл', 'winter',
 'A charming city street on a snowy winter night. Gentle snowflakes falling, warm string lights and glowing shop windows softly blurred in the background (bokeh). The people wear cozy winter coats and knitted scarves. Soft warm key light on the faces, cool blue ambient night tones.', 10),
('christmas-tree', 'Гацуурын дэргэд', 'Чимэглэсэн гацуур, бэлэг, гэрийн дулаан орчин', 'winter',
 'A cozy, elegant living room with a tall, richly decorated New Year tree covered in golden and red ornaments and warm fairy lights, wrapped gifts at its base. The people wear festive smart-casual clothes in deep red, green or cream knitwear. Warm, soft indoor lighting.', 20),
('winter-forest', 'Өвлийн үлгэрийн ой', 'Цастай нарсан ой, үлгэрийн гэрэл', 'winter',
 'A magical snow-covered pine forest at blue hour, frosted branches, tiny floating light particles and a soft glow between the trees like a fairy tale. The people wear elegant winter outfits: long wool coats, fur-trimmed hoods, soft gloves. Dreamy cinematic lighting.', 30),
('fireworks', 'Шинэ жилийн салют', 'Шөнийн тэнгэрт салют, хотын гэрэл', 'winter',
 'A festive New Year''s Eve night on a rooftop terrace overlooking a city skyline, colorful fireworks bursting in the dark sky behind. The people wear stylish evening party outfits. Light from the fireworks and warm terrace lamps illuminates their faces. Celebratory, joyful mood.', 40),
('ice-palace', 'Мөсөн ордон', 'Мөс, болор, цэнхэр гэрэлтэй тансаг өрөө', 'winter',
 'A luxurious ice palace hall with crystal-clear ice columns, sparkling chandeliers of ice crystals and a cool blue and silver glow. The people wear elegant formal attire in silver, white and icy blue tones. Glamorous high-key lighting with subtle sparkle.', 50),
('winter-costume', 'Өвлийн үлгэрийн хувцас', 'Өвөл өвгөн, Цасан охины маягийн хувцас', 'winter',
 'A festive winter fairy-tale scene with a decorated sleigh and snowy birch trees. Dress the people in classic winter fairy-tale costumes: long embroidered velvet coats in red, white or icy blue with white fur trim and ornate hats or crowns, in the style of traditional Grandfather Frost and Snow Maiden costumes (generic, not any specific film character). Warm magical lighting.', 60),
('fireplace', 'Дулаахан зуух', 'Задгай зуух, какао, зөөлөн хөнжил', 'winter',
 'A warm cabin interior beside a crackling stone fireplace, soft blankets, mugs of hot cocoa, candles and pine garlands. The people wear cozy chunky knit sweaters. Golden firelight glow on the faces, intimate and warm family atmosphere.', 70),
('retro-newyear', 'Ретро шинэ жил', '80-аад оны шинэ жилийн ил захидал', 'winter',
 'A nostalgic 1980s New Year greeting card scene: vintage tinsel, old glass ornaments, a classic decorated tree and a retro living room. The people wear 1980s festive fashion. Slightly faded warm film colors, soft grain, retro photo-studio lighting.', 80),
-- Байгууллагын үдэшлэг
('red-carpet', 'Улаан хивсний гала', 'Тансаг даашинз, костюм, камерын гялбаа', 'party',
 'A glamorous red carpet gala event with a soft-focus backdrop of camera flashes and elegant golden lights. The people wear luxurious evening wear: tailored black tuxedos or suits and elegant evening gowns. Professional red carpet photography lighting.', 90),
('golden-party', 'Алтан үдэшлэг', 'Алтан өнгө, шампан, тансаг танхим', 'party',
 'An opulent New Year party in a grand ballroom with gold and champagne tones, golden balloons, glittering confetti in the air and warm chandeliers. The people wear elegant party attire with gold and black accents. Rich warm lighting, celebratory luxury mood.', 100),
('gatsby', 'Gatsby маягийн үдэшлэг', '1920-иод оны хувцас, жааз', 'party',
 'A roaring 1920s art-deco party with geometric gold decorations, a jazz band softly blurred in the background and champagne towers. Dress the people in 1920s fashion: sharp three-piece suits and bow ties, flapper dresses with beads and feathered headbands. Warm vintage glamour lighting.', 110),
('magazine-cover', 'Сэтгүүлийн нүүр', 'Сэтгүүлийн нүүрний хөрөг', 'party',
 'A high-end fashion magazine cover photoshoot in a clean professional studio with a seamless backdrop in a rich solid color. The people wear chic modern fashion styled by a professional stylist. Crisp beauty-dish lighting, confident editorial poses, polished look.', 120),
('monochrome', 'Хар цагаан урлагийн хөрөг', 'Тансаг хар цагаан студийн хөрөг', 'party',
 'A timeless fine-art black and white studio portrait with dramatic but flattering lighting and a dark seamless backdrop. The people wear elegant dark formal clothing. Rich tonal range, deep blacks, soft highlights. The whole image is black and white.', 130),
-- Монгол соёл
('deel-winter', 'Дээлтэй өвөл', 'Монгол дээл, малгай, цастай тал, гэр', 'mongolian',
 'The vast snowy Mongolian steppe at golden hour with a traditional white ger (yurt) and distant mountains. Dress the people in beautiful traditional Mongolian winter deel made of rich silk brocade with fur-lined collars, traditional sash belts and fur hats. Warm low sun on the faces, majestic atmosphere.', 140),
('tsagaan-sar', 'Цагаан сар', 'Ширээ засал, ул боов, дээл', 'mongolian',
 'A festive Tsagaan Sar (Mongolian Lunar New Year) celebration inside a richly decorated ger with a traditional table of layered ul boov pastries, dairy treats and ornate silver bowls. Dress the people in elegant traditional Mongolian deel in bright silk colors with sashes. Warm, joyful indoor light.', 150),
('khaan-palace', 'Хаадын ордон', 'Эзэн хааны үеийн тансаг хувцас', 'mongolian',
 'A majestic palace hall of the Mongol Empire with ornate golden pillars, rich red and gold textiles and traditional patterns. Dress the people in regal Mongol Empire-era royal attire: ornate brocade robes, golden embroidery, noble headwear. Dramatic warm cinematic lighting.', 160),
('year-of-sheep', 'Хонин жил', '2027 оны зурхайн жилийн баярын зураг', 'mongolian',
 'A festive Lunar New Year scene for the Year of the Sheep: soft white wool textures, auspicious traditional ornaments in red and gold, gentle snow outside a window and a calm happy atmosphere. The people wear festive clothes in red, gold and white. Warm celebratory lighting.', 170),
-- Хөгжилтэй
('animation-3d', 'Анимэйшн кино', 'Ерөнхий 3D анимэйшн дүр', 'fun',
 'Transform the scene into a high-quality 3D animated feature film style (generic stylized animation, not any specific studio or character): a cheerful snowy village square with colorful festive lights. Render the people as stylized 3D animated characters while keeping each person clearly recognizable: same face shape, hairstyle, skin tone and expression.', 180),
('neon-newyear', 'Неон шинэ жил', 'Неон гэрэл, клубын уур амьсгал', 'fun',
 'A stylish New Year night club scene with vibrant pink, purple and cyan neon lights, glossy reflections and floating glitter. The people wear trendy party outfits with metallic accents. Colorful neon rim light with clean flattering light on the faces.', 190),
('vintage-postcard', 'Хуучин ил захидал', 'Хальсан зургийн өнгөтэй мэндчилгээний карт', 'fun',
 'A vintage hand-tinted New Year postcard style: snowy village, holly, ribbons and a decorative ornamental border feel. The people wear classic early-20th-century winter clothing. Soft film grain, gentle sepia and pastel hand-colored tones.', 200)
ON CONFLICT (slug) DO NOTHING;
