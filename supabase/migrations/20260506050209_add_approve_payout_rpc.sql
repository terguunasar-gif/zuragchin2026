/*
  # Add approve_payout RPC

  ## Overview
  Atomically processes an admin-approved payout request:
  1. Verifies the payout request exists and is in 'pending' status
  2. Verifies the user has sufficient settled_balance
  3. Deducts amount from wallets.settled_balance
  4. Inserts a wallet_transaction of type 'payout'
  5. Updates payout_requests status to 'approved' (or 'paid') with processed_at timestamp

  ## Security
  SECURITY DEFINER runs as the function owner (superuser context) so it can
  update any user's wallet. The RPC is only callable by authenticated users;
  the application layer restricts the button to admin role users.
*/

CREATE OR REPLACE FUNCTION approve_payout(
  p_request_id  uuid,
  p_admin_id    uuid,
  p_admin_note  text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request   record;
  v_wallet    record;
BEGIN
  -- Fetch the payout request
  SELECT * INTO v_request
  FROM payout_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Payout request not found or already processed');
  END IF;

  -- Fetch the user's wallet
  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = v_request.user_id
  FOR UPDATE;

  IF NOT FOUND OR v_wallet.settled_balance < v_request.amount THEN
    RETURN jsonb_build_object('error', 'Insufficient settled balance');
  END IF;

  -- Deduct from settled_balance
  UPDATE wallets
    SET settled_balance = settled_balance - v_request.amount,
        updated_at      = now()
  WHERE user_id = v_request.user_id;

  -- Create payout wallet transaction
  INSERT INTO wallet_transactions (user_id, amount, type, description)
  VALUES (
    v_request.user_id,
    v_request.amount,
    'payout',
    'Payout to ' || (v_request.bank_info->>'bank_name') || ' — ' || (v_request.bank_info->>'account_number')
  );

  -- Mark request as paid
  UPDATE payout_requests
    SET status       = 'paid',
        admin_note   = p_admin_note,
        processed_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'amount', v_request.amount);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_payout(uuid, uuid, text) TO authenticated;
