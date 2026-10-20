-- update-77: Цомгийн эзэн «AI видео»-г цомогтоо хааж болно (уран сайхны зураг зардаг цомогт хэрэггүй)
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS ai_video_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_album_ai_video_enabled(p_album_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ai_can_manage_album(p_album_id) THEN RAISE EXCEPTION 'Эрх хүрэлцэхгүй'; END IF;
  UPDATE public.albums SET ai_video_enabled = COALESCE(p_enabled, true) WHERE id = p_album_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_album_ai_video_enabled(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_album_ai_video_enabled(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
