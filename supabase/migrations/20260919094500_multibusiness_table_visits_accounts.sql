-- Shared table context for mixed Food Park service.
--
-- A physical table belongs to the organization, not to one restaurant. A
-- visit identifies the current service at that table and a business account
-- identifies each restaurant's independent account within that visit.
-- Existing orders remain valid without these optional links until the POS
-- starts creating visits and accounts through a server RPC.

CREATE TABLE public.table_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  table_id uuid NOT NULL
    REFERENCES public.restaurant_tables(id) ON DELETE RESTRICT,
  service_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'cancelled')),
  opened_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  closed_at timestamptz,
  close_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT table_visits_close_state_check CHECK (
    (
      status = 'open'
      AND closed_by IS NULL
      AND closed_at IS NULL
      AND close_reason IS NULL
    )
    OR (
      status IN ('closed', 'cancelled')
      AND closed_by IS NOT NULL
      AND closed_at IS NOT NULL
      AND close_reason IS NOT NULL
      AND btrim(close_reason) <> ''
    )
  )
);

CREATE UNIQUE INDEX table_visits_one_open_per_table_idx
  ON public.table_visits (table_id)
  WHERE status = 'open';
CREATE INDEX table_visits_organization_status_idx
  ON public.table_visits (organization_id, status, opened_at DESC);
CREATE INDEX table_visits_table_opened_idx
  ON public.table_visits (table_id, opened_at DESC);

CREATE TABLE public.business_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_visit_id uuid NOT NULL
    REFERENCES public.table_visits(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL
    REFERENCES public.businesses(id) ON DELETE RESTRICT,
  account_sequence integer NOT NULL DEFAULT 1 CHECK (account_sequence > 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partially_paid', 'paid', 'closed', 'cancelled')),
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_accounts_business_organization_fkey
    FOREIGN KEY (organization_id, business_id)
    REFERENCES public.businesses(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT business_accounts_id_business_key UNIQUE (id, business_id),
  CONSTRAINT business_accounts_status_dates_check CHECK (
    (status IN ('open', 'partially_paid') AND paid_at IS NULL AND closed_at IS NULL)
    OR (status = 'paid' AND paid_at IS NOT NULL AND closed_at IS NULL)
    OR (status IN ('closed', 'cancelled') AND closed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX business_accounts_business_sequence_idx
  ON public.business_accounts (table_visit_id, business_id, account_sequence);
CREATE INDEX business_accounts_business_status_idx
  ON public.business_accounts (business_id, status, created_at DESC);
CREATE INDEX business_accounts_visit_idx
  ON public.business_accounts (table_visit_id, created_at);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_visit_id uuid,
  ADD COLUMN IF NOT EXISTS business_account_id uuid;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_table_visit_fkey
  FOREIGN KEY (table_visit_id)
  REFERENCES public.table_visits(id)
  ON DELETE RESTRICT;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_business_account_business_fkey
  FOREIGN KEY (business_account_id, business_id)
  REFERENCES public.business_accounts(id, business_id)
  ON DELETE RESTRICT;

CREATE INDEX orders_table_visit_created_at_idx
  ON public.orders (table_visit_id, created_at DESC)
  WHERE table_visit_id IS NOT NULL;
CREATE INDEX orders_business_account_created_at_idx
  ON public.orders (business_account_id, created_at DESC)
  WHERE business_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.multibusiness_validate_visit_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_visit_organization_id uuid;
  v_account_business_id uuid;
  v_account_visit_id uuid;
  v_business_organization_id uuid;
BEGIN
  IF NEW.business_account_id IS NULL AND NEW.table_visit_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.table_visit_id IS NOT NULL THEN
    SELECT visit.organization_id
      INTO v_visit_organization_id
      FROM public.table_visits AS visit
     WHERE visit.id = NEW.table_visit_id;

    IF v_visit_organization_id IS NULL THEN
      RAISE EXCEPTION 'La visita de mesa no existe';
    END IF;

    SELECT business.organization_id
      INTO v_business_organization_id
      FROM public.businesses AS business
     WHERE business.id = NEW.business_id;

    IF v_business_organization_id IS DISTINCT FROM v_visit_organization_id THEN
      RAISE EXCEPTION 'La visita y el negocio no pertenecen a la misma organización';
    END IF;
  END IF;

  IF NEW.business_account_id IS NOT NULL THEN
    SELECT account.business_id, account.table_visit_id
      INTO v_account_business_id, v_account_visit_id
      FROM public.business_accounts AS account
     WHERE account.id = NEW.business_account_id;

    IF v_account_business_id IS NULL THEN
      RAISE EXCEPTION 'La cuenta del negocio no existe';
    END IF;

    IF v_account_business_id IS DISTINCT FROM NEW.business_id THEN
      RAISE EXCEPTION 'La cuenta no pertenece al negocio del pedido';
    END IF;

    IF NEW.table_visit_id IS NULL THEN
      NEW.table_visit_id := v_account_visit_id;
    ELSIF v_account_visit_id IS DISTINCT FROM NEW.table_visit_id THEN
      RAISE EXCEPTION 'La cuenta y la visita del pedido no coinciden';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_validate_visit_account
  ON public.orders;
CREATE TRIGGER orders_validate_visit_account
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.multibusiness_validate_visit_account();

CREATE OR REPLACE FUNCTION private.multibusiness_validate_table_visit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.restaurant_tables AS restaurant_table
     WHERE restaurant_table.id = NEW.table_id
       AND restaurant_table.is_active
  ) THEN
    RAISE EXCEPTION 'La mesa no está disponible';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER table_visits_set_updated_at
  BEFORE UPDATE ON public.table_visits
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_set_updated_at();

CREATE TRIGGER business_accounts_set_updated_at
  BEFORE UPDATE ON public.business_accounts
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_set_updated_at();

CREATE TRIGGER table_visits_validate_table
  BEFORE INSERT OR UPDATE OF table_id ON public.table_visits
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_validate_table_visit();

CREATE OR REPLACE FUNCTION private.multibusiness_validate_business_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_visit_organization_id uuid;
  v_business_organization_id uuid;
BEGIN
  SELECT visit.organization_id
    INTO v_visit_organization_id
    FROM public.table_visits AS visit
   WHERE visit.id = NEW.table_visit_id;

  SELECT business.organization_id
    INTO v_business_organization_id
    FROM public.businesses AS business
   WHERE business.id = NEW.business_id;

  IF v_visit_organization_id IS NULL
     OR v_business_organization_id IS DISTINCT FROM v_visit_organization_id
  THEN
    RAISE EXCEPTION 'La cuenta y el negocio no pertenecen a la misma organización';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER business_accounts_validate_scope
  BEFORE INSERT OR UPDATE ON public.business_accounts
  FOR EACH ROW EXECUTE FUNCTION private.multibusiness_validate_business_account();

ALTER TABLE public.table_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_accounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.table_visits, public.business_accounts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.table_visits, public.business_accounts
  TO authenticated;

CREATE POLICY table_visits_viewed_by_organization_membership
  ON public.table_visits
  FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_organization(organization_id));

CREATE POLICY business_accounts_viewed_by_business_membership
  ON public.business_accounts
  FOR SELECT TO authenticated
  USING (private.multibusiness_can_view_business(business_id));

REVOKE ALL ON FUNCTION private.multibusiness_validate_visit_account()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_table_visit()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.multibusiness_validate_business_account()
  FROM PUBLIC, anon, authenticated;
