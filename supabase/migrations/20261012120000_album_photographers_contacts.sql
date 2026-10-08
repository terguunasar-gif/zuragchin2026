-- 1) Цомгийн эзэн (админ) өөрийн цомогт зурагчин нэмэх / хасах эрх.
--    Өмнө нь зөвхөн зурагчин өөрөө хүсэлт илгээх эрхтэй байсан тул ZUR-ID-ээр нэмэхэд нуугдмал алдаа гардаг байв.
DROP POLICY IF EXISTS "Album owners can add photographers" ON public.album_photographers;
CREATE POLICY "Album owners can add photographers"
  ON public.album_photographers FOR INSERT TO authenticated
  WITH CHECK (public.ai_can_manage_album(album_id));

DROP POLICY IF EXISTS "Album owners can remove photographers" ON public.album_photographers;
CREATE POLICY "Album owners can remove photographers"
  ON public.album_photographers FOR DELETE TO authenticated
  USING (public.ai_can_manage_album(album_id));

-- 2) ZUR-ID-ээр зурагчин хайх (профайл нь нүүр хуудсанд нуугдсан байсан ч олдоно).
CREATE OR REPLACE FUNCTION public.find_photographer_by_zur_id(p_zur_id text)
RETURNS TABLE (user_id uuid, display_name text, zur_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pp.user_id, pp.display_name, pp.zur_id
  FROM public.photographer_profiles pp
  WHERE upper(pp.zur_id) = upper(trim(p_zur_id))
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.find_photographer_by_zur_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_photographer_by_zur_id(text) TO authenticated;

-- 3) Цомгийн зурагчдын жагсаалт (зөвхөн цомгийн эзэн/админд).
CREATE OR REPLACE FUNCTION public.album_photographer_list(p_album_id uuid)
RETURNS TABLE (photographer_id uuid, display_name text, zur_id text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ap.photographer_id,
         COALESCE(NULLIF(pp.display_name, ''), u.name, 'Зурагчин') AS display_name,
         COALESCE(pp.zur_id, '') AS zur_id,
         ap.status
  FROM public.album_photographers ap
  LEFT JOIN public.photographer_profiles pp ON pp.user_id = ap.photographer_id
  LEFT JOIN public.users u ON u.id = ap.photographer_id
  WHERE ap.album_id = p_album_id
    AND public.ai_can_manage_album(p_album_id)
  ORDER BY ap.joined_at;
$$;
REVOKE EXECUTE ON FUNCTION public.album_photographer_list(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.album_photographer_list(uuid) TO authenticated;

-- 4) Баримт дээр угаалгах захиалгын зурагчны холбоо барих мэдээлэл.
--    Зөвхөн тухайн нэхэмжлэхийн дугаартай хүнд (баримт эзэмшигчид) харагдана.
CREATE OR REPLACE FUNCTION public.receipt_print_contacts(p_invoice_id text)
RETURNS TABLE (photographer_id uuid, display_name text, phone text, facebook text, instagram text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.photographer_id,
         COALESCE(NULLIF(pp.display_name, ''), u.name, 'Зурагчин'),
         COALESCE(pp.phone, ''),
         COALESCE(pp.facebook, ''),
         COALESCE(pp.instagram, '')
  FROM public.purchases p
  LEFT JOIN public.photographer_profiles pp ON pp.user_id = p.photographer_id
  LEFT JOIN public.users u ON u.id = p.photographer_id
  WHERE p.qpay_invoice_id = p_invoice_id
    AND coalesce(p_invoice_id, '') <> ''
    AND p.type = 'print';
$$;
REVOKE EXECUTE ON FUNCTION public.receipt_print_contacts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receipt_print_contacts(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
