ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_active_role_idx
  ON public.profiles (is_active, role);

COMMENT ON COLUMN public.profiles.is_active IS
  'Controls whether the staff member can access the application.';

COMMENT ON COLUMN public.profiles.deactivated_at IS
  'Timestamp when access was disabled; order history remains intact.';
