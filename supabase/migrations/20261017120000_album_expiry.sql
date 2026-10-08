-- Цомгийн хугацаа: арга хэмжээний өдрөөс 30 хоног нээлттэй. Дууссаны дараа цомог хаагдана,
-- хэн ч QPay-ээр сунгаж болно. Хаагдсанаас 60 хоногийн дараа зургийн файлуудыг админ цэвэрлэнэ.

ALTER TABLE public.albums
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS files_purged_at timestamptz;

-- Сайтын тохиргоо (админ өөрчилнө)
INSERT INTO public.platform_settings (key, value) VALUES
  ('album_open_days', '30'::jsonb),
  ('album_extend_price', '10000'::jsonb),
  ('album_extend_days', '30'::jsonb),
  ('album_purge_after_days', '60'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.setting_int(p_key text, p_default integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::numeric::integer FROM public.platform_settings WHERE key = p_key), p_default);
$$;

-- Шинэ цомогт хугацаа автоматаар тавина
CREATE OR REPLACE FUNCTION public.album_set_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := (COALESCE(NEW.event_date::timestamptz, now()) + make_interval(days => public.setting_int('album_open_days', 30)));
    -- Өнгөрсөн огноотой арга хэмжээнд ч доод тал нь 7 хоног нээлттэй
    IF NEW.expires_at < now() + interval '7 days' THEN NEW.expires_at := now() + interval '7 days'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS album_set_expiry ON public.albums;
CREATE TRIGGER album_set_expiry BEFORE INSERT ON public.albums
  FOR EACH ROW EXECUTE FUNCTION public.album_set_expiry();

-- Одоо байгаа цомгууд: арга хэмжээний өдрөөс 30 хоног (доод тал нь өнөөдрөөс 7 хоног)
UPDATE public.albums
   SET expires_at = GREATEST(event_date::timestamptz + make_interval(days => public.setting_int('album_open_days', 30)),
                             now() + interval '7 days')
 WHERE expires_at IS NULL;

-- Эзэмшигч/админ хугацаа өөрчлөхөөс сэргийлнэ (зөвхөн төлбөрөөр эсвэл админ)
CREATE OR REPLACE FUNCTION public.album_expiry_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.files_purged_at IS DISTINCT FROM OLD.files_purged_at)
     AND current_setting('album.extend', true) IS DISTINCT FROM 'on'
     AND auth.uid() IS NOT NULL AND NOT public.ai_is_admin() THEN
    NEW.expires_at := OLD.expires_at;
    NEW.files_purged_at := OLD.files_purged_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS album_expiry_guard ON public.albums;
CREATE TRIGGER album_expiry_guard BEFORE UPDATE ON public.albums
  FOR EACH ROW EXECUTE FUNCTION public.album_expiry_guard();

-- Сунгалтын төлбөрүүд
CREATE TABLE IF NOT EXISTS public.album_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  qpay_invoice_id text NOT NULL UNIQUE,
  amount numeric(10,2) NOT NULL,
  days integer NOT NULL,
  payer_name text NOT NULL DEFAULT '',
  payer_phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  qpay_payment_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
ALTER TABLE public.album_extensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.album_extensions FROM anon, authenticated;
DROP POLICY IF EXISTS "album_extensions_owner_read" ON public.album_extensions;
CREATE POLICY "album_extensions_owner_read" ON public.album_extensions
  FOR SELECT TO authenticated USING (public.ai_can_manage_album(album_id));
GRANT SELECT ON public.album_extensions TO authenticated;

-- Төлбөр баталгаажсаны дараа (edge функц service role-оор дуудна) — нэг л удаа сунгана
CREATE OR REPLACE FUNCTION public.apply_album_extension(p_invoice_id text, p_payment_id text)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e record; v_new timestamptz;
BEGIN
  UPDATE public.album_extensions
     SET status = 'paid', paid_at = now(), qpay_payment_id = COALESCE(p_payment_id, '')
   WHERE qpay_invoice_id = p_invoice_id AND status = 'pending'
   RETURNING * INTO e;
  IF NOT FOUND THEN
    SELECT a.expires_at INTO v_new FROM public.album_extensions x JOIN public.albums a ON a.id = x.album_id
     WHERE x.qpay_invoice_id = p_invoice_id;
    RETURN v_new;
  END IF;
  PERFORM set_config('album.extend', 'on', true);
  UPDATE public.albums
     SET expires_at = GREATEST(COALESCE(expires_at, now()), now()) + make_interval(days => e.days)
   WHERE id = e.album_id
   RETURNING expires_at INTO v_new;
  RETURN v_new;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_album_extension(text, text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
