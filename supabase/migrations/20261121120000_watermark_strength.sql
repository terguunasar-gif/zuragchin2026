-- Худалдах цомгийн усан тамганы хүч: light | medium | strong (анхдагч medium)
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS watermark_strength text NOT NULL DEFAULT 'medium'
  CHECK (watermark_strength IN ('light','medium','strong'));
NOTIFY pgrst, 'reload schema';
