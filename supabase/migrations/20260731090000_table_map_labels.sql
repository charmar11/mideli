-- Editable visual references for the global restaurant table map.

CREATE TABLE IF NOT EXISTS public.table_map_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_text text NOT NULL DEFAULT 'Referencia',
  position_x numeric(6,5) NOT NULL DEFAULT 0.4
    CHECK (position_x >= 0 AND position_x <= 1),
  position_y numeric(6,5) NOT NULL DEFAULT 0.08
    CHECK (position_y >= 0 AND position_y <= 1),
  width numeric(6,5) NOT NULL DEFAULT 0.2
    CHECK (width > 0 AND width <= 1),
  height numeric(6,5) NOT NULL DEFAULT 0.1
    CHECK (height > 0 AND height <= 1),
  background_color text NOT NULL DEFAULT '#2A242E'
    CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color text NOT NULL DEFAULT '#FBF8E7'
    CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  border_color text NOT NULL DEFAULT '#F5145F'
    CHECK (border_color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS table_map_labels_active_idx
  ON public.table_map_labels(is_active, sort_order, created_at);

ALTER TABLE public.table_map_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Table map labels viewable by staff"
  ON public.table_map_labels
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Table map labels insertable by admins"
  ON public.table_map_labels
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Table map labels updatable by admins"
  ON public.table_map_labels
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE ON public.table_map_labels TO authenticated;
