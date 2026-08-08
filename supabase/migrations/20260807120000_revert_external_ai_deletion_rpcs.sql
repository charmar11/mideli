-- Revert deletion RPCs introduced by an external AI after the approved baseline.
-- Keep the original migration files because they are already part of remote history.
-- This compensation removes capabilities only; it does not delete or rewrite data.

DROP FUNCTION IF EXISTS public.delete_cash_shift(uuid);
DROP FUNCTION IF EXISTS public.authorize_order_deletion(uuid, uuid, text);
DROP FUNCTION IF EXISTS private.authorize_order_deletion(uuid, uuid, text);
