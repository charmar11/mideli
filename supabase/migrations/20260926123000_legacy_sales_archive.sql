-- Historical Firestore tickets are read-only archive records, separate from
-- live orders, payments and cash shifts so they never affect current totals.

CREATE TABLE public.legacy_sales_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL
    REFERENCES public.businesses(id) ON DELETE RESTRICT,
  source_system text NOT NULL CHECK (source_system = 'just-dipping-firestore'),
  source_document_id text NOT NULL CHECK (btrim(source_document_id) <> ''),
  source_folio text,
  occurred_at timestamptz NOT NULL,
  subtotal_amount numeric(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  payment_method text NOT NULL DEFAULT 'unknown',
  source_status text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(items) = 'array'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_sales_tickets_source_unique
    UNIQUE (business_id, source_system, source_document_id)
);

CREATE INDEX legacy_sales_tickets_business_occurred_idx
  ON public.legacy_sales_tickets (business_id, occurred_at DESC);
CREATE INDEX legacy_sales_tickets_business_folio_idx
  ON public.legacy_sales_tickets (business_id, source_folio);

ALTER TABLE public.legacy_sales_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_sales_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.legacy_sales_tickets TO authenticated;

CREATE POLICY legacy_sales_tickets_visible_to_business_members
  ON public.legacy_sales_tickets
  FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));

CREATE OR REPLACE FUNCTION private.sanitize_legacy_sales_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_item jsonb;
  v_modifier jsonb;
  v_extra jsonb;
  v_safe_modifiers jsonb;
  v_safe_extras jsonb;
  v_safe_items jsonb := '[]'::jsonb;
  v_quantity integer;
  v_base_price numeric(12,2);
  v_line_total numeric(12,2);
  v_product_name text;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La lista de artículos históricos no es válida';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'La lista de artículos históricos no es válida';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Un artículo histórico no es válido';
    END IF;

    BEGIN
      v_quantity := COALESCE(
        NULLIF(COALESCE(v_item->>'quantity', v_item->>'qty'), '')::integer, 1
      );
      v_base_price := COALESCE(
        NULLIF(COALESCE(v_item->>'base_price', v_item->>'basePrice'), '')::numeric, 0
      );
      v_line_total := COALESCE(
        NULLIF(COALESCE(v_item->>'line_total', v_item->>'itemTotal'), '')::numeric,
        v_base_price * v_quantity
      );
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Un artículo histórico contiene cantidades no válidas';
    END;

    IF jsonb_typeof(COALESCE(v_item->'selected_modifiers', v_item->'selectedModifiers')) = 'array' THEN
      IF jsonb_array_length(COALESCE(v_item->'selected_modifiers', v_item->'selectedModifiers')) > 30 THEN
        RAISE EXCEPTION 'Un artículo tiene demasiadas variaciones históricas';
      END IF;
    END IF;
    IF jsonb_typeof(COALESCE(v_item->'extras', '[]'::jsonb)) = 'array' THEN
      IF jsonb_array_length(COALESCE(v_item->'extras', '[]'::jsonb)) > 50 THEN
        RAISE EXCEPTION 'Un artículo tiene demasiados extras históricos';
      END IF;
    END IF;

    v_product_name := left(btrim(COALESCE(
      v_item->>'product_name', v_item->>'productName', v_item->>'name', 'Producto'
    )), 200);
    IF v_quantity < 1 OR v_quantity > 999
       OR v_base_price < 0 OR v_base_price > 9999999999.99
       OR v_line_total < 0 OR v_line_total > 9999999999.99 THEN
      RAISE EXCEPTION 'Un artículo histórico contiene importes no válidos';
    END IF;

    v_safe_modifiers := '[]'::jsonb;
    IF jsonb_typeof(COALESCE(v_item->'selected_modifiers', v_item->'selectedModifiers')) = 'array' THEN
      FOR v_modifier IN
        SELECT value
          FROM jsonb_array_elements(COALESCE(v_item->'selected_modifiers', v_item->'selectedModifiers'))
      LOOP
        v_safe_modifiers := v_safe_modifiers || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'group', left(COALESCE(v_modifier->>'group', v_modifier->>'modifierName', ''), 100),
          'option', left(COALESCE(v_modifier->>'option', v_modifier->>'optionName', ''), 120),
          'price', COALESCE(NULLIF(COALESCE(v_modifier->>'price', v_modifier->>'extraPrice'), '')::numeric, 0),
          'description', left(COALESCE(v_modifier->>'description', ''), 160)
        )));
      END LOOP;
    END IF;

    v_safe_extras := '[]'::jsonb;
    IF jsonb_typeof(COALESCE(v_item->'extras', '[]'::jsonb)) = 'array' THEN
      FOR v_extra IN SELECT value FROM jsonb_array_elements(COALESCE(v_item->'extras', '[]'::jsonb))
      LOOP
        IF jsonb_typeof(v_extra) = 'string' THEN
          v_safe_extras := v_safe_extras || jsonb_build_array(left(v_extra#>>'{}', 120));
        ELSIF jsonb_typeof(v_extra) = 'object' THEN
          v_safe_extras := v_safe_extras || jsonb_build_array(left(COALESCE(
            v_extra->>'name', v_extra->>'label', v_extra->>'productName', 'Extra'
          ), 120));
        END IF;
      END LOOP;
    END IF;

    v_safe_items := v_safe_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'product_id', left(COALESCE(v_item->>'product_id', v_item->>'productId', ''), 100),
      'product_name', v_product_name,
      'quantity', v_quantity,
      'base_price', v_base_price,
      'line_total', v_line_total,
      'selected_modifiers', v_safe_modifiers,
      'extras', v_safe_extras,
      'combo_source_id', left(COALESCE(v_item->>'combo_source_id', v_item->>'comboSourceId', ''), 100),
      'combo_source_name', left(COALESCE(v_item->>'combo_source_name', v_item->>'comboSourceName', ''), 160)
    )));
  END LOOP;

  RETURN v_safe_items;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_legacy_sales_tickets(
  p_business_id uuid,
  p_records jsonb
)
RETURNS TABLE (inserted_count integer, duplicate_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_record jsonb;
  v_items jsonb;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_rows integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'La importación histórica sólo puede ejecutarla el servicio de migración';
  END IF;
  IF p_business_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.businesses AS business
     WHERE business.id = p_business_id
       AND business.slug = 'just-dipping'
  ) THEN
    RAISE EXCEPTION 'El destino sólo puede ser el negocio Just Dipping';
  END IF;
  IF jsonb_typeof(p_records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La importación requiere una lista de tickets válida';
  END IF;
  IF jsonb_array_length(p_records) > 500
     OR pg_column_size(p_records) > 4194304 THEN
    RAISE EXCEPTION 'Envía hasta 500 tickets por lote';
  END IF;

  FOR v_record IN SELECT value FROM jsonb_array_elements(p_records)
  LOOP
    IF jsonb_typeof(v_record) IS DISTINCT FROM 'object'
       OR NULLIF(btrim(v_record->>'source_document_id'), '') IS NULL
       OR NULLIF(btrim(v_record->>'occurred_at'), '') IS NULL THEN
      RAISE EXCEPTION 'Un ticket histórico no tiene identificador o fecha';
    END IF;

    v_items := private.sanitize_legacy_sales_items(COALESCE(v_record->'items', '[]'::jsonb));

    INSERT INTO public.legacy_sales_tickets (
      business_id,
      source_system,
      source_document_id,
      source_folio,
      occurred_at,
      subtotal_amount,
      discount_amount,
      total_amount,
      payment_method,
      source_status,
      items
    ) VALUES (
      p_business_id,
      'just-dipping-firestore',
      left(btrim(v_record->>'source_document_id'), 200),
      left(COALESCE(v_record->>'source_folio', ''), 80),
      (v_record->>'occurred_at')::timestamptz,
      GREATEST(0, COALESCE((v_record->>'subtotal_amount')::numeric, 0)),
      GREATEST(0, COALESCE((v_record->>'discount_amount')::numeric, 0)),
      GREATEST(0, COALESCE((v_record->>'total_amount')::numeric, 0)),
      left(COALESCE(NULLIF(btrim(v_record->>'payment_method'), ''), 'unknown'), 80),
      left(COALESCE(v_record->>'source_status', ''), 80),
      v_items
    )
    ON CONFLICT (business_id, source_system, source_document_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_duplicates := v_duplicates + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_inserted, v_duplicates;
END;
$$;

REVOKE ALL ON FUNCTION private.sanitize_legacy_sales_items(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_legacy_sales_tickets(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_sales_tickets(uuid, jsonb)
  TO service_role;
