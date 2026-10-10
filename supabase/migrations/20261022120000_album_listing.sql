-- Нүүр хуудсанд цомог нийтлэх (төлбөртэй, тодорхой хугацаатай).
-- Цомгийн эзэн багц сонгож QPay-ээр төлнө → listed_until хүртэл нүүр хуудас ба «Бүх цомог»-д харагдана.
-- Төлбөртэй байгаа нь хуурамч / спам цомгоос сэргийлнэ. Админ хүссэн үедээ нууж болно.

ALTER TABLE public.albums
  ADD COLUMN IF NOT EXISTS listed_until timestamptz,
  ADD COLUMN IF NOT EXISTS listed_at timestamptz,
  ADD COLUMN IF NOT EXISTS listing_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS listing_category text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS listing_location text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cover_photo_id uuid REFERENCES public.photo_uploads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS albums_listed_idx ON public.albums (listed_until) WHERE listed_until IS NOT NULL;

INSERT INTO public.platform_settings (key, value) VALUES
  ('listing_packages', '[
    {"code":"week","name":"7 хоног","days":7,"price":5000},
    {"code":"month","name":"30 хоног","days":30,"price":15000}
  ]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Хугацаа, багц, нийтлэлийн талбаруудыг эзэмшигч өөрөө өөрчлөхөөс хамгаална
CREATE OR REPLACE FUNCTION public.album_expiry_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('album.extend', true) IS DISTINCT FROM 'on'
     AND auth.uid() IS NOT NULL AND NOT public.ai_is_admin() THEN
    NEW.expires_at      := OLD.expires_at;
    NEW.files_purged_at := OLD.files_purged_at;
    NEW.free_activated  := OLD.free_activated;
    NEW.photo_limit     := OLD.photo_limit;
    NEW.package_code    := OLD.package_code;
    NEW.listed_until    := OLD.listed_until;
    NEW.listed_at       := OLD.listed_at;
    NEW.listing_hidden  := OLD.listing_hidden;
  END IF;
  -- Нүүр зураг зөвхөн энэ цомгийн зураг байна
  IF NEW.cover_photo_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.photo_uploads WHERE id = NEW.cover_photo_id AND album_id = NEW.id) THEN
    NEW.cover_photo_id := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.album_package_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.ai_is_admin() THEN
    NEW.free_activated := false;
    NEW.photo_limit := NULL;
    NEW.package_code := NULL;
    NEW.listed_until := NULL;
    NEW.listed_at := NULL;
    NEW.listing_hidden := false;
  END IF;
  RETURN NEW;
END $$;

-- Нийтлэлийн захиалгууд
CREATE TABLE IF NOT EXISTS public.album_listing_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  package_code text NOT NULL,
  days integer NOT NULL,
  amount numeric(10,2) NOT NULL,
  qpay_invoice_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  qpay_payment_id text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
ALTER TABLE public.album_listing_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.album_listing_orders FROM anon, authenticated;
DROP POLICY IF EXISTS "album_listing_orders_owner_read" ON public.album_listing_orders;
CREATE POLICY "album_listing_orders_owner_read" ON public.album_listing_orders
  FOR SELECT TO authenticated USING (public.ai_can_manage_album(album_id));
GRANT SELECT ON public.album_listing_orders TO authenticated;

-- Төлбөр баталгаажсаны дараа (edge функц, service role). 'applied' | 'paid' | NULL
CREATE OR REPLACE FUNCTION public.apply_album_listing(p_invoice_id text, p_payment_id text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  UPDATE public.album_listing_orders
     SET status = 'paid', paid_at = now(), qpay_payment_id = COALESCE(p_payment_id, '')
   WHERE qpay_invoice_id = p_invoice_id AND status = 'pending'
   RETURNING * INTO o;
  IF NOT FOUND THEN
    RETURN (SELECT 'paid' FROM public.album_listing_orders WHERE qpay_invoice_id = p_invoice_id AND status = 'paid');
  END IF;
  PERFORM set_config('album.extend', 'on', true);
  UPDATE public.albums
     SET listed_until = GREATEST(COALESCE(listed_until, now()), now()) + make_interval(days => o.days),
         listed_at = now()
   WHERE id = o.album_id;
  RETURN 'applied';
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_album_listing(text, text) FROM PUBLIC, anon, authenticated;

-- Админ: нийтлэлийг нуух / буцааж харуулах
CREATE OR REPLACE FUNCTION public.admin_set_listing_hidden(p_album_id uuid, p_hidden boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ai_is_admin() THEN RAISE EXCEPTION 'Эрх хүрэлцэхгүй'; END IF;
  UPDATE public.albums SET listing_hidden = p_hidden WHERE id = p_album_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_listing_hidden(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_listing_hidden(uuid, boolean) TO authenticated;

-- Нийтэд харагдах цомгууд (нэвтрэлтгүй)
DROP FUNCTION IF EXISTS public.list_public_albums(text, text, uuid, integer, integer);
CREATE OR REPLACE FUNCTION public.list_public_albums(
  p_category text DEFAULT NULL, p_q text DEFAULT NULL, p_photographer uuid DEFAULT NULL,
  p_limit integer DEFAULT 24, p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid, name text, share_link text, cover_url text, photographers text,
  photo_count integer, price numeric, category text, location text, event_date date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id,
         COALESCE(NULLIF(a.title, ''), a.name),
         a.share_link,
         COALESCE(
           (SELECT ph.preview_url FROM public.photo_uploads ph WHERE ph.id = a.cover_photo_id),
           (SELECT ph.preview_url FROM public.photo_uploads ph
             WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth'
             ORDER BY ph.created_at DESC LIMIT 1)),
         (SELECT string_agg(n, ', ') FROM (
            SELECT DISTINCT COALESCE(NULLIF(pp.display_name, ''), NULLIF(u.name, ''), 'Зурагчин') AS n
              FROM public.photo_uploads ph
              LEFT JOIN public.photographer_profiles pp ON pp.user_id = ph.photographer_id
              LEFT JOIN public.users u ON u.id = ph.photographer_id
             WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth'
             LIMIT 3) s),
         (SELECT count(*)::integer FROM public.photo_uploads ph
           WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth'),
         a.download_price,
         a.listing_category,
         a.listing_location,
         a.event_date
    FROM public.albums a
   WHERE a.listed_until > now()
     AND NOT a.listing_hidden
     AND a.status = 'active'
     AND NOT a.is_free
     AND COALESCE(a.share_link, '') <> ''
     AND (a.expires_at IS NULL OR a.expires_at > now())
     AND a.files_purged_at IS NULL
     AND (p_category IS NULL OR p_category = '' OR a.listing_category = p_category)
     AND (p_q IS NULL OR p_q = '' OR COALESCE(a.title, '') ILIKE '%' || p_q || '%' OR a.name ILIKE '%' || p_q || '%'
          OR a.listing_location ILIKE '%' || p_q || '%')
     AND (p_photographer IS NULL OR EXISTS (
          SELECT 1 FROM public.photo_uploads ph WHERE ph.album_id = a.id AND ph.photographer_id = p_photographer))
     AND EXISTS (SELECT 1 FROM public.photo_uploads ph WHERE ph.album_id = a.id AND ph.source IS DISTINCT FROM 'ai_booth')
   ORDER BY a.listed_at DESC NULLS LAST, a.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
REVOKE EXECUTE ON FUNCTION public.list_public_albums(text, text, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_albums(text, text, uuid, integer, integer) TO anon, authenticated;

-- Цомог доторх зурагчдын нэрс (зурагчнаар шүүхэд)
CREATE OR REPLACE FUNCTION public.album_public_photographers(p_album_id uuid)
RETURNS TABLE (photographer_id uuid, name text, photo_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ph.photographer_id,
         COALESCE(NULLIF(max(pp.display_name), ''), NULLIF(max(u.name), ''), 'Зурагчин'),
         count(*)::integer
    FROM public.photo_uploads ph
    JOIN public.albums a ON a.id = ph.album_id AND a.status = 'active'
    LEFT JOIN public.photographer_profiles pp ON pp.user_id = ph.photographer_id
    LEFT JOIN public.users u ON u.id = ph.photographer_id
   WHERE ph.album_id = p_album_id AND ph.source IS DISTINCT FROM 'ai_booth'
   GROUP BY ph.photographer_id
   ORDER BY count(*) DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.album_public_photographers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.album_public_photographers(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
