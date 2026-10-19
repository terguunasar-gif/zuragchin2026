-- update-70: «Ногоон аварга» загварыг Google-ийн шүүлтүүрт ордоггүй болгох
--
-- Ногоон арьстай, булчинлаг, цамц урагддаг аварга нь алдартай кино баатартай (зохиогчийн эрхтэй дүр)
-- хэт төстэй тул Google Veo «Responsible AI» шалтгаанаар байнга татгалзаж байсан.
-- Ногоон өнгө, цамц урагдах хэсгийг хасаж «Аварга болох» болгоно.
-- Бүтэлгүйтсэн видеонууд дахин бүтээхэд шинэ тайлбарыг автоматаар ашиглана (нэмэлт төлбөргүй).

UPDATE public.ai_video_templates
   SET name = 'Аварга болох',
       emoji = '🗻',
       description = 'Нэг хүн гэнэт аварга том болж өсөөд бусдыгаа дээрээс харж даллана. Бусад нь гайхан дээш харж инээнэ.',
       prompt = 'One person in the photo magically grows to giant size, becoming three times taller than everyone else, while keeping exactly the same face, hairstyle and clothes, which grow with them. They look down at the others with a big friendly smile and wave. The other people look up in amazement, point and laugh. Photorealistic, playful, cinematic.',
       updated_at = now()
 WHERE slug = 'green-giant';

UPDATE public.album_ai_videos v
   SET template_name = t.name
  FROM public.ai_video_templates t
 WHERE t.id = v.template_id AND t.slug = 'green-giant' AND v.status IN ('failed', 'processing', 'pending_payment');
