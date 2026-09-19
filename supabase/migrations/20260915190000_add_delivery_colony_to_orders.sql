-- Conserva la colonia confirmada junto con el domicilio para operación y reparto.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_colony text;
