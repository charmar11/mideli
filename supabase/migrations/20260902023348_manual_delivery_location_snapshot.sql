ALTER TABLE public.orders
  ADD COLUMN delivery_distance_meters integer
    CHECK (delivery_distance_meters IS NULL OR delivery_distance_meters >= 0),
  ADD COLUMN delivery_latitude numeric(9,6),
  ADD COLUMN delivery_longitude numeric(9,6),
  ADD CONSTRAINT orders_delivery_coordinates_check
    CHECK ((delivery_latitude IS NULL) = (delivery_longitude IS NULL)),
  ADD CONSTRAINT orders_delivery_latitude_check
    CHECK (delivery_latitude IS NULL OR delivery_latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT orders_delivery_longitude_check
    CHECK (delivery_longitude IS NULL OR delivery_longitude BETWEEN -180 AND 180);

CREATE INDEX orders_delivery_location_idx
  ON public.orders(delivery_latitude, delivery_longitude)
  WHERE type = 'domicilio' AND delivery_latitude IS NOT NULL;
