-- Цомгийн чат урсгалаас ирсэн худалдан авагчийн бүртгэл (lead).
-- anon шууд уншихгүй. Бичилтийг зөвхөн өөрийн lead_token-оор RPC хийнэ.
-- Админ хүснэгтээс уншина. Энэ файлыг прод дээр гараар ажиллуулна.

CREATE TABLE IF NOT EXISTS public.album_guide_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  lead_token    text NOT NULL,
  name          text NOT NULL,
  phone         text NOT NULL,
  step          text NOT NULL DEFAULT 'welcome',
  folder_id     text,
  selected_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  choices       jsonb NOT NULL DEFAULT '[]'::jsonb,
  paid_invoice  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (album_id, lead_token)
);

CREATE INDEX IF NOT EXISTS album_guide_leads_album_idx ON public.album_guide_leads (album_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS album_guide_leads_phone_idx ON public.album_guide_leads (phone);

ALTER TABLE public.album_guide_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.album_guide_leads FROM anon, public;
GRANT SELECT ON public.album_guide_leads TO authenticated;

DROP POLICY IF EXISTS "album_guide_leads_admin_read" ON public.album_guide_leads;
CREATE POLICY "album_guide_leads_admin_read" ON public.album_guide_leads
  FOR SELECT TO authenticated USING (public.ai_is_admin());

CREATE OR REPLACE FUNCTION public.upsert_album_guide_lead(
  p_album_id uuid,
  p_token text,
  p_name text,
  p_phone text,
  p_step text,
  p_folder_id text,
  p_selected jsonb,
  p_choices jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 OR length(p_token) > 80 THEN
    RAISE EXCEPTION 'bad token';
  END IF;
  IF p_phone !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'bad phone';
  END IF;
  INSERT INTO public.album_guide_leads (album_id, lead_token, name, phone, step, folder_id, selected_ids, choices)
  VALUES (
    p_album_id,
    p_token,
    left(coalesce(p_name, ''), 80),
    p_phone,
    left(coalesce(p_step, 'welcome'), 20),
    nullif(left(coalesce(p_folder_id, ''), 80), ''),
    coalesce(p_selected, '[]'::jsonb),
    coalesce(p_choices, '[]'::jsonb)
  )
  ON CONFLICT (album_id, lead_token) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    step = EXCLUDED.step,
    folder_id = EXCLUDED.folder_id,
    selected_ids = EXCLUDED.selected_ids,
    choices = EXCLUDED.choices,
    updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.mark_album_guide_paid(
  p_album_id uuid,
  p_token text,
  p_invoice text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.album_guide_leads
     SET paid_invoice = left(coalesce(p_invoice, ''), 80),
         step = 'done',
         updated_at = now()
   WHERE album_id = p_album_id AND lead_token = p_token;
END $$;

REVOKE ALL ON FUNCTION public.upsert_album_guide_lead(uuid, text, text, text, text, text, jsonb, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.mark_album_guide_paid(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_album_guide_lead(uuid, text, text, text, text, text, jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_album_guide_paid(uuid, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
