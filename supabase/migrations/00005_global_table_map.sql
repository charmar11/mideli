-- Global table map geometry. Tables keep their existing positions relative to
-- their zone, while zones gain a persisted position and size on the floor.

ALTER TABLE public.table_zones
  ADD COLUMN IF NOT EXISTS position_x numeric(6,5) NOT NULL DEFAULT 0.04
    CHECK (position_x >= 0 AND position_x <= 1),
  ADD COLUMN IF NOT EXISTS position_y numeric(6,5) NOT NULL DEFAULT 0.04
    CHECK (position_y >= 0 AND position_y <= 1),
  ADD COLUMN IF NOT EXISTS width numeric(6,5) NOT NULL DEFAULT 0.29
    CHECK (width > 0 AND width <= 1),
  ADD COLUMN IF NOT EXISTS height numeric(6,5) NOT NULL DEFAULT 0.4
    CHECK (height > 0 AND height <= 1);

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (ORDER BY sort_order, id) - 1 AS zone_index,
    count(*) OVER () AS zone_count
  FROM public.table_zones
  WHERE is_active
), layout AS (
  SELECT
    id,
    mod(zone_index, 3)::numeric AS zone_column,
    floor(zone_index / 3)::numeric AS zone_row,
    ceil(zone_count / 3.0)::numeric AS row_count
  FROM ranked
)
UPDATE public.table_zones AS zones
SET
  position_x = 0.04 + (layout.zone_column * 0.32),
  position_y = 0.04 + (layout.zone_row * (0.90 / layout.row_count)),
  width = 0.29,
  height = GREATEST(0.18, (0.90 / layout.row_count) - 0.04),
  updated_at = now()
FROM layout
WHERE zones.id = layout.id;
