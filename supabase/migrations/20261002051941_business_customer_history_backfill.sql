BEGIN;

-- Keep historical WhatsApp customers in Mideli's operational directory without
-- changing the legacy tables or the existing WhatsApp order relationships.
DO $$
DECLARE
  v_mideli_business_id uuid := private.multibusiness_mideli_business_id();
BEGIN
  IF v_mideli_business_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró Mideli para migrar el directorio de clientes';
  END IF;

  INSERT INTO public.business_customers (
    id, business_id, phone, display_name, created_at, updated_at
  )
  SELECT
    customer.id,
    v_mideli_business_id,
    customer.phone,
    customer.display_name,
    customer.created_at,
    customer.updated_at
  FROM public.customers AS customer
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.business_customer_addresses (
    id, business_id, customer_id, label, address_text, reference,
    formatted_address, colony, latitude, longitude, distance_meters,
    delivery_fee, geocoded_at, confirmed_at, confirmation_method,
    is_default, last_used_at, created_at, updated_at
  )
  SELECT
    address.id,
    v_mideli_business_id,
    address.customer_id,
    address.label,
    address.address_text,
    address.reference,
    address.formatted_address,
    address.colony,
    address.latitude,
    address.longitude,
    address.distance_meters,
    address.delivery_fee,
    address.geocoded_at,
    address.confirmed_at,
    address.confirmation_method,
    address.is_default,
    address.last_used_at,
    address.created_at,
    address.updated_at
  FROM public.customer_addresses AS address
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Preserve customer history for existing Mideli orders. The legacy customer_id
-- stays intact for WhatsApp; the new relationship powers business control.
UPDATE public.orders AS orders
   SET business_customer_id = customer.id
  FROM public.business_customers AS customer
 WHERE orders.customer_id = customer.id
   AND orders.business_id = customer.business_id
   AND orders.business_customer_id IS NULL;

COMMIT;
