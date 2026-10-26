-- Фото студи (зурагчнаас тусдаа бүртгэл) + газрын зургийн радиус хайлт.
--
-- Баталгаажуулалт: зурагчны профайл (`is_visible`) шууд нийтэд гардаг.
-- Студи өөр — хаяг, утас, газрын зургийн цэгтэй тул эзэмшигч өөрөө баталж чадахгүй.
-- Шинэ студи `draft` эсвэл `pending`, `is_visible = false`.
-- Админ (`ai_is_admin`) `approved` + `is_visible` болгосны дараа л нийтийн хайлтад гарна.
-- Эзэмшигч батлагдсан студийн агуулга, харагдах эсэхийг засна. Төлөвийг буцааж «approved» болгож чадахгүй.
--
-- Дахин ажиллуулахад эвдрэхгүй.

CREATE TABLE IF NOT EXISTS public.studios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  instagram text NOT NULL DEFAULT '',
  facebook text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  logo_url text,
  cover_url text,
  specialties text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  is_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studios_name_len CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 160),
  CONSTRAINT studios_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  CONSTRAINT studios_status_check CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  CONSTRAINT studios_coords_pair CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS studios_slug_key ON public.studios (slug);
CREATE INDEX IF NOT EXISTS studios_owner_idx ON public.studios (owner_user_id);
CREATE INDEX IF NOT EXISTS studios_public_idx ON public.studios (name)
  WHERE status = 'approved' AND is_visible;

-- Эзэмшигч өөрөө статус ахиулах, илгээхдээ цэггүй үлдээхийг хориглоно.
CREATE OR REPLACE FUNCTION public.studios_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  IF public.ai_is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.owner_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Зөвхөн өөрийн студийг бүртгэнэ';
    END IF;
    IF NEW.status NOT IN ('draft', 'pending') THEN
      RAISE EXCEPTION 'Шинэ студи ноорог эсвэл хүлээгдэж буй төлөвтэй байна';
    END IF;
    NEW.is_visible := false;
    IF NEW.status = 'pending' AND (NEW.latitude IS NULL OR NEW.longitude IS NULL) THEN
      RAISE EXCEPTION 'Илгээхийн өмнө газрын зураг дээр байршлаа тэмдэглэнэ үү';
    END IF;
    RETURN NEW;
  END IF;

  NEW.owner_user_id := OLD.owner_user_id;

  IF OLD.status = 'approved' THEN
    IF NEW.status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'Батлагдсан студийн төлөвийг өөрчлөх боломжгүй';
    END IF;
    IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
      RAISE EXCEPTION 'Батлагдсан студи газрын зураг дээрх байршилтай байх ёстой';
    END IF;
  ELSIF NEW.status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Төлөвийг өөрөө батлах боломжгүй';
  ELSE
    NEW.is_visible := false;
    IF NEW.status = 'pending' AND (NEW.latitude IS NULL OR NEW.longitude IS NULL) THEN
      RAISE EXCEPTION 'Илгээхийн өмнө газрын зураг дээр байршлаа тэмдэглэнэ үү';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS studios_guard_status_trg ON public.studios;
CREATE TRIGGER studios_guard_status_trg
  BEFORE INSERT OR UPDATE ON public.studios
  FOR EACH ROW EXECUTE FUNCTION public.studios_guard_status();

ALTER TABLE public.studios ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.studios TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.studios TO authenticated;

DROP POLICY IF EXISTS studios_public_read ON public.studios;
CREATE POLICY studios_public_read ON public.studios
  FOR SELECT TO anon, authenticated
  USING (status = 'approved' AND is_visible = true);

DROP POLICY IF EXISTS studios_owner_read ON public.studios;
CREATE POLICY studios_owner_read ON public.studios
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS studios_owner_insert ON public.studios;
CREATE POLICY studios_owner_insert ON public.studios
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS studios_owner_update ON public.studios;
CREATE POLICY studios_owner_update ON public.studios
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS studios_owner_delete ON public.studios;
CREATE POLICY studios_owner_delete ON public.studios
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS studios_admin_all ON public.studios;
CREATE POLICY studios_admin_all ON public.studios
  FOR ALL TO authenticated
  USING (public.ai_is_admin())
  WITH CHECK (public.ai_is_admin());

NOTIFY pgrst, 'reload schema';
