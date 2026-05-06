/*
  # Fix function EXECUTE permissions — revoke from PUBLIC first

  In PostgreSQL, CREATE FUNCTION grants EXECUTE to PUBLIC by default.
  REVOKE on individual roles doesn't override that inherited PUBLIC grant.
  The correct approach is:
    1. REVOKE EXECUTE ... FROM PUBLIC
    2. GRANT EXECUTE back only to the roles that legitimately need it.

  ## Permission matrix after this migration:
  - approve_payout:           authenticated only (admin check enforced inside)
  - settle_album:             authenticated only (owner check enforced inside)
  - create_user_wallet:       service_role only  (trigger context)
  - handle_new_auth_user:     service_role only  (trigger context)
  - increment_platform_wallet: service_role only (called by other SECURITY DEFINER fns)
  - increment_wallet_pending:  service_role only (called by other SECURITY DEFINER fns)
*/

-- approve_payout
REVOKE EXECUTE ON FUNCTION public.approve_payout(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_payout(uuid, uuid, text) TO authenticated;

-- settle_album
REVOKE EXECUTE ON FUNCTION public.settle_album(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.settle_album(uuid, uuid) TO authenticated;

-- Internal trigger / helper functions — service_role only
REVOKE EXECUTE ON FUNCTION public.create_user_wallet()                    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_user_wallet()                    TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user()                  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.handle_new_auth_user()                  TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_platform_wallet(numeric)      FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_platform_wallet(numeric)      TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_wallet_pending(uuid, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_wallet_pending(uuid, numeric) TO service_role;
