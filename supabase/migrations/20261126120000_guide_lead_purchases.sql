-- Дахин орсон зочинд зөвхөн өөрийн lead_token-д бүртгэлтэй төлсөн зургийг харуулна.
-- Утасны дугаараар хайхгүй. Энэ файлыг production дээр хараахан ажиллуулаагүй.

ALTER TABLE public.album_guide_leads
  ADD COLUMN IF NOT EXISTS paid_invoices jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.mark_album_guide_paid(
  p_album_id uuid,
  p_token text,
  p_invoice text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  inv text := left(coalesce(p_invoice, ''), 80);
BEGIN
  UPDATE public.album_guide_leads l
     SET paid_invoice = inv,
         paid_invoices = (
           SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
             FROM (
               SELECT DISTINCT v AS x
                 FROM (
                   SELECT jsonb_array_elements_text(coalesce(l.paid_invoices, '[]'::jsonb)) AS v
                   UNION ALL
                   SELECT inv
                 ) s
                WHERE v <> ''
             ) d
         ),
         step = 'done',
         updated_at = now()
   WHERE l.album_id = p_album_id AND l.lead_token = p_token;
END $$;

CREATE OR REPLACE FUNCTION public.guide_lead_purchases(
  p_album_id uuid,
  p_token text
) RETURNS TABLE (
  id uuid,
  photo_id uuid,
  type text,
  print_size text,
  qpay_invoice_id text,
  download_expires_at timestamptz,
  filename text,
  preview_url text,
  photographer_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT p.id, p.photo_id, p.type, p.print_size, p.qpay_invoice_id,
         p.download_expires_at, ph.filename, ph.preview_url, p.photographer_id
    FROM public.album_guide_leads l
    JOIN public.purchases p
      ON p.album_id = l.album_id
     AND p.payment_status = 'paid'
     AND p.qpay_invoice_id IN (
       SELECT jsonb_array_elements_text(coalesce(l.paid_invoices, '[]'::jsonb))
       UNION
       SELECT l.paid_invoice
        WHERE coalesce(l.paid_invoice, '') <> ''
     )
    LEFT JOIN public.photo_uploads ph ON ph.id = p.photo_id
   WHERE l.album_id = p_album_id
     AND l.lead_token = p_token
     AND length(coalesce(p_token, '')) >= 8;
$$;

REVOKE ALL ON FUNCTION public.mark_album_guide_paid(uuid, text, text) FROM public;
REVOKE ALL ON FUNCTION public.guide_lead_purchases(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_album_guide_paid(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guide_lead_purchases(uuid, text) TO anon, authenticated;
