-- Staff-management RPCs require a signed-in operator.  SECURITY DEFINER
-- functions are still responsible for their capability checks, but anon must
-- not be able to call them through the Data API at all.

REVOKE ALL ON FUNCTION public.create_business_staff_membership(
  uuid, uuid, text, boolean
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_staff_membership(
  uuid, uuid, text, boolean
)
TO authenticated;

REVOKE ALL ON FUNCTION public.create_global_waiter_membership(
  uuid, uuid, boolean
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_global_waiter_membership(
  uuid, uuid, boolean
)
TO authenticated;

REVOKE ALL ON FUNCTION public.set_multibusiness_membership_status(
  uuid, text, text
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_multibusiness_membership_status(
  uuid, text, text
)
TO authenticated;

REVOKE ALL ON FUNCTION public.update_business_staff_membership_role(
  uuid, text
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_business_staff_membership_role(
  uuid, text
)
TO authenticated;
