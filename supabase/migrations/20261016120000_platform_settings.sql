-- Сайтын ерөнхий тохиргоо (зөвхөн админ өөрчилнө). Одоогоор: цомог дахь AI бүүтийн зургийн татах үнэ.
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);

INSERT INTO public.platform_settings (key, value)
VALUES ('ai_album_price', '3000'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.platform_settings TO authenticated;

DROP POLICY IF EXISTS "platform_settings_read" ON public.platform_settings;
CREATE POLICY "platform_settings_read" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "platform_settings_admin_write" ON public.platform_settings;
CREATE POLICY "platform_settings_admin_write" ON public.platform_settings
  FOR ALL TO authenticated USING (public.ai_is_admin()) WITH CHECK (public.ai_is_admin());

NOTIFY pgrst, 'reload schema';
