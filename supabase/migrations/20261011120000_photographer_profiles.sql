-- Зурагчны профайл (нүүр хуудас, «Зурагчингууд» жагсаалт, ZUR-ID-ээр цомогт нэмэх).
-- Аль хэдийн байгаа бол юуг ч устгахгүй — дутуу багана, эрх, функцийг л нэмнэ.
CREATE TABLE IF NOT EXISTS public.photographer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.photographer_profiles
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS facebook text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS specialties text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS zur_id text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rating numeric(2,1),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS photographer_profiles_zur_id_key
  ON public.photographer_profiles (zur_id) WHERE zur_id IS NOT NULL;

-- ZUR-XXXXX дугаар үүсгэгч (байхгүй үед л үүсгэнэ)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'generate_zur_id'
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION public.generate_zur_id() RETURNS text
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $b$
      DECLARE
        chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        candidate text;
      BEGIN
        LOOP
          candidate := 'ZUR-';
          FOR i IN 1..5 LOOP
            candidate := candidate || substr(chars, 1 + floor(random() * length(chars))::int, 1);
          END LOOP;
          EXIT WHEN NOT EXISTS (SELECT 1 FROM public.photographer_profiles WHERE zur_id = candidate);
        END LOOP;
        RETURN candidate;
      END
      $b$;
    $f$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.generate_zur_id() TO authenticated';
  END IF;
END $$;

-- ZUR-ID-гүй хуучин мөрүүдэд дугаар өгнө
UPDATE public.photographer_profiles SET zur_id = public.generate_zur_id() WHERE zur_id IS NULL;

ALTER TABLE public.photographer_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.photographer_profiles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.photographer_profiles TO authenticated;

DROP POLICY IF EXISTS "pp_public_read_visible" ON public.photographer_profiles;
CREATE POLICY "pp_public_read_visible" ON public.photographer_profiles
  FOR SELECT TO anon, authenticated USING (is_visible = true);

DROP POLICY IF EXISTS "pp_own_read" ON public.photographer_profiles;
CREATE POLICY "pp_own_read" ON public.photographer_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "pp_own_insert" ON public.photographer_profiles;
CREATE POLICY "pp_own_insert" ON public.photographer_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "pp_own_update" ON public.photographer_profiles;
CREATE POLICY "pp_own_update" ON public.photographer_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "pp_own_delete" ON public.photographer_profiles;
CREATE POLICY "pp_own_delete" ON public.photographer_profiles
  FOR DELETE TO authenticated USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
