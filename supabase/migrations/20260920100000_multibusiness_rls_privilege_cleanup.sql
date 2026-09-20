-- Restore the execution rights required by business-scoped RLS policies and
-- remove permissive legacy policies left behind by the initial schema.
--
-- The helpers are SECURITY DEFINER and are intentionally not callable by anon.
-- RLS evaluates them as part of an authenticated query, so authenticated must
-- retain EXECUTE even though the functions are not part of the public API.

GRANT EXECUTE ON FUNCTION private.multibusiness_can_view_business(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.multibusiness_mideli_business_id()
  TO authenticated;

-- These policies predate the business boundary and were not removed because
-- the multibusiness migrations used different policy names. Keeping them
-- would expose rows across businesses and, for the status log, allow an
-- authenticated user to insert an unvalidated history entry.
DROP POLICY IF EXISTS "Categories are viewable by authenticated users"
  ON public.categories;
DROP POLICY IF EXISTS "Menu items are viewable by authenticated users"
  ON public.menu_items;
DROP POLICY IF EXISTS "Order items are viewable by authenticated users"
  ON public.order_items;
DROP POLICY IF EXISTS "Authenticated users can insert status log"
  ON public.order_status_log;
DROP POLICY IF EXISTS "Order status log viewable by authenticated users"
  ON public.order_status_log;
DROP POLICY IF EXISTS "Orders are viewable by authenticated users"
  ON public.orders;
