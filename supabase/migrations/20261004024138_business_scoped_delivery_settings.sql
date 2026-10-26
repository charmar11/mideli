BEGIN;

-- Operational delivery setup belongs to each business. The JSON rule lists
-- are intentionally stored on one row so a complete edit is an atomic write.
CREATE TABLE public.business_delivery_settings (
  business_id uuid PRIMARY KEY
    REFERENCES public.businesses(id) ON DELETE CASCADE,
  origin_address text NOT NULL DEFAULT ''
    CHECK (char_length(origin_address) <= 300),
  origin_latitude numeric(9,6),
  origin_longitude numeric(9,6),
  delivery_rates jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(delivery_rates) = 'array' AND jsonb_array_length(delivery_rates) <= 100),
  delivery_surcharges jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(delivery_surcharges) = 'array' AND jsonb_array_length(delivery_surcharges) <= 250),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((origin_latitude IS NULL) = (origin_longitude IS NULL)),
  CHECK (origin_latitude IS NULL OR origin_latitude BETWEEN -90 AND 90),
  CHECK (origin_longitude IS NULL OR origin_longitude BETWEEN -180 AND 180)
);

ALTER TABLE public.business_delivery_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_delivery_settings
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.business_delivery_settings
  TO service_role;

CREATE OR REPLACE FUNCTION private.seed_business_delivery_settings(
  p_business_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.business_delivery_settings (
    business_id,
    delivery_rates,
    delivery_surcharges
  )
  SELECT
    p_business_id,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'minDistanceKm', rate.min_distance_km,
          'maxDistanceKm', rate.max_distance_km,
          'fee', rate.fee,
          'isActive', rate.is_active
        ) ORDER BY rate.sort_order, rate.min_distance_km
      )
      FROM public.whatsapp_delivery_rates AS rate
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'colonyName', surcharge.colony_name,
          'aliases', to_jsonb(surcharge.aliases),
          'fee', surcharge.fee,
          'isActive', surcharge.is_active
        ) ORDER BY surcharge.colony_name
      )
      FROM public.whatsapp_delivery_surcharges AS surcharge
    ), '[]'::jsonb)
  ON CONFLICT (business_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION private.seed_business_delivery_settings(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.business_delivery_settings_seed_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.seed_business_delivery_settings(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.business_delivery_settings_seed_after_insert()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER businesses_seed_delivery_settings
  AFTER INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION private.business_delivery_settings_seed_after_insert();

-- Preserve today's working origin and price rules for each existing local.
-- Each business receives a private copy; later edits cannot affect its peers.
DO $$
DECLARE
  v_business_id uuid;
  v_origin_address text;
  v_origin_latitude numeric(9,6);
  v_origin_longitude numeric(9,6);
BEGIN
  SELECT settings.store_address, settings.store_latitude, settings.store_longitude
    INTO v_origin_address, v_origin_latitude, v_origin_longitude
    FROM public.whatsapp_channel_settings AS settings
   WHERE settings.id = 1;

  FOR v_business_id IN
    SELECT business.id FROM public.businesses AS business
  LOOP
    PERFORM private.seed_business_delivery_settings(v_business_id);
    UPDATE public.business_delivery_settings AS delivery
       SET origin_address = COALESCE(v_origin_address, ''),
           origin_latitude = v_origin_latitude,
           origin_longitude = v_origin_longitude,
           updated_at = now()
     WHERE delivery.business_id = v_business_id;
  END LOOP;
END;
$$;

COMMIT;
