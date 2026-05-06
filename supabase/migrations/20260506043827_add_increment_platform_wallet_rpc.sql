/*
  # Add increment_platform_wallet RPC

  Atomically increments platform_wallet balance and total_earned.
  Upserts the single platform_wallet row if it doesn't exist.
*/

CREATE OR REPLACE FUNCTION increment_platform_wallet(p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM platform_wallet LIMIT 1) THEN
    UPDATE platform_wallet
      SET balance      = balance + p_amount,
          total_earned = total_earned + p_amount,
          updated_at   = now();
  ELSE
    INSERT INTO platform_wallet (balance, total_earned, updated_at)
    VALUES (p_amount, p_amount, now());
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_platform_wallet(numeric) TO authenticated;
