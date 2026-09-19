-- Cierre de seguridad y precondiciones operativas del primer corte
-- multinegocio.
--
-- Esta migración es forward-only. No borra datos ni intenta revertir una
-- migración aplicada. Corrige permisos, separa las cajas por negocio y hace
-- que una comanda compartida no pueda saltarse las precondiciones del turno.

-- =====================================================
-- VISIBILIDAD: solo organizaciones y negocios no retirados
-- =====================================================

CREATE OR REPLACE FUNCTION private.multibusiness_can_view_organization(
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.organizations AS organization
       WHERE organization.id = p_organization_id
         AND organization.lifecycle_status <> 'retired'
         AND EXISTS (
           SELECT 1
             FROM public.memberships AS membership
            WHERE membership.user_id = auth.uid()
              AND membership.status = 'active'
              AND (
                membership.scope_type = 'platform'
                OR membership.organization_id = p_organization_id
                OR EXISTS (
                  SELECT 1
                    FROM public.businesses AS business
                   WHERE business.id = membership.business_id
                     AND business.organization_id = p_organization_id
                     AND business.lifecycle_status NOT IN ('archived', 'retired')
                )
              )
         )
    );
$$;

CREATE OR REPLACE FUNCTION private.multibusiness_can_view_business(
  p_business_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_requested_business_id uuid;
BEGIN
  v_requested_business_id := private.multibusiness_requested_business_id();

  IF v_requested_business_id IS NOT NULL
     AND p_business_id IS DISTINCT FROM v_requested_business_id THEN
    RETURN false;
  END IF;

  RETURN auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.businesses AS business
        JOIN public.organizations AS organization
          ON organization.id = business.organization_id
       WHERE business.id = p_business_id
         AND business.lifecycle_status NOT IN ('archived', 'retired')
         AND organization.lifecycle_status <> 'retired'
         AND EXISTS (
           SELECT 1
             FROM public.memberships AS membership
            WHERE membership.user_id = auth.uid()
              AND membership.status = 'active'
              AND (
                membership.scope_type = 'platform'
                OR membership.business_id = business.id
                OR membership.organization_id = business.organization_id
              )
         )
    );
END;
$$;

-- =====================================================
-- CAJA: una caja abierta por negocio, no una por toda la instalación
-- =====================================================

DROP INDEX IF EXISTS public.cash_shifts_single_open_idx;

CREATE UNIQUE INDEX IF NOT EXISTS cash_shifts_open_per_business_idx
  ON public.cash_shifts (business_id)
  WHERE status = 'open' AND business_id IS NOT NULL;

-- Durante la compatibilidad previa al backfill, como máximo puede existir una
-- caja abierta sin negocio asociado. Esto evita que el fallback legado quede
-- ambiguo mientras Mideli termina de migrarse.
CREATE UNIQUE INDEX IF NOT EXISTS cash_shifts_open_legacy_idx
  ON public.cash_shifts (status)
  WHERE status = 'open' AND business_id IS NULL;

-- =====================================================
-- COMANDA MIXTA: cada negocio debe estar activo y tener caja abierta
-- =====================================================

CREATE OR REPLACE FUNCTION private.multibusiness_validate_batch_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_business_status text;
  v_organization_id uuid;
BEGIN
  IF NEW.order_batch_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT business.organization_id, business.lifecycle_status
    INTO v_organization_id, v_business_status
    FROM public.businesses AS business
   WHERE business.id = NEW.business_id;

  IF v_organization_id IS NULL OR v_business_status <> 'active' THEN
    RAISE EXCEPTION 'El negocio de la comanda no está activo';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.cash_shifts AS shift
     WHERE shift.business_id = NEW.business_id
       AND shift.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Abre la caja del negocio antes de enviar la comanda';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_validate_batch_business
  ON public.orders;
CREATE TRIGGER orders_validate_batch_business
  BEFORE INSERT OR UPDATE OF business_id, order_batch_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_validate_batch_business();

-- =====================================================
-- RPC heredados: ningún cliente anónimo debe invocarlos
-- =====================================================

REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Es una función de trigger, no una operación de la API.
REVOKE ALL ON FUNCTION public.set_order_created_by() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.multibusiness_validate_batch_business()
  FROM PUBLIC, anon, authenticated;
