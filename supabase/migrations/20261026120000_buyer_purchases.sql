-- Худалдан авагчийн хэсэг: нэвтэрсэн хэрэглэгчийн худалдан авалтууд.
-- Нэвтэрч байж төлсөн бол buyer_id автоматаар бичигдэнэ (edge функц).
-- Нэвтрэлгүй төлсөн бол энэ төхөөрөмжид хадгалагдсан баримтын дугаараар (localStorage) өөртөө холбоно.

CREATE OR REPLACE FUNCTION public.claim_purchases(p_invoice_ids text[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()) THEN RETURN 0; END IF;
  UPDATE public.purchases SET buyer_id = auth.uid()
   WHERE buyer_id IS NULL
     AND payment_status = 'paid'
     AND qpay_invoice_id = ANY ((COALESCE(p_invoice_ids, ARRAY[]::text[]))[1:200]);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_purchases(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_purchases(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_purchases()
RETURNS TABLE (
  id uuid, qpay_invoice_id text, created_at timestamptz, album_name text, share_link text,
  preview_url text, filename text, type text, print_size text, gross_amount numeric, print_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.qpay_invoice_id, p.created_at,
         COALESCE(NULLIF(a.title, ''), a.name, ''), COALESCE(a.share_link, ''),
         ph.preview_url, ph.filename, p.type, p.print_size, p.gross_amount, p.print_status
    FROM public.purchases p
    LEFT JOIN public.albums a ON a.id = p.album_id
    LEFT JOIN public.photo_uploads ph ON ph.id = p.photo_id
   WHERE auth.uid() IS NOT NULL AND p.buyer_id = auth.uid() AND p.payment_status = 'paid'
   ORDER BY p.created_at DESC
   LIMIT 500;
$$;
REVOKE EXECUTE ON FUNCTION public.my_purchases() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_purchases() TO authenticated;

NOTIFY pgrst, 'reload schema';
