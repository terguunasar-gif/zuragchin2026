/*
  # Шинэ жилийн темплетүүд v2 (тансаг, кино маягийн 10 темплет)

  - ai_templates.allow_text: темплет зураг дотроо бичиг шаардах эсэх (жишээ: "Өвлийн өвөө байхгүй" тэмдэглэл)
  - Хуучин "Шинэ жил, өвөл" ангиллын 8 темплетийг идэвхгүй болгоно (устгахгүй — хуучин захиалгууд холбоотой)
  - Шинэ 10 темплет нэмнэ / шинэчилнэ. Дахин ажиллуулахад аюулгүй.
*/

ALTER TABLE public.ai_templates ADD COLUMN IF NOT EXISTS allow_text boolean NOT NULL DEFAULT false;

-- Хуучин өвлийн темплетүүдийг нуух
UPDATE public.ai_templates SET is_active = false, updated_at = now()
WHERE slug IN ('snowy-night','christmas-tree','winter-forest','fireworks','ice-palace',
               'winter-costume','fireplace','retro-newyear');

INSERT INTO public.ai_templates
  (slug, name, description, category, scene_prompt, composition_overrides, aspect_ratio, max_people, sort_order, allow_text, is_active, preview_url)
VALUES
-- 1. Өвлийн өвөө байхгүй (хөгжилтэй)
('ny-santa-not-real', 'Өвлийн өвөө байхгүй!', 'Бэлэгнээс гарсан тэмдэглэлд уйлж, бусад нь шоолон инээнэ', 'winter',
 'A hilarious, bright New Year living-room scene like a viral holiday meme: a decorated New Year tree with red and gold baubles and warm fairy lights, a brick wall with garlands, wrapped gifts with red ribbons, a red patterned rug, a beige sofa behind. The "gift opener" (the person most front-center in Image 1) kneels on the rug holding an open red gift box and a white paper note just pulled out of it, crying in an exaggerated comedic way — scrunched face, wide-open mouth, big tears — clearly playful and over-the-top, not real distress. The note is large, facing the camera and clearly readable, handwritten in black marker in Mongolian Cyrillic capital letters exactly: «ӨВЛИЙН ӨВӨӨ ГЭЖ БАЙХГҮЙ ХА ХА ХА...». Everyone wears cozy holiday clothes (Nordic sweaters, plaid shirts, a Santa hat). Anyone teasing only points with an index finger — absolutely no rude or obscene hand gestures. Warm, sharp, colorful indoor lighting, full-body framing.',
 '{"1":"Exactly 1 person: the gift opener kneels front-center on the rug holding the open box and the note, crying dramatically. The sofa behind is empty.","2":"Exactly 2 people: the gift opener kneels front-center crying with the note; the second person sits on the sofa behind, laughing loudly and pointing at the crier with an index finger.","3":"Exactly 3 people: the gift opener kneels front-center crying with the note; the other two sit on the sofa behind, laughing loudly and pointing at the crier with index fingers.","4":"Exactly 4 people: the gift opener kneels front-center crying with the note; the other three sit and stand around the sofa behind, laughing loudly and pointing at the crier with index fingers."}',
 '4:5', 4, 1, true, true, ''),

-- 2. Цасан бөмбөлөг
('ny-snow-globe', 'Цасан бөмбөлөг', 'Шидэт цасан бөмбөлөг дотор тансаг хувцастай', 'winter',
 'A magical giant glass snow globe on an ornate carved dark-wood base with gold leaf details, standing on a polished wooden table in front of a tall window that shows a snowy fairy-tale village at night. The people appear INSIDE the glass globe as living miniature figures, full body, standing on fresh snow among tiny snow-covered houses with glowing windows, little lantern posts, small decorated New Year trees and wrapped gifts. Snow and sparkling glitter swirl inside the globe; realistic glass reflections, refraction and highlights. Elegant evening outfits: women in a long black or deep-red velvet gown with drop earrings, men in a black tuxedo with bow tie. Warm golden glow inside the globe, cool blue night outside. Framing: the entire snow globe and its base are visible, the people fill most of the globe so their faces are clear.',
 '{"1":"Exactly 1 person inside the globe, standing elegantly in the center, looking at the camera.","2":"Exactly 2 people inside the globe, standing close together and holding hands, smiling.","3":"Exactly 3 people inside the globe, standing together in a festive group, smiling.","4":"Exactly 4 people inside the globe, gathered cheerfully like a cozy New Year party, some holding warm mugs and small gifts."}',
 '3:4', 4, 2, false, true, ''),

-- 3. Чихэрлэг гала
('ny-candy-glam', 'Чихэрлэг гала', 'Тансаг чихэр-модны студид загварлаг хувцастай', 'winter',
 'A luxurious fashion-editorial New Year "candy land" studio set: giant red-and-white striped candy canes, oversized peppermint-swirl lollipops, pink, red and silver glossy baubles, frosted pastel New Year trees with fairy lights, soft white fake snow on the floor, dreamy pink-gold haze. Styling: women in a glamorous floor-length sequined gown with red, white and blush-pink candy stripes; men in a tailored red velvet suit with a striped tie. People sit or stand on a white velvet cube, one holds a giant peppermint lollipop. Soft pink key light, warm rim light, glossy magazine-cover look, full-body or 3/4 framing.',
 '{}', '4:5', 4, 3, false, true, ''),

-- 4. Эльфүүд
('ny-elves', 'Эльфүүд', 'Эльфийн хувцастай бүжиглэж буй хөгжилтэй зураг', 'winter',
 'A joyful New Year Christmas-market scene at night: a wooden holiday stall glowing with warm string lights and bokeh, glittering snowy ground, colorful confetti and swirling golden magic sparkles. Every person is dressed as a cheerful holiday elf: green tunic with a red pointed collar, gold buttons, brown belt with a gold buckle, red-and-white striped tights, curled green elf shoes, and a green-and-red elf hat with a golden bell. Full body, dancing playfully mid-step (kicking a leg, raising a fist), big happy laughing smiles. Photorealistic people with natural human proportions (not bobble-heads), bright festive colors.',
 '{}', '1:1', 4, 4, false, true, ''),

-- 5. Бэлгийн хайрцаг
('ny-gift-box', 'Бэлгийн хайрцаг', 'Том бэлгийн хайрцагнаас гарч ирж буй мэт', 'winter',
 'A luxurious New Year interior: a tall decorated tree with warm golden lights, a cream fireplace with garland and glowing candles, a wreath with a red bow on the wall, gently falling snow sparkles. A giant white gift box with a glossy red ribbon and a huge red glitter bow stands on a fluffy white rug; the people pop out of the open box, visible from the waist up above its edge, in a playful pose (arms crossed, a wink, or a big surprised smile). Outfits: elegant red velvet holiday outfits with white faux-fur trim — women in a long-sleeved velvet dress with a red hair ribbon, men in a red velvet blazer — tasteful and modest. Warm cinematic light, shallow depth of field.',
 '{"3":"Exactly 3 people popping out together from one extra-large gift box, shoulders close.","4":"Exactly 4 people popping out together from one extra-large gift box, two in front and two slightly behind."}',
 '3:4', 4, 5, false, true, ''),

-- 6. Өвлийн өвгөний өвөр дээр
('ny-santa-lap', 'Өвлийн өвгөний өвөр дээр', 'Өвлийн өвгөнтэй хамт зуухны дэргэд', 'winter',
 'A cozy luxurious log-cabin interior: a stone fireplace with a roaring fire, stockings and a garland with lit candles on the mantel, a big decorated New Year tree with gifts, a frosty window with snowfall. A jolly fictional Mongolian Grandfather Frost (Өвлийн өвгөн) — a big kind elderly man with a long white beard, round glasses, a red velvet suit with white fur trim, black belt and boots — sits in a vintage armchair. He is an extra character, not one of the people from Image 1, and must not resemble any of them. The people wear festive red velvet outfits with white fur trim and Santa hats, elegant and modest. Warm firelight, cinematic, full-body framing.',
 '{"1":"Exactly 1 person from Image 1 sits playfully on Grandfather Frost''s knee; both smile at the camera.","2":"Exactly 2 people from Image 1: one sits on Grandfather Frost''s knee, the other stands beside the armchair leaning in; everyone smiles.","3":"Exactly 3 people from Image 1: one sits on Grandfather Frost''s knee, the other two stand on each side of the armchair; everyone smiles.","4":"Exactly 4 people from Image 1: one sits on Grandfather Frost''s knee, the other three stand around the armchair; everyone smiles."}',
 '2:3', 4, 6, false, true, ''),

-- 7. Шидэт ном
('ny-magic-book', 'Шидэт ном', 'Гэрэлтэж буй шидэт ном дэлгэж байна', 'winter',
 'A magical winter night outdoors: snowy forest, a huge New Year tree glowing with golden bokeh lights behind, gentle snowfall. An open antique leather book glows; from its pages a bright golden magic swirl rises with sparkles, tiny glowing gift boxes, reindeer silhouettes and stars, lighting the faces with warm magical light. Outfits: deep-red velvet coats with white fur trim and a tall red velvet hat with fur brim; women with elegant festive makeup (gold shimmer eyes, red lips). Dreamy fantasy-film look, 3/4-length framing.',
 '{"1":"Exactly 1 person holding the glowing open book at chest height, gazing down at the magic with a soft smile.","2":"Exactly 2 people: one holds the glowing book, the other leans in from the side; both look at the magic in amazement.","3":"Exactly 3 people: the center person holds the glowing book, the others lean in from both sides, faces lit by the golden glow.","4":"Exactly 4 people: the front person holds the glowing book, the others gather closely around, faces lit by the golden glow, amazed."}',
 '2:3', 4, 7, false, true, ''),

-- 8. Гацуурын дэргэд
('ny-fireplace-tree', 'Гацуурын дэргэд', 'Зуух, гацуур модны дэргэд дулаахан тансаг зураг', 'winter',
 'A warm luxurious living room on New Year''s Eve: a stone fireplace with a crackling fire, knitted stockings and a pine garland on the mantel, a wall-sized curtain of golden fairy lights, a tall New Year tree with red, white and gold ornaments, gifts wrapped in kraft paper with gold satin ribbons on a soft cream rug. The people sit on the rug near the fireplace, one holding a wrapped gift. Outfits: cozy-chic red velvet robes with white fur trim over a white top and fluffy Santa hats (men may wear a red knit sweater with a Santa hat). Golden warm light, soft bokeh, joyful natural smiles, 3/4-length framing.',
 '{}', '2:3', 4, 8, false, true, ''),

-- 9. Гэрэлт хувцас
('ny-light-gown', 'Гэрэлт хувцас', 'Мянган гэрлээр гэрэлтсэн тансаг хувцас', 'winter',
 'A fairy-tale winter night: a snowy pine forest with trees wrapped in multicolor fairy lights, a soft pink-violet twilight sky with a glowing moon, gentle snowfall. Women wear a flowing gown made of thousands of glowing warm-white fairy lights woven into sheer tulle, with a sparkling crystal tiara; men wear a midnight-blue velvet tuxedo with tiny glowing light accents on the lapels. The glow from the outfits lights up the faces and the snow around them. Elegant poses (sitting gracefully on the snow or standing), full or 3/4 body, magical cinematic look.',
 '{}', '2:3', 4, 9, false, true, ''),

-- 10. Гацуурын чимэглэл
('ny-ornament', 'Гацуурын чимэглэл', 'Гацуур дээр өлгөсөн шилэн бөмбөлөг доторх хөрөг', 'winter',
 'A close-up of a snowy New Year tree branch at night with warm fairy-light bokeh and falling snow. Hanging from the branch on a gold cap and ribbon is a large clear glass Christmas ornament ball, placed in the upper-middle of the image; INSIDE the glass ball is a bright portrait of the people (chest-up) in cozy winter outfits — red Nordic-pattern sweater, green knit scarf, white knit beanie — one holding a warm mug, in front of a softly lit decorated tree. Realistic curved glass reflections and highlights. Leave the lower third of the image as dark, soft snowy bokeh (a greeting text is added there later). Faces inside the ornament must be large enough to be clearly recognizable.',
 '{"3":"Exactly 3 people inside the ornament, heads close together.","4":"Exactly 4 people inside the ornament, heads close together in two rows."}',
 '2:3', 4, 10, false, true, '')
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
WHERE category = 'winter' AND is_active ORDER BY sort_order;
