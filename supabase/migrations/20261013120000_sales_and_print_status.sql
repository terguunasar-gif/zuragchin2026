-- Борлуулалт, угаалгах захиалгын төлөв, баримтын аюулгүй байдал.

-- 1) Угаалгах захиалгын төлөв
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS print_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS print_status_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_print_status_check') THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_print_status_check CHECK (print_status IN ('pending','printed','delivered'));
  END IF;
END $$;

-- 2) Нэвтрээгүй хэн ч бүх худалдан авалтыг (нэр, утастай нь) уншдаг байсныг хаана.
--    Баримт хуудас доорх receipt_purchases()-оор зөвхөн өөрийн нэхэмжлэхийг уншина.
DROP POLICY IF EXISTS "Anyone can read purchases" ON public.purchases;

-- 3) Баримт: нэхэмжлэхийн дугаараар тухайн захиалгын мөрүүд
CREATE OR REPLACE FUNCTION public.receipt_purchases(p_invoice_id text)
RETURNS TABLE (
  id uuid, photo_id uuid, type text, print_size text, gross_amount numeric,
  payment_status text, photographer_id uuid, buyer_name text, buyer_phone text,
  album_id uuid, created_at timestamptz, print_status text,
  preview_url text, original_url text, filename text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.photo_id, p.type, p.print_size, p.gross_amount,
         p.payment_status, p.photographer_id, p.buyer_name, p.buyer_phone,
         p.album_id, p.created_at, p.print_status,
         ph.preview_url,
         CASE WHEN p.payment_status = 'paid' AND p.type = 'download' THEN ph.original_url ELSE NULL END,
         ph.filename
  FROM public.purchases p
  LEFT JOIN public.photo_uploads ph ON ph.id = p.photo_id
  WHERE coalesce(p_invoice_id, '') <> '' AND p.qpay_invoice_id = p_invoice_id
  ORDER BY p.created_at;
$$;
REVOKE EXECUTE ON FUNCTION public.receipt_purchases(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receipt_purchases(text) TO anon, authenticated;

-- 4) Миний борлуулалт: зурагчин (өөрийн зураг) ба цомгийн эзэн (өөрийн цомог)
CREATE OR REPLACE FUNCTION public.my_sales()
RETURNS TABLE (
  id uuid, created_at timestamptz, qpay_invoice_id text,
  album_id uuid, album_name text, photo_id uuid, preview_url text, filename text,
  type text, print_size text, gross_amount numeric,
  photographer_amount numeric, owner_amount numeric,
  is_my_photo boolean, is_my_album boolean,
  buyer_name text, buyer_phone text,
  print_status text, photographer_id uuid, photographer_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.created_at, p.qpay_invoice_id,
         p.album_id, COALESCE(NULLIF(a.title, ''), a.name, ''), p.photo_id, ph.preview_url, ph.filename,
         p.type, p.print_size, p.gross_amount,
         p.photographer_pool_amount, p.owner_amount,
         p.photographer_id = auth.uid(), a.owner_id = auth.uid(),
         p.buyer_name,
         CASE WHEN p.type = 'print' THEN p.buyer_phone ELSE '' END,
         p.print_status, p.photographer_id,
         COALESCE(NULLIF(pp.display_name, ''), u.name, '')
  FROM public.purchases p
  JOIN public.albums a ON a.id = p.album_id
  LEFT JOIN public.photo_uploads ph ON ph.id = p.photo_id
  LEFT JOIN public.photographer_profiles pp ON pp.user_id = p.photographer_id
  LEFT JOIN public.users u ON u.id = p.photographer_id
  WHERE p.payment_status = 'paid'
    AND auth.uid() IS NOT NULL
    AND (p.photographer_id = auth.uid() OR a.owner_id = auth.uid())
  ORDER BY p.created_at DESC
  LIMIT 1000;
$$;
REVOKE EXECUTE ON FUNCTION public.my_sales() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_sales() TO authenticated;

-- 5) Угаалгах захиалгын төлөв солих (зурагчин эсвэл цомгийн эзэн/админ)
CREATE OR REPLACE FUNCTION public.set_print_status(p_purchase_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF p_status NOT IN ('pending','printed','delivered') THEN
    RAISE EXCEPTION 'Буруу төлөв: %', p_status;
  END IF;
  SELECT p.id, p.type, p.payment_status, p.photographer_id, p.album_id INTO r
  FROM public.purchases p WHERE p.id = p_purchase_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Захиалга олдсонгүй'; END IF;
  IF r.type <> 'print' OR r.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Зөвхөн төлөгдсөн угаалгах захиалгын төлөвийг солино';
  END IF;
  IF NOT (r.photographer_id = auth.uid() OR public.ai_can_manage_album(r.album_id)) THEN
    RAISE EXCEPTION 'Эрх хүрэлцэхгүй байна';
  END IF;
  UPDATE public.purchases
     SET print_status = p_status, print_status_updated_at = now()
   WHERE id = p_purchase_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_print_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_print_status(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
