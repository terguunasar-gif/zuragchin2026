-- Баримт дээр аль зургийг нь татсаныг харуулахын тулд download_count-ыг буцаана.
-- Өгөгдлийн багана аль хэдийн байгаа. Функцийн буцаалтын хүснэгт өөрчлөгдөх тул дахин үүсгэнэ.
-- Энэ файлыг production дээр хараахан ажиллуулаагүй.

DROP FUNCTION IF EXISTS public.receipt_purchases(text);

CREATE FUNCTION public.receipt_purchases(p_invoice_id text)
RETURNS TABLE (
  id uuid, photo_id uuid, type text, print_size text, gross_amount numeric,
  payment_status text, photographer_id uuid, buyer_name text, buyer_phone text,
  album_id uuid, created_at timestamptz, print_status text, download_count integer,
  preview_url text, original_url text, filename text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.photo_id, p.type, p.print_size, p.gross_amount,
         p.payment_status, p.photographer_id, p.buyer_name, p.buyer_phone,
         p.album_id, p.created_at, p.print_status, p.download_count,
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
