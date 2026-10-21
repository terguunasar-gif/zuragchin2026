-- update-79: Зурагчны профайлд өөрийн шилдэг 5 зураг (портфолио)
-- Зургууд «covers» bucket-ийн <uid>/portfolio/ хавтсанд (олон нийт уншина, эзэн нь л бичнэ — одоогийн policy хангана).
ALTER TABLE public.photographer_profiles
  ADD COLUMN IF NOT EXISTS portfolio_urls text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.photographer_profiles DROP CONSTRAINT IF EXISTS photographer_portfolio_max5;
ALTER TABLE public.photographer_profiles
  ADD CONSTRAINT photographer_portfolio_max5 CHECK (cardinality(portfolio_urls) <= 5);

NOTIFY pgrst, 'reload schema';
