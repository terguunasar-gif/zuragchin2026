-- update-53: цомгийг 4 оронтой кодоор түгжих (төлбөртэй үйлчилгээ)
--
-- * Цомог үүсгэгч үйлчилгээний төлбөрийг (platform_settings.album_lock_price, анхдагч 10,000₮)
--   QPay-ээр нэг удаа төлөөд цомгоо 4 оронтой кодоор түгжинэ. Орлого платформд.
-- * Түгжээтэй цомгийн зургийг линк задарсан ч кодгүйгээр харах боломжгүй:
--   photo_uploads дээр RESTRICTIVE бодлого — зөвхөн цомгийн эзэн, батлагдсан зурагчин, админ шууд уншина,
--   бусад нь кодоор авсан түлхүүрээр (locked_album_photos) уншина.
-- * Түгжээтэй цомог нүүр хуудасны жагсаалт, хайлтад гарахгүй.
-- Дахин ажиллуулахад эвдрэхгүй.

INSERT INTO public.platform_settings (key, value) VALUES ('album_lock_price', '10000'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.album_locks (
  album_id uuid PRIMARY KEY REFERENCES public.albums(id) ON DELETE CASCADE,
  pin text NOT NULL DEFAULT '' ,
  enabled boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.album_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.album_locks FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.album_lock_tokens (
  token text PRIMARY KEY,
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX IF NOT EXISTS album_lock_tokens_album_idx ON public.album_lock_tokens(album_id);
ALTER TABLE public.album_lock_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.album_lock_tokens FROM anon, authenticated;

-- Буруу код оролдлого (тоолж хязгаарлана)
CREATE TABLE IF NOT EXISTS public.album_lock_attempts (
  id bigserial PRIMARY KEY,
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS album_lock_attempts_idx ON public.album_lock_attempts(album_id, at);
ALTER TABLE public.album_lock_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.album_lock_attempts FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.album_lock_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  qpay_invoice_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  qpay_payment_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
ALTER TABLE public.album_lock_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.album_lock_orders FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.album_lock_random_pin()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT lpad((floor(random() * 10000))::integer::text, 4, '0');
$$;

-- Цомог түгжээтэй эсэх
CREATE OR REPLACE FUNCTION public.album_is_locked(p_album_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.album_locks l WHERE l.album_id = p_album_id AND l.enabled AND l.paid_at IS NOT NULL AND l.pin <> '');
$$;
GRANT EXECUTE ON FUNCTION public.album_is_locked(uuid) TO anon, authenticated;

-- Кодгүйгээр шууд харах эрхтэй хүн: цомгийн эзэн, батлагдсан зурагчин, админ
CREATE OR REPLACE FUNCTION public.album_lock_bypass(p_album_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.albums a WHERE a.id = p_album_id AND a.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.album_photographers ap
                WHERE ap.album_id = p_album_id AND ap.photographer_id = auth.uid() AND ap.status = 'approved')
    OR public.ai_is_admin());
$$;
GRANT EXECUTE ON FUNCTION public.album_lock_bypass(uuid) TO anon, authenticated;

-- RLS-ийн шалгалт: түгжээгүй эсвэл эрхтэй бол л зургийн мөрийг шууд уншина
CREATE OR REPLACE FUNCTION public.album_photo_visible(p_album_id uuid, p_photographer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.album_is_locked(p_album_id)
      OR (auth.uid() IS NOT NULL AND p_photographer_id = auth.uid())
      OR public.album_lock_bypass(p_album_id);
$$;
GRANT EXECUTE ON FUNCTION public.album_photo_visible(uuid, uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "album_lock_guard" ON public.photo_uploads;
CREATE POLICY "album_lock_guard" ON public.photo_uploads AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.album_photo_visible(album_id, photographer_id));

-- Нийтийн хуудас: 'open' (түгжээгүй) | 'bypass' (эрхтэй) | 'ok' (код зөв орсон) | 'locked'
CREATE OR REPLACE FUNCTION public.album_lock_state(p_album_id uuid, p_token text DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT public.album_is_locked(p_album_id) THEN 'open'
    WHEN public.album_lock_bypass(p_album_id) THEN 'bypass'
    WHEN EXISTS (SELECT 1 FROM public.album_lock_tokens t
                  WHERE t.token = COALESCE(p_token, '') AND t.album_id = p_album_id AND t.expires_at > now()) THEN 'ok'
    ELSE 'locked' END;
$$;
GRANT EXECUTE ON FUNCTION public.album_lock_state(uuid, text) TO anon, authenticated;

-- Кодоор нээх: зөв бол 30 хоногийн түлхүүр буцаана. 15 минутад 20-оос олон буруу оролдлогыг хаана.
CREATE OR REPLACE FUNCTION public.unlock_album(p_album_id uuid, p_pin text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_fail integer; v_token text;
BEGIN
  SELECT * INTO l FROM public.album_locks WHERE album_id = p_album_id;
  IF NOT FOUND OR NOT public.album_is_locked(p_album_id) THEN
    RETURN jsonb_build_object('ok', true, 'token', '');
  END IF;
  SELECT count(*) INTO v_fail FROM public.album_lock_attempts
   WHERE album_id = p_album_id AND at > now() - interval '15 minutes';
  IF v_fail >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;
  IF btrim(COALESCE(p_pin, '')) <> l.pin THEN
    INSERT INTO public.album_lock_attempts (album_id) VALUES (p_album_id);
    RETURN jsonb_build_object('ok', false, 'error', 'wrong');
  END IF;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.album_lock_tokens (token, album_id) VALUES (v_token, p_album_id);
  DELETE FROM public.album_lock_tokens WHERE expires_at < now();
  DELETE FROM public.album_lock_attempts WHERE at < now() - interval '1 day';
  RETURN jsonb_build_object('ok', true, 'token', v_token);
END $$;
REVOKE EXECUTE ON FUNCTION public.unlock_album(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_album(uuid, text) TO anon, authenticated;

-- Түлхүүртэй зочинд түгжээтэй цомгийн зургууд
CREATE OR REPLACE FUNCTION public.locked_album_photos(p_album_id uuid, p_token text)
RETURNS TABLE (
  id uuid, preview_url text, filename text, photographer_id uuid, print_prices jsonb,
  folder_id uuid, source text, download_price numeric, title text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ph.id, ph.preview_url, ph.filename, ph.photographer_id, to_jsonb(ph.print_prices),
         ph.folder_id, ph.source, ph.download_price, ph.title, ph.created_at
    FROM public.photo_uploads ph
   WHERE ph.album_id = p_album_id
     AND ph.hidden_at IS NULL
     AND public.album_lock_state(p_album_id, p_token) IN ('open', 'ok', 'bypass')
   ORDER BY ph.created_at ASC;
$$;
REVOKE EXECUTE ON FUNCTION public.locked_album_photos(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.locked_album_photos(uuid, text) TO anon, authenticated;

-- Эзэнд: түгжээний мэдээлэл
CREATE OR REPLACE FUNCTION public.album_lock_info(p_album_id uuid)
RETURNS TABLE (paid boolean, enabled boolean, pin text, price numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.albums a WHERE a.id = p_album_id AND (a.owner_id = auth.uid() OR public.ai_is_admin())) THEN
    RAISE EXCEPTION 'Зөвхөн цомгийн эзэн';
  END IF;
  RETURN QUERY
  SELECT COALESCE(l.paid_at IS NOT NULL, false), COALESCE(l.enabled, false), COALESCE(l.pin, ''),
         COALESCE((SELECT (value #>> '{}')::numeric FROM public.platform_settings WHERE key = 'album_lock_price'), 10000)
    FROM (SELECT 1) x LEFT JOIN public.album_locks l ON l.album_id = p_album_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.album_lock_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.album_lock_info(uuid) TO authenticated;

-- Эзэнд: асаах/унтраах, код солих. p_pin: NULL = хэвээр, 'random' = шинэ санамсаргүй, 4 оронтой тоо = тэр код
CREATE OR REPLACE FUNCTION public.set_album_lock(p_album_id uuid, p_enabled boolean, p_pin text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_pin text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.albums a WHERE a.id = p_album_id AND (a.owner_id = auth.uid() OR public.ai_is_admin())) THEN
    RAISE EXCEPTION 'Зөвхөн цомгийн эзэн';
  END IF;
  SELECT * INTO l FROM public.album_locks WHERE album_id = p_album_id;
  IF NOT FOUND OR l.paid_at IS NULL THEN RAISE EXCEPTION 'Түгжээний үйлчилгээний төлбөр төлөөгүй байна'; END IF;
  v_pin := CASE
    WHEN p_pin IS NULL OR btrim(p_pin) = '' THEN l.pin
    WHEN p_pin = 'random' THEN public.album_lock_random_pin()
    WHEN btrim(p_pin) ~ '^[0-9]{4}$' THEN btrim(p_pin)
    ELSE NULL END;
  IF v_pin IS NULL THEN RAISE EXCEPTION 'Код 4 оронтой тоо байна'; END IF;
  IF v_pin = '' THEN v_pin := public.album_lock_random_pin(); END IF;
  UPDATE public.album_locks SET enabled = COALESCE(p_enabled, enabled), pin = v_pin, updated_at = now()
   WHERE album_id = p_album_id;
  -- Код солигдвол өмнө нь нээсэн бүх хүний түлхүүр хүчингүй
  IF v_pin <> l.pin THEN DELETE FROM public.album_lock_tokens WHERE album_id = p_album_id; END IF;
  RETURN v_pin;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_album_lock(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_album_lock(uuid, boolean, text) TO authenticated;

-- Төлбөр баталгаажсан захиалгыг нэг л удаа хэрэгжүүлнэ (qpay функц service role-оор дуудна)
CREATE OR REPLACE FUNCTION public.apply_album_lock_order(p_invoice_id text, p_payment_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  UPDATE public.album_lock_orders
     SET status = 'paid', paid_at = now(), qpay_payment_id = COALESCE(p_payment_id, '')
   WHERE qpay_invoice_id = p_invoice_id AND status = 'pending'
   RETURNING * INTO o;
  IF NOT FOUND THEN
    RETURN (SELECT 'paid' FROM public.album_lock_orders WHERE qpay_invoice_id = p_invoice_id AND status = 'paid');
  END IF;
  INSERT INTO public.album_locks (album_id, pin, enabled, paid_at, updated_at)
  VALUES (o.album_id, public.album_lock_random_pin(), true, now(), now())
  ON CONFLICT (album_id) DO UPDATE SET paid_at = now(), enabled = true,
    pin = CASE WHEN public.album_locks.pin = '' THEN EXCLUDED.pin ELSE public.album_locks.pin END,
    updated_at = now();
  RETURN 'applied';
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_album_lock_order(text, text) FROM PUBLIC, anon, authenticated;

-- Түгжээтэй цомог нүүр хуудасны жагсаалтад гарахгүй
CREATE OR REPLACE FUNCTION public.list_public_albums(
  p_category text DEFAULT NULL, p_q text DEFAULT NULL, p_photographer uuid DEFAULT NULL,
  p_limit integer DEFAULT 24, p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid, name text, share_link text, cover_url text, photographers text,
  photo_count integer, price numeric, category text, location text, event_date date,
  max_price numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id,
         COALESCE(NULLIF(a.title, ''), a.name),
         a.share_link,
         COALESCE(
           (SELECT ph.preview_url FROM public.photo_uploads ph WHERE ph.id = a.cover_photo_id AND ph.hidden_at IS NULL),
           (SELECT ph.preview_url FROM public.photo_uploads ph
             WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL
             ORDER BY ph.created_at DESC LIMIT 1)),
         (SELECT string_agg(n, ', ') FROM (
            SELECT DISTINCT COALESCE(NULLIF(pp.display_name, ''), NULLIF(u.name, ''), 'Зурагчин') AS n
              FROM public.photo_uploads ph
              LEFT JOIN public.photographer_profiles pp ON pp.user_id = ph.photographer_id
              LEFT JOIN public.users u ON u.id = ph.photographer_id
             WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL
             LIMIT 3) s),
         (SELECT count(*)::integer FROM public.photo_uploads ph
           WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL),
         (SELECT min(COALESCE(ph.download_price, a.download_price)) FROM public.photo_uploads ph
          WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL),
       a.listing_category, a.listing_location, a.event_date,
       (SELECT max(COALESCE(ph.download_price, a.download_price)) FROM public.photo_uploads ph
          WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL)
    FROM public.albums a
   WHERE a.listed_until > now()
     AND NOT a.listing_hidden
     AND a.status = 'active'
     AND NOT a.is_free
     AND COALESCE(a.share_link, '') <> ''
     AND (a.expires_at IS NULL OR a.expires_at > now())
     AND a.files_purged_at IS NULL
     AND NOT public.album_is_locked(a.id)
     AND (p_category IS NULL OR p_category = '' OR a.listing_category = p_category)
     AND (p_q IS NULL OR p_q = '' OR COALESCE(a.title, '') ILIKE '%' || p_q || '%' OR a.name ILIKE '%' || p_q || '%'
          OR a.listing_location ILIKE '%' || p_q || '%')
     AND (p_photographer IS NULL OR EXISTS (
          SELECT 1 FROM public.photo_uploads ph WHERE ph.album_id = a.id AND ph.photographer_id = p_photographer AND ph.hidden_at IS NULL))
     AND EXISTS (SELECT 1 FROM public.photo_uploads ph WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth' AND ph.hidden_at IS NULL)
   ORDER BY a.listed_at DESC NULLS LAST, a.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- Түгжээтэй цомгийн зураг нэрээр хайхад гарахгүй
CREATE OR REPLACE FUNCTION public.search_public_photos(p_q text, p_limit integer DEFAULT 24)
RETURNS TABLE (
  id uuid, title text, preview_url text, album_id uuid, album_name text, share_link text,
  price numeric, photographer text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ph.id, ph.title, ph.preview_url, a.id, COALESCE(NULLIF(a.title, ''), a.name), a.share_link,
         COALESCE(ph.download_price, a.download_price),
         COALESCE(NULLIF(pp.display_name, ''), NULLIF(u.name, ''), 'Зурагчин')
    FROM public.photo_uploads ph
    JOIN public.albums a ON a.id = ph.album_id
    LEFT JOIN public.photographer_profiles pp ON pp.user_id = ph.photographer_id
    LEFT JOIN public.users u ON u.id = ph.photographer_id
   WHERE length(btrim(COALESCE(p_q, ''))) >= 2
     AND ph.title ILIKE '%' || btrim(p_q) || '%'
     AND ph.source IS DISTINCT FROM 'ai_booth'
     AND ph.hidden_at IS NULL
     AND a.listed_until > now()
     AND NOT a.listing_hidden
     AND a.status = 'active'
     AND NOT a.is_free
     AND COALESCE(a.share_link, '') <> ''
     AND (a.expires_at IS NULL OR a.expires_at > now())
     AND a.files_purged_at IS NULL
     AND NOT public.album_is_locked(a.id)
   ORDER BY (lower(ph.title) = lower(btrim(p_q))) DESC, a.listed_at DESC NULLS LAST, ph.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60);
$$;

NOTIFY pgrst, 'reload schema';
