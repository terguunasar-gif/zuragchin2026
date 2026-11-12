-- update-92 — Ухаалаг туслах чатбот («Туслах»)
-- Дахин ажиллуулсан ч эвдрэхгүй.

-- 1) Асуулт / хариултын бүртгэл (хурдны хязгаар + админ сайжруулахад)
CREATE TABLE IF NOT EXISTS public.help_bot_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  text NOT NULL,
  user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ip_hash     text,
  path        text,
  lang        text,
  question    text NOT NULL,
  answer      text,
  model       text,
  helpful     boolean,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS help_bot_messages_created_idx ON public.help_bot_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS help_bot_messages_ip_idx ON public.help_bot_messages (ip_hash, created_at DESC);

ALTER TABLE public.help_bot_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.help_bot_messages FROM anon;
GRANT SELECT, DELETE ON public.help_bot_messages TO authenticated;

-- Зөвхөн админ уншина/устгана. Бичилтийг Edge Function (service role) хийнэ.
DROP POLICY IF EXISTS "help_bot_admin_read" ON public.help_bot_messages;
CREATE POLICY "help_bot_admin_read" ON public.help_bot_messages
  FOR SELECT TO authenticated USING (public.ai_is_admin());

DROP POLICY IF EXISTS "help_bot_admin_delete" ON public.help_bot_messages;
CREATE POLICY "help_bot_admin_delete" ON public.help_bot_messages
  FOR DELETE TO authenticated USING (public.ai_is_admin());

-- 2) Тохиргоо (Админ → Чатбот табаас өөрчилнө)
INSERT INTO public.platform_settings (key, value) VALUES
  ('help_bot_enabled',      'true'::jsonb),
  ('help_bot_notes',        '""'::jsonb),
  ('help_bot_hourly_limit', '30'::jsonb),
  ('help_bot_daily_cap',    '3000'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3) 90 хоногоос хуучин бүртгэлийг устгах туслах функц (админ «Хуучныг цэвэрлэх» товч)
CREATE OR REPLACE FUNCTION public.help_bot_purge_old(p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.ai_is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  DELETE FROM public.help_bot_messages WHERE created_at < now() - make_interval(days => GREATEST(p_days, 7));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.help_bot_purge_old(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.help_bot_purge_old(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
