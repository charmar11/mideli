-- Route order creation and edits through business-aware RPCs once the
-- multibusiness schema is active. The legacy functions stay available only
-- during the pre-migration compatibility window.

CREATE OR REPLACE FUNCTION public.update_business_order_with_items(
  p_business_id uuid,
  p_order_id uuid,
  p_items jsonb,
  p_total integer,
  p_table_number text DEFAULT NULL,
  p_table_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_organization_id uuid;
  v_order_business_id uuid;
BEGIN
  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status = 'active';

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio no está disponible para editar pedidos';
  END IF;

  SELECT order_row.business_id
    INTO v_order_business_id
    FROM public.orders AS order_row
   WHERE order_row.id = p_order_id
   FOR UPDATE;

  IF v_order_business_id IS NULL THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;
  IF v_order_business_id IS DISTINCT FROM p_business_id THEN
    RAISE EXCEPTION 'El pedido pertenece a otro negocio';
  END IF;

  IF NOT (
    private.multibusiness_has_capability(
      'organization.operate_orders', v_organization_id, NULL
    )
    OR private.multibusiness_has_capability(
      'business.operate_orders', v_organization_id, p_business_id
    )
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para editar pedidos de este negocio';
  END IF;

  IF p_table_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.restaurant_tables AS restaurant_table
     WHERE restaurant_table.id = p_table_id
       AND restaurant_table.organization_id = v_organization_id
       AND restaurant_table.is_active
  ) THEN
    RAISE EXCEPTION 'La mesa no está disponible en esta organización';
  END IF;

  PERFORM public.update_order_with_items(
    p_order_id,
    p_items,
    p_total,
    p_table_number,
    p_table_id,
    p_customer_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_business_order_with_items(
  uuid, uuid, jsonb, integer, text, uuid, text
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_business_order_with_items(
  uuid, uuid, jsonb, integer, text, uuid, text
)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_order_with_items(
  uuid, jsonb, text, integer, text, text, uuid, text
)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_order_with_items(
  uuid, jsonb, integer, text, uuid, text
)
  FROM PUBLIC, anon, authenticated;
