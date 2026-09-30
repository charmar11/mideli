BEGIN;

-- Keep the established cash workflow intact, but move its implementation out
-- of the exposed API schema. The public gateway below adds a strict local-staff
-- boundary before listing PIN approvers or creating an authorization token.
ALTER FUNCTION public.multibusiness_cash_action(uuid, text, jsonb)
  RENAME TO multibusiness_cash_action_unscoped;
ALTER FUNCTION public.multibusiness_cash_action_unscoped(uuid, text, jsonb)
  SET SCHEMA private;

REVOKE ALL ON FUNCTION private.multibusiness_cash_action_unscoped(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.multibusiness_cash_action(
  p_business_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_candidates jsonb;
  v_result jsonb;
  v_authorizer_id uuid;
BEGIN
  IF p_action = 'list_authorizers' THEN
    -- The original RPC performs the selected-business cash permission check.
    -- Filter its result instead of rebuilding the existing role/PIN behavior.
    v_candidates := private.multibusiness_cash_action_unscoped(
      p_business_id,
      p_action,
      v_payload
    );

    SELECT COALESCE(
      pg_catalog.jsonb_agg(candidate.item ORDER BY candidate.ordinal),
      '[]'::jsonb
    )
      INTO v_result
      FROM pg_catalog.jsonb_array_elements(COALESCE(v_candidates, '[]'::jsonb))
           WITH ORDINALITY AS candidate(item, ordinal)
     WHERE EXISTS (
       SELECT 1
         FROM public.profiles AS profile
         JOIN public.businesses AS business
           ON business.id = p_business_id
         JOIN public.memberships AS membership
           ON membership.user_id = profile.id
          AND membership.organization_id = business.organization_id
          AND membership.business_id = p_business_id
          AND membership.scope_type = 'business'
          AND membership.status = 'active'
        WHERE profile.id = (candidate.item->>'id')::uuid
          AND profile.is_active
          AND profile.role IN ('owner', 'admin', 'supervisor')
     );

    RETURN v_result;
  END IF;

  IF p_action = 'authorize' THEN
    v_authorizer_id := NULLIF(v_payload->>'p_authorizer_id', '')::uuid;

    IF v_authorizer_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM public.profiles AS profile
        JOIN public.businesses AS business
          ON business.id = p_business_id
        JOIN public.memberships AS membership
          ON membership.user_id = profile.id
         AND membership.organization_id = business.organization_id
         AND membership.business_id = p_business_id
         AND membership.scope_type = 'business'
         AND membership.status = 'active'
       WHERE profile.id = v_authorizer_id
         AND profile.is_active
         AND profile.role IN ('owner', 'admin', 'supervisor')
    ) THEN
      RAISE EXCEPTION 'El autorizador debe pertenecer al personal activo de este negocio';
    END IF;
  END IF;

  -- All cash operations still pass through the existing capability, shift,
  -- PIN and audit checks. The extra membership guard above applies before
  -- the legacy implementation can mint an authorization token.
  RETURN private.multibusiness_cash_action_unscoped(
    p_business_id,
    p_action,
    v_payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.multibusiness_cash_action(uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.multibusiness_cash_action(uuid, text, jsonb)
  TO authenticated;

COMMIT;
