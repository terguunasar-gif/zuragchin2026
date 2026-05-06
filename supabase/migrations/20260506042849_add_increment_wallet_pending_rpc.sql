/*
  # Add increment_wallet_pending RPC function

  ## Overview
  Provides a safe, atomic way to increment a user's pending_balance in the wallets table.
  Used by the QPay edge function (running as service role) after payment confirmation to credit
  photographer and organizer wallets without race conditions.

  ## Function
  - `increment_wallet_pending(p_user_id uuid, p_amount numeric)` — adds p_amount to pending_balance
    and total_earned, upserts the wallet row if it doesn't exist yet.
*/

CREATE OR REPLACE FUNCTION increment_wallet_pending(p_user_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO wallets (user_id, pending_balance, total_earned, updated_at)
  VALUES (p_user_id, p_amount, p_amount, now())
  ON CONFLICT (user_id) DO UPDATE
    SET pending_balance = wallets.pending_balance + p_amount,
        total_earned    = wallets.total_earned + p_amount,
        updated_at      = now();
END;
$$;
