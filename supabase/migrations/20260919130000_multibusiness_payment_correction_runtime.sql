-- Keep payment method corrections inside the selected business.
-- The legacy functions remain as implementation details, but the client uses
-- this gateway after the multibusiness boundary is active.

CREATE OR REPLACE FUNCTION public.multibusiness_payment_correction_action(
  p_business_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_organization_id uuid;
  v_tender_business_id uuid;
  v_transaction_status text;
  v_tender_id uuid := (v_payload->>'p_tender_id')::uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  SELECT business.organization_id
    INTO v_organization_id
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status NOT IN ('archived', 'retired');
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio seleccionado no está disponible';
  END IF;

  IF v_tender_id IS NULL THEN
    RAISE EXCEPTION 'Falta el método de pago';
  END IF;

  SELECT payment.business_id, payment.status
    INTO v_tender_business_id, v_transaction_status
    FROM public.payment_tenders AS tender
    JOIN public.payment_transactions AS payment
      ON payment.id = tender.transaction_id
   WHERE tender.id = v_tender_id;

  IF v_tender_business_id IS NULL
     OR v_tender_business_id IS DISTINCT FROM p_business_id THEN
    RAISE EXCEPTION 'El pago no pertenece al negocio seleccionado';
  END IF;

  IF v_transaction_status <> 'completed' THEN
    RAISE EXCEPTION 'No se puede corregir un pago anulado';
  END IF;

  PERFORM pg_catalog.set_config(
    'mideli.business_id',
    p_business_id::text,
    true
  );

  IF p_action = 'authorize' THEN
    IF NOT (
      private.multibusiness_has_capability(
        'business.manage_cash', v_organization_id, p_business_id
      )
      OR private.multibusiness_has_capability(
        'organization.charge_orders', v_organization_id, NULL
      )
    ) THEN
      RAISE EXCEPTION 'No tienes permiso para autorizar correcciones en este negocio';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM public.profiles AS profile
       WHERE profile.id = (v_payload->>'p_authorizer_id')::uuid
         AND profile.is_active
         AND profile.role IN ('owner', 'admin')
         AND EXISTS (
           SELECT 1
             FROM public.memberships AS membership
            WHERE membership.user_id = profile.id
              AND membership.status = 'active'
              AND (
                membership.business_id = p_business_id
                OR (
                  membership.organization_id = v_organization_id
                  AND membership.scope_type IN ('organization', 'platform')
                )
              )
         )
    ) THEN
      RAISE EXCEPTION 'El autorizador no pertenece al negocio seleccionado';
    END IF;

    RETURN to_jsonb(private.authorize_payment_method_correction(
      v_tender_id,
      (v_payload->>'p_authorizer_id')::uuid,
      COALESCE(v_payload->>'p_pin', ''),
      (v_payload->>'p_idempotency_key')::uuid
    ));
  END IF;

  IF p_action <> 'correct' THEN
    RAISE EXCEPTION 'La operación de corrección no es válida';
  END IF;

  IF NOT (
    private.multibusiness_has_capability(
      'business.manage_cash', v_organization_id, p_business_id
    )
    OR private.multibusiness_has_capability(
      'business.charge_orders', v_organization_id, p_business_id
    )
    OR private.multibusiness_has_capability(
      'organization.charge_orders', v_organization_id, NULL
    )
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para corregir pagos en este negocio';
  END IF;

  RETURN private.correct_payment_tender_method(
    v_tender_id,
    (v_payload->>'p_new_method')::public.payment_method,
    COALESCE(v_payload->>'p_reason', ''),
    (v_payload->>'p_authorization')::uuid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.multibusiness_payment_correction_action(
  uuid, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.multibusiness_payment_correction_action(
  uuid, text, jsonb
) TO authenticated;

-- These wrappers no longer provide an alternate client entry point. The
-- gateway validates the payment's business before invoking the protected
-- implementation.
REVOKE ALL ON FUNCTION public.authorize_payment_method_correction(
  uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.correct_payment_tender_method(
  uuid, public.payment_method, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.authorize_payment_method_correction(
  uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.correct_payment_tender_method(
  uuid, public.payment_method, text, uuid
) FROM PUBLIC, anon, authenticated;
