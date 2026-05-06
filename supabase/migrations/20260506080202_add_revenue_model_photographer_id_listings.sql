/*
  # Add Revenue Model, Photographer ID, Event Listings, and Event Applications

  ## Changes

  ### 1. albums table
  - Add `revenue_model` text column: 'shared' (default) or 'owned'
    - 'shared': photographers earn % of sales (86% pool)
    - 'owned': organizer pre-paid photographers, organizer gets 96% (QPay 1% + Platform 3%)

  ### 2. users table
  - Add `photographer_id` text column: unique ZUR-XXXXX identifier
    generated when user activates photographer role

  ### 3. event_listings table
  - Job board: organizers post photographer hiring listings
  - Fields: title, event_date, location, photographer_count, description, compensation, contact_info, status

  ### 4. event_applications table
  - Photographer applications to listings
  - Fields: listing_id, photographer_id (user uuid), message, status

  ### 5. RLS policies for new tables

  ### 6. Function to generate unique ZUR-XXXXX photographer IDs
*/

-- ── 1. albums: add revenue_model ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'albums' AND column_name = 'revenue_model'
  ) THEN
    ALTER TABLE public.albums ADD COLUMN revenue_model text NOT NULL DEFAULT 'shared'
      CHECK (revenue_model IN ('shared', 'owned'));
  END IF;
END $$;

-- ── 2. users: add photographer_id ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'photographer_id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN photographer_id text UNIQUE;
  END IF;
END $$;

-- ── 3. Function to generate unique ZUR-XXXXX IDs ──────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_photographer_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id text;
  v_exists boolean;
BEGIN
  LOOP
    v_id := 'ZUR-' || LPAD(FLOOR(random() * 99999 + 1)::text, 5, '0');
    SELECT EXISTS(SELECT 1 FROM public.users WHERE photographer_id = v_id) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_photographer_id() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generate_photographer_id() TO authenticated;

-- ── 4. event_listings table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_listings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title                   text NOT NULL,
  event_date              date NOT NULL,
  location                text NOT NULL DEFAULT '',
  photographer_count      integer NOT NULL DEFAULT 1,
  description             text DEFAULT '',
  compensation            text DEFAULT '',
  contact_info            text DEFAULT '',
  status                  text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE public.event_listings ENABLE ROW LEVEL SECURITY;

-- Public read for open listings (no login required)
CREATE POLICY "Anyone can view open listings"
  ON public.event_listings FOR SELECT
  TO anon, authenticated
  USING (status = 'open');

-- Organizers can view all their own listings
CREATE POLICY "Organizers can view own listings"
  ON public.event_listings FOR SELECT
  TO authenticated
  USING (organizer_id = auth.uid());

-- Organizers can insert listings
CREATE POLICY "Organizers can insert listings"
  ON public.event_listings FOR INSERT
  TO authenticated
  WITH CHECK (organizer_id = auth.uid());

-- Organizers can update own listings
CREATE POLICY "Organizers can update own listings"
  ON public.event_listings FOR UPDATE
  TO authenticated
  USING (organizer_id = auth.uid())
  WITH CHECK (organizer_id = auth.uid());

-- ── 5. event_applications table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES public.event_listings(id) ON DELETE CASCADE,
  photographer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message         text DEFAULT '',
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at      timestamptz DEFAULT now(),
  UNIQUE(listing_id, photographer_id)
);

ALTER TABLE public.event_applications ENABLE ROW LEVEL SECURITY;

-- Photographers can view own applications
CREATE POLICY "Photographers can view own applications"
  ON public.event_applications FOR SELECT
  TO authenticated
  USING (photographer_id = auth.uid());

-- Photographers can submit applications
CREATE POLICY "Photographers can insert applications"
  ON public.event_applications FOR INSERT
  TO authenticated
  WITH CHECK (photographer_id = auth.uid());

-- Organizers can view applications for their listings
CREATE POLICY "Organizers can view applications to their listings"
  ON public.event_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_listings el
      WHERE el.id = listing_id AND el.organizer_id = auth.uid()
    )
  );

-- Organizers can update application status (approve/reject)
CREATE POLICY "Organizers can update application status"
  ON public.event_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_listings el
      WHERE el.id = listing_id AND el.organizer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_listings el
      WHERE el.id = listing_id AND el.organizer_id = auth.uid()
    )
  );

-- ── 6. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_event_listings_organizer_id ON public.event_listings(organizer_id);
CREATE INDEX IF NOT EXISTS idx_event_listings_status       ON public.event_listings(status);
CREATE INDEX IF NOT EXISTS idx_event_applications_listing  ON public.event_applications(listing_id);
CREATE INDEX IF NOT EXISTS idx_event_applications_photo    ON public.event_applications(photographer_id);
CREATE INDEX IF NOT EXISTS idx_users_photographer_id       ON public.users(photographer_id);
