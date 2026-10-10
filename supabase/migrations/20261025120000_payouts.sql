-- Мөнгө татах: зурагчин / зохион байгуулагч өөрийн орлогоо банкны данс руу татах хүсэлт гаргана,
-- админ банкаар шилжүүлээд «Шилжүүлсэн» гэж тэмдэглэнэ. Татгалзвал мөнгө түрийвчинд буцаж орно.
--
-- Хүсэлт гаргах үед дүнг түрийвчнээс шууд хасаж «барина» → давхар хүсэлт, илүү татахаас сэргийлнэ.
-- Татах боломжтой дүн = pending_balance + settled_balance.

-- 1) Төлөв: paid нэмнэ
ALTER TABLE public.payout_requests DROP CONSTRAINT IF EXISTS payout_requests_status_check;
ALTER TABLE public.payout_requests
  ADD CONSTRAINT payout_requests_status_check CHECK (status IN ('pending', 'approved', 'paid', 'rejected'));

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS from_pending numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS from_settled numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS held boolean NOT NULL DEFAULT false;

-- 2) Хамгийн бага дүн (админ өөрчилнө)
INSERT INTO public.platform_settings (key, value) VALUES ('payout_min', '10000'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3) Хэрэглэгч хүснэгтэд шууд бичихгүй — зөвхөн RPC-ээр
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'payout_requests' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.payout_requests', pol.policyname);
  END LOOP;
END $$;

-- Хуучин approve_payout-ыг ямар ч нэвтэрсэн хэрэглэгч дуудаж чаддаг байсныг хаана
DO $$
BEGIN
  IF to_regprocedure('public.approve_payout(uuid,uuid,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.approve_payout(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 4) Мөнгө татах хүсэлт
CREATE OR REPLACE FUNCTION public.request_payout(p_amount numeric, p_bank jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_min numeric;
  w record;
  v_amount numeric := round(coalesce(p_amount, 0));
  v_from_settled numeric;
  v_from_pending numeric;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Нэвтэрнэ үү'; END IF;
  SELECT coalesce((SELECT (value #>> '{}')::numeric FROM platform_settings WHERE key = 'payout_min'), 10000) INTO v_min;
  IF v_amount < v_min THEN RAISE EXCEPTION 'Хамгийн бага дүн ₮%', to_char(v_min, 'FM999,999,999'); END IF;
  IF length(trim(coalesce(p_bank->>'bank_name', ''))) = 0
     OR coalesce(p_bank->>'account_number', '') !~ '^[0-9 ]{6,30}$'
     OR length(trim(coalesce(p_bank->>'account_holder', ''))) < 2 THEN
    RAISE EXCEPTION 'Банк, дансны дугаар, эзэмшигчийн нэрийг зөв оруулна уу';
  END IF;
  IF EXISTS (SELECT 1 FROM payout_requests WHERE user_id = v_uid AND status = 'pending') THEN
    RAISE EXCEPTION 'Өмнөх хүсэлт шийдвэрлэгдээгүй байна';
  END IF;

  SELECT * INTO w FROM wallets WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND OR (w.pending_balance + w.settled_balance) < v_amount THEN
    RAISE EXCEPTION 'Үлдэгдэл хүрэлцэхгүй байна';
  END IF;

  v_from_settled := LEAST(w.settled_balance, v_amount);
  v_from_pending := v_amount - v_from_settled;
  UPDATE wallets
     SET settled_balance = settled_balance - v_from_settled,
         pending_balance = pending_balance - v_from_pending,
         updated_at = now()
   WHERE user_id = v_uid;

  INSERT INTO payout_requests (user_id, amount, status, bank_info, from_pending, from_settled, held)
  VALUES (v_uid, v_amount, 'pending',
          jsonb_build_object('bank_name', trim(p_bank->>'bank_name'),
                             'account_number', regexp_replace(p_bank->>'account_number', '\s', '', 'g'),
                             'account_holder', trim(p_bank->>'account_holder')),
          v_from_pending, v_from_settled, true)
  RETURNING id INTO v_id;

  INSERT INTO wallet_transactions (user_id, amount, type, description)
  VALUES (v_uid, -v_amount, 'payout', 'Мөнгө татах хүсэлт · ' || trim(p_bank->>'bank_name'));
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.request_payout(numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric, jsonb) TO authenticated;

-- 5) Админ: банкаар шилжүүлсний дараа «Шилжүүлсэн»
CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(p_id uuid, p_note text DEFAULT '')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT public.ai_is_admin() THEN RAISE EXCEPTION 'Эрх хүрэлцэхгүй'; END IF;
  SELECT * INTO r FROM payout_requests WHERE id = p_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Хүсэлт олдсонгүй эсвэл шийдвэрлэгдсэн'; END IF;
  -- Хуучин хэлбэрээр (дүн барьж аваагүй) үүссэн хүсэлт бол одоо хасна
  IF NOT r.held THEN
    UPDATE wallets SET settled_balance = settled_balance - LEAST(settled_balance, r.amount),
                       pending_balance = pending_balance - GREATEST(0, r.amount - settled_balance),
                       updated_at = now()
     WHERE user_id = r.user_id;
  END IF;
  UPDATE payout_requests SET status = 'paid', admin_note = coalesce(p_note, ''), processed_at = now() WHERE id = p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text) TO authenticated;

-- 6) Админ: татгалзах → барьсан дүн түрийвчинд буцна
CREATE OR REPLACE FUNCTION public.admin_reject_payout(p_id uuid, p_note text DEFAULT '')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT public.ai_is_admin() THEN RAISE EXCEPTION 'Эрх хүрэлцэхгүй'; END IF;
  SELECT * INTO r FROM payout_requests WHERE id = p_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Хүсэлт олдсонгүй эсвэл шийдвэрлэгдсэн'; END IF;
  IF r.held THEN
    UPDATE wallets SET settled_balance = settled_balance + r.from_settled,
                       pending_balance = pending_balance + r.from_pending,
                       updated_at = now()
     WHERE user_id = r.user_id;
    INSERT INTO wallet_transactions (user_id, amount, type, description)
    VALUES (r.user_id, r.amount, 'refund', 'Мөнгө татах хүсэлт цуцлагдсан' || CASE WHEN coalesce(p_note, '') <> '' THEN ' · ' || p_note ELSE '' END);
  END IF;
  UPDATE payout_requests SET status = 'rejected', admin_note = coalesce(p_note, ''), processed_at = now() WHERE id = p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_reject_payout(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_payout(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
