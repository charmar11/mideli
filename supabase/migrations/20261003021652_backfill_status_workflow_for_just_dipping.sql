-- Just Dipping has no dedicated Kitchen screen. Its active owner may advance
-- orders directly from the Mesero -> Estado workflow. This is a business-
-- scoped grant and does not grant any preparation capability to global staff.
DO $grant_just_dipping_owner_status_workflow$
DECLARE
  v_target_count integer;
  v_membership_id uuid;
  v_organization_id uuid;
  v_business_id uuid;
BEGIN
  SELECT count(*)::integer
    INTO v_target_count
    FROM public.organizations AS organization
    JOIN public.businesses AS business
      ON business.organization_id = organization.id
    JOIN public.memberships AS membership
      ON membership.organization_id = organization.id
     AND membership.business_id = business.id
   WHERE organization.slug = 'rincon-404-food-park'
     AND business.slug = 'just-dipping'
     AND membership.scope_type = 'business'
     AND membership.role_code = 'business_owner'
     AND membership.status = 'active'
     AND business.lifecycle_status = 'active';

  IF v_target_count > 1 THEN
    RAISE EXCEPTION
      'Expected at most one active Just Dipping owner membership; found %',
      v_target_count;
  END IF;

  IF v_target_count = 1 THEN
    SELECT membership.id, organization.id, business.id
      INTO v_membership_id, v_organization_id, v_business_id
      FROM public.organizations AS organization
      JOIN public.businesses AS business
        ON business.organization_id = organization.id
      JOIN public.memberships AS membership
        ON membership.organization_id = organization.id
       AND membership.business_id = business.id
     WHERE organization.slug = 'rincon-404-food-park'
       AND business.slug = 'just-dipping'
       AND membership.scope_type = 'business'
       AND membership.role_code = 'business_owner'
       AND membership.status = 'active'
       AND business.lifecycle_status = 'active';

  INSERT INTO public.membership_capabilities (
    membership_id,
    capability_code,
    organization_id,
    business_id,
    granted_by,
    grant_reason
  ) VALUES (
    v_membership_id,
    'business.update_preparation',
    v_organization_id,
    v_business_id,
    NULL,
    'Permiso aprobado para cambiar estados del pedido desde Mesero · Estado, sin pantalla Cocina'
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_events (
    actor_user_id,
    organization_id,
    business_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  )
  SELECT
    NULL,
    v_organization_id,
    v_business_id,
    'owner_status_workflow_enabled',
    'membership',
    v_membership_id,
    'Permiso de preparación activado para operar pedidos desde Estado sin pantalla Cocina',
    jsonb_build_object('capability_code', 'business.update_preparation')
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.audit_events AS audit
     WHERE audit.business_id = v_business_id
       AND audit.entity_id = v_membership_id
       AND audit.action = 'owner_status_workflow_enabled'
  );
  END IF;
END;
$grant_just_dipping_owner_status_workflow$;
