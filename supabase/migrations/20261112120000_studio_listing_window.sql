-- Студийн жагсаалтын цонх ба нүүр хуудасны харагдац.
--
-- listed_from / listed_until (хоёул nullable): хоосон бол хязгааргүй.
-- Нийтийн хайлт (/studios) болон нүүр: status = approved, is_visible,
--   (listed_from IS NULL OR now() >= listed_from),
--   (listed_until IS NULL OR now() <= listed_until).
-- show_on_home: нүүр хуудасны студийн хэсэгт гарах эсэх. Хайлтын is_visible-ээс тусдаа.
-- Цонхыг SQL индексээр шүүхгүй — studios_public_idx хэвээр (status + is_visible).
-- Апп тал цонх болон show_on_home-ийг шүүнэ.
--
-- Эзэмшигч listed_from, listed_until, show_on_home-ийг өөрчилж чадахгүй
-- (INSERT дээр анхны утга, UPDATE дээр OLD хадгалагдана). Зөвхөн админ засна.
--
-- Дахин ажиллуулахад эвдрэхгүй. Production дээр гараар ажиллуулна.

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS listed_from timestamptz,
  ADD COLUMN IF NOT EXISTS listed_until timestamptz,
  ADD COLUMN IF NOT EXISTS show_on_home boolean NOT NULL DEFAULT true;

ALTER TABLE public.studios DROP CONSTRAINT IF EXISTS studios_listing_window;
ALTER TABLE public.studios
  ADD CONSTRAINT studios_listing_window
  CHECK (listed_from IS NULL OR listed_until IS NULL OR listed_until >= listed_from);

COMMENT ON COLUMN public.studios.listed_from IS
  'Жагсаалт эхлэх мөч. NULL бол шууд (approved + is_visible үед).';
COMMENT ON COLUMN public.studios.listed_until IS
  'Жагсаалт дуусах мөч. NULL бол хязгааргүй. now() <= listed_until үед харагдана.';
COMMENT ON COLUMN public.studios.show_on_home IS
  'Нүүр хуудасны студийн хэсэг. Хайлтын is_visible-ээс тусдаа; нүүрэнд гарахад мөн жагсаалтын цонх хэрэгтэй.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'studios_public_idx'
  ) THEN
    EXECUTE $c$COMMENT ON INDEX public.studios_public_idx IS
      'Нийтийн хайлтын суурь: status = approved AND is_visible. Жагсаалтын цонх (listed_from/listed_until) болон нүүр (show_on_home) апп талд шүүгдэнэ.'$c$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.studios_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  -- Жагсаалтын цонх ба нүүр хуудас зөвхөн админы мэдэлд.
  IF NOT public.ai_is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.listed_from := NULL;
      NEW.listed_until := NULL;
      NEW.show_on_home := true;
    ELSE
      NEW.listed_from := OLD.listed_from;
      NEW.listed_until := OLD.listed_until;
      NEW.show_on_home := OLD.show_on_home;
    END IF;
  END IF;

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

NOTIFY pgrst, 'reload schema';
