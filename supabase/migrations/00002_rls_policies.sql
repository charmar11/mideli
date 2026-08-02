-- RLS Policies - Role-based access control

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.get_user_role() IN ('owner', 'admin');
$$;

-- =====================================================
-- CATEGORIES: everyone reads, admins modify
-- =====================================================
CREATE POLICY "Categories viewable by staff" ON public.categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Categories managed by admins" ON public.categories
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (public.is_admin());

-- =====================================================
-- MENU ITEMS: everyone reads, admins modify
-- =====================================================
CREATE POLICY "Menu items viewable by staff" ON public.menu_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Menu items managed by admins" ON public.menu_items
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (public.is_admin());

-- =====================================================
-- ORDERS: staff reads, waiters+admins insert,
-- kitchen+waiters+admins update, admins delete
-- =====================================================
CREATE POLICY "Orders viewable by staff" ON public.orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Orders created by staff" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('owner', 'admin', 'waiter'));

CREATE POLICY "Orders updated by staff" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('owner', 'admin', 'waiter', 'kitchen'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin', 'waiter', 'kitchen'));

CREATE POLICY "Orders deleted by admins" ON public.orders
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- =====================================================
-- ORDER ITEMS: staff reads, waiters+admins write
-- =====================================================
CREATE POLICY "Order items viewable by staff" ON public.order_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Order items managed by staff" ON public.order_items
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (public.get_user_role() IN ('owner', 'admin', 'waiter'));

-- =====================================================
-- ORDER STATUS LOG: staff reads, staff inserts
-- =====================================================
CREATE POLICY "Order status log viewable by staff" ON public.order_status_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Order status log insert by staff" ON public.order_status_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- =====================================================
-- PROFILES: users read own, admins read all, admins manage
-- =====================================================
CREATE POLICY "Profiles viewable by staff" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "Profiles insert by admins" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Profiles update by self or admins" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "Profiles delete by admins" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_order_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_order_created_by ON public.orders;
CREATE TRIGGER trigger_set_order_created_by
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_created_by();
