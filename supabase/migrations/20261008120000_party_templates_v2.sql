/*
  # Үдэшлэгийн темплетүүд v2 (тансаг 10 темплет)

  - Хуучин "Үдэшлэг" ангиллын 5 темплетийг идэвхгүй болгоно (устгахгүй)
  - Шинэ 10 темплет нэмнэ / шинэчилнэ. Дахин ажиллуулахад аюулгүй.
  - Брэнд, барааны тэмдэг (машины лого, шагналын хөшөө, сэтгүүлийн нэр) ашиглахгүй.
*/

ALTER TABLE public.ai_templates ADD COLUMN IF NOT EXISTS allow_text boolean NOT NULL DEFAULT false;

UPDATE public.ai_templates SET is_active = false, updated_at = now()
WHERE slug IN ('red-carpet','golden-party','gatsby','magazine-cover','monochrome');

INSERT INTO public.ai_templates
  (slug, name, description, category, scene_prompt, composition_overrides, aspect_ratio, max_people, sort_order, allow_text, is_active, preview_url)
VALUES
-- 1. Тансаг машин дотор
('party-car-interior', 'Тансаг машин дотор', 'Тансаг машины жолооны ард, нар жаргах тэнгэр', 'party',
 'Inside a luxury executive sedan with a panoramic glass roof, black quilted leather seats, brushed metal and wood trim and a glowing digital dashboard — no visible brand logos or badges. Outside the windows and through the glass roof a dramatic orange-gold sunset sky with dark clouds. Outfits: men in a tailored light-grey suit with an open white shirt and a luxury steel watch; women in an elegant silk blouse or tailored blazer with fine jewelry. Confident, successful "boss" mood, cinematic wide-angle shot from the passenger side, warm sunset light on the faces.',
 '{"1":"Exactly 1 person sitting in the driver seat, one hand on the steering wheel, looking confidently at the camera.","2":"Exactly 2 people: one in the driver seat with a hand on the wheel, the other in the front passenger seat; both look at the camera.","3":"Exactly 3 people: one in the driver seat, one in the front passenger seat, one leaning forward between the front seats from the back; all look at the camera.","4":"Exactly 4 people: two in the front seats and two leaning forward from the back seats between them; all faces clearly visible."}',
 '4:5', 4, 20, false, true, ''),

-- 2. Тансаг зочид буудлын өмнө
('party-hotel-car', 'Зочид буудлын өмнө', 'Шөнийн хот, тансаг машин, таван одтой зочид буудал', 'party',
 'Night in a glamorous big city: the golden entrance of a grand five-star hotel with a glowing canopy, crystal chandeliers and a brass revolving door, neon pink and blue reflections on the wet street, skyscrapers and light trails behind. A gleaming deep-blue luxury limousine sedan with chrome wheels parked at the curb — no visible brand logos, badges or readable signs. The people pose confidently next to the car. Outfits: women in a sharp sequined tuxedo blazer with tailored trousers, statement gold jewelry and stiletto heels (sunglasses optional); men in a black velvet tuxedo jacket and polished shoes. Low-angle full-body fashion shot, cinematic neon and gold lighting.',
 '{}', '3:4', 4, 21, false, true, ''),

-- 3. Улаан хивс
('party-red-carpet', 'Улаан хивс', 'Кино нээлтийн улаан хивс, гэрэл зурагчид, камерын гялбаа', 'party',
 'A glamorous film-premiere red carpet at night: long red carpet with gold stanchions and red velvet ropes, a wall of press photographers behind the ropes with cameras flashing, bright spotlights, a sparkling marquee with warm bulbs (no readable words, no award statuettes or trademarks), gold confetti in the air. Outfits: women in a floor-length couture gown (shimmering gold sequins or deep royal-blue satin) with a sweeping train and diamond earrings — elegant, not revealing; men in a perfectly tailored black three-piece suit or tuxedo with a burgundy tie and pocket square. Confident red-carpet poses (hand on hip, a wave, a glance over the shoulder). Full-body, cinematic flash lighting, celebrity glamour.',
 '{}', '1:1', 4, 22, false, true, ''),

-- 4. Оргилуун дарс
('party-champagne', 'Оргилуун дарс', 'Шинэ жилийн шөнө оргилуун дарсны хөөс цацруулж байна', 'party',
 'An explosive New Year countdown party at midnight in a luxury club: colorful stage lights, gold and silver confetti, glitter in the air. One person pops a bottle of sparkling wine and a fountain of white foam sprays upward; everyone cheers, laughing with mouths open, arms raised, pure celebration. Outfits: sparkling cocktail dresses with sequins, velvet blazers and open-collar shirts. Dynamic close-to-medium shot, high energy, motion in the foam and confetti, sharp faces.',
 '{"1":"Exactly 1 person popping the sparkling wine, foam spraying upward, laughing joyfully.","2":"Exactly 2 people: one pops the bottle, the other cheers with arms raised beside them.","3":"Exactly 3 people: the center person pops the bottle, the other two cheer and laugh around them.","4":"Exactly 4 people: the front person pops the bottle, the other three cheer and laugh around and behind them."}',
 '2:3', 4, 23, false, true, ''),

-- 5. Тансаг буйдан
('party-chesterfield', 'Тансаг буйдан', 'Алтан хээтэй танхимд арьсан буйдан дээр шампантай', 'party',
 'An old-money luxury salon: a weathered dark-brown tufted leather Chesterfield sofa, warm beige plaster wall with ornate gilded baroque moldings and a gold frame, marble checkered floor. The people lounge confidently on the sofa holding champagne flutes. Outfits: men in a black tuxedo with bow tie and pleated white shirt; women in an elegant black or champagne-colored satin evening gown with pearls. Warm golden film-like color grading, editorial fashion portrait, full-body.',
 '{"1":"Exactly 1 person sitting relaxed on the sofa, legs crossed, one arm along the backrest, holding a champagne flute, looking at the camera.","2":"Exactly 2 people sitting together on the sofa, raising champagne flutes.","3":"Exactly 3 people: two sitting on the sofa, one perched on the armrest, all holding champagne flutes.","4":"Exactly 4 people: three sitting on the sofa and one standing behind it, all holding champagne flutes."}',
 '4:5', 4, 24, false, true, ''),

-- 6. Хотын гэрлийн өмнө
('party-city-rooftop', 'Хотын гэрлийн өмнө', 'Шөнийн хотын дээвэр дээр тансаг хувцастай', 'party',
 'A penthouse rooftop terrace at night with a glass balustrade, high above a sparkling metropolis: an endless sea of city lights and illuminated skyscrapers, deep blue night sky. Outfits: women in a liquid teal or emerald silk-satin floor-length gown with delicate straps and statement earrings (elegant, not revealing); men in a midnight-blue tuxedo. Pose leaning on the glass rail and looking back over the shoulder toward the camera. Moody cinematic night lighting with soft cyan rim light, full-body.',
 '{}', '1:1', 4, 25, false, true, ''),

-- 7. Шатны өмнө
('party-grand-stairs', 'Гала шатны өмнө', 'Улаан хивстэй гала шатны өмнө', 'party',
 'The grand entrance of a gala: a wide marble staircase covered with a red carpet, gold stanchions with red velvet ropes, elegant guests in black tie and press photographers softly blurred in the background, warm ivory walls. Outfits: women in a fitted metallic sequined cocktail or evening gown (silver or gunmetal) with diamond earrings and an elegant updo — glamorous and tasteful; men in a black tuxedo with a satin lapel. Confident pose at the foot of the stairs, hand on hip. Soft glamorous lighting with glowing skin, full-body or 3/4.',
 '{}', '1:1', 4, 26, false, true, ''),

-- 8. Сэтгүүлийн нүүр (бичигтэй)
('party-magazine-cover', 'Сэтгүүлийн нүүр', 'Загварын сэтгүүлийн нүүрэнд гарсан мэт', 'party',
 'A high-fashion magazine cover photo at a gala: couture outfits — women in a sculptural metallic silver haute-couture gown with fish-scale sequins; men in an avant-garde tailored silver-grey tuxedo — paparazzi camera flashes and lens flares in the blurred background. Magazine cover layout: a large elegant serif masthead across the top that reads exactly «ZURAGCHIN», and two short cover lines in clean white sans-serif capitals that read exactly «STAR OF THE NIGHT» on the left side and «NEW YEAR 2027» at the bottom. No other text, no barcodes, no real magazine names. The people overlap the masthead slightly like a real cover, 3/4 framing, glossy editorial lighting.',
 '{}', '2:3', 4, 27, true, true, ''),

-- 9. Далайн хаадын сэнтий
('party-ocean-throne', 'Далайн хаадын сэнтий', 'Далайн ёроолын ордонд сувдан сэнтий дээр', 'party',
 'A breathtaking underwater fantasy palace: an enormous ornate throne carved from pearl, mother-of-pearl shells, coral and silver filigree with starfish details, sunbeams streaming down through the water, ancient sunken columns and arches, glowing jellyfish, manta rays, small sharks and tropical fish, colorful corals and sea anemones, floating bubbles, a jeweled trident leaning by the throne. Royal outfits: women in a flowing ivory-and-sapphire gown embroidered with pearls and crystals; men in a teal velvet suit with gold embroidery. Regal, fantasy-cinema look, full-body.',
 '{"1":"Exactly 1 person seated regally on the throne, looking at the camera.","2":"Exactly 2 people: one seated on the throne, the other sitting on the throne armrest with an arm around them.","3":"Exactly 3 people: one seated on the throne, the other two standing on each side of the throne on the steps.","4":"Exactly 4 people: one seated on the throne, one on the armrest, two standing on the throne steps."}',
 '3:2', 4, 28, false, true, ''),

-- 10. Ретро машин
('party-retro-car', 'Ретро машин', '1950-иад оны улаан машин, неон гэрэлтэй хуучин гараж', 'party',
 'A cinematic 1950s retro scene at dusk: a glossy cherry-red classic 1930s-style car with chrome headlights and grille parked in front of a vintage roadside garage with glowing red neon tubes and antique fuel pumps (no readable brand names or logos). Outfits: men in a dark slim suit with a narrow black tie and white shirt; women in a fitted champagne cocktail dress with a crystal bracelet and voluminous retro hair. Serious, stylish film-noir mood, teal-and-red color grading, people leaning against the car, 3/4 framing.',
 '{}', '3:2', 4, 29, false, true, '')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  scene_prompt = EXCLUDED.scene_prompt,
  composition_overrides = EXCLUDED.composition_overrides,
  aspect_ratio = EXCLUDED.aspect_ratio,
  max_people = EXCLUDED.max_people,
  sort_order = EXCLUDED.sort_order,
  allow_text = EXCLUDED.allow_text,
  is_active = true,
  updated_at = now();

NOTIFY pgrst, 'reload schema';

SELECT sort_order, name, aspect_ratio, allow_text FROM public.ai_templates
WHERE category = 'party' AND is_active ORDER BY sort_order;
