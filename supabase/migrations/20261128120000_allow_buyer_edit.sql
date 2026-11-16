-- Худалдан авагч худалдаж авсан зургаа (тайрах, гэрэл/өнгө) засах эрх — цомгийн эзэн тохируулна
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS allow_buyer_edit boolean NOT NULL DEFAULT true;
NOTIFY pgrst, 'reload schema';
