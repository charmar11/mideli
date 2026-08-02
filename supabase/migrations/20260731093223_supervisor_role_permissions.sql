ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['owner', 'admin', 'waiter', 'kitchen', 'supervisor']));

ALTER POLICY "Orders created by staff" ON public.orders
  WITH CHECK (public.get_user_role() IN ('owner', 'admin', 'waiter', 'supervisor'));

ALTER POLICY "Orders updated by staff" ON public.orders
  USING (public.get_user_role() IN ('owner', 'admin', 'waiter', 'kitchen', 'supervisor'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin', 'waiter', 'kitchen', 'supervisor'));

ALTER POLICY "Order items managed by staff" ON public.order_items
  WITH CHECK (public.get_user_role() IN ('owner', 'admin', 'waiter', 'supervisor'));
