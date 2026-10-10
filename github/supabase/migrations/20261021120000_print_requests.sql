-- «Үнэгүй хуваалцах» цомгийн угаалгах хүсэлт: зочин зургаа сонгож нэр, утсаа үлдээнэ,
-- зурагчин / зохион байгуулагч холбогдож тооцоог өөр хоорондоо хийнэ (сайт төлбөр авахгүй).

CREATE TABLE IF NOT EXISTS public.print_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  items jsonb NOT NULL,            -- [{"photo_id": "...", "size": "10x15", "qty": 2}]
  buyer_name text NOT NULL,
  buyer_phone text NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'done', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS print_requests_album_idx ON public.print_requests (album_id, created_at DESC);

ALTER TABLE public.print_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.print_requests FROM anon, authenticated;

-- Цомгийн эзэн, админ болон тухайн цомогт зөвшөөрөгдсөн зурагчид харна
CREATE OR REPLACE FUNCTION public.can_view_print_requests(p_album_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.ai_can_manage_album(p_album_id)
      OR EXISTS (SELECT 1 FROM public.album_photographers ap
                  WHERE ap.album_id = p_album_id AND ap.photographer_id = auth.uid() AND ap.status = 'approved');
$$;

DROP POLICY IF EXISTS "print_requests_read" ON public.print_requests;
CREATE POLICY "print_requests_read" ON public.print_requests
  FOR SELECT TO authenticated USING (public.can_view_print_requests(album_id));
GRANT SELECT ON public.print_requests TO authenticated;

-- Зочин хүсэлт илгээх (нэвтрэлтгүй). Зөвхөн идэвхтэй үнэгүй цомогт, AI бүүтийн зураггүй.
CREATE OR REPLACE FUNCTION public.submit_print_request(
  p_album_id uuid, p_items jsonb, p_name text, p_phone text, p_note text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; v_id uuid; v_bad integer; v_recent integer;
BEGIN
  SELECT is_free, free_activated, status, expires_at INTO a FROM public.albums WHERE id = p_album_id;
  IF NOT FOUND OR NOT a.is_free OR NOT a.free_activated OR a.status <> 'active'
     OR (a.expires_at IS NOT NULL AND a.expires_at < now()) THEN
    RAISE EXCEPTION 'Энэ цомогт угаалгах хүсэлт илгээх боломжгүй';
  END IF;
  IF length(trim(coalesce(p_name, ''))) < 2 OR coalesce(p_phone, '') !~ '^[0-9]{8,12}$' THEN
    RAISE EXCEPTION 'Нэр, утасны дугаараа зөв оруулна уу';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Зураг сонгоно уу (50 хүртэл)';
  END IF;
  SELECT count(*) INTO v_bad
    FROM jsonb_array_elements(p_items) i
    LEFT JOIN public.photo_uploads ph ON ph.id = (i->>'photo_id')::uuid AND ph.album_id = p_album_id
   WHERE ph.id IS NULL OR ph.source = 'ai_booth'
      OR coalesce((i->>'qty')::integer, 0) NOT BETWEEN 1 AND 50
      OR length(coalesce(i->>'size', '')) NOT BETWEEN 1 AND 20;
  IF v_bad > 0 THEN RAISE EXCEPTION 'Буруу зураг эсвэл тоо ширхэг'; END IF;
  -- Нэг утаснаас хэт олон хүсэлт илгээхээс сэргийлнэ
  SELECT count(*) INTO v_recent FROM public.print_requests
   WHERE buyer_phone = p_phone AND created_at > now() - interval '1 hour';
  IF v_recent >= 5 THEN RAISE EXCEPTION 'Хэт олон хүсэлт илгээсэн байна. Түр хүлээнэ үү.'; END IF;

  INSERT INTO public.print_requests (album_id, items, buyer_name, buyer_phone, note)
  VALUES (p_album_id, p_items, left(trim(p_name), 80), p_phone, left(coalesce(p_note, ''), 500))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_print_request(uuid, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_print_request(uuid, jsonb, text, text, text) TO anon, authenticated;

-- Төлөв өөрчлөх (эзэн / зурагчин)
CREATE OR REPLACE FUNCTION public.set_print_request_status(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_album uuid;
BEGIN
  IF p_status NOT IN ('new', 'contacted', 'done', 'cancelled') THEN RAISE EXCEPTION 'Буруу төлөв'; END IF;
  SELECT album_id INTO v_album FROM public.print_requests WHERE id = p_id;
  IF v_album IS NULL OR NOT public.can_view_print_requests(v_album) THEN RAISE EXCEPTION 'Эрх хүрэлцэхгүй'; END IF;
  UPDATE public.print_requests SET status = p_status, updated_at = now() WHERE id = p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_print_request_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_print_request_status(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
