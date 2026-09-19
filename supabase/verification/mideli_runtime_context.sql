-- Read-only authorization smoke test. It simulates the JWT subject with the
-- existing profile IDs and checks the context RPC without creating records.

DO $$
DECLARE
  profile_row record;
  visible_business_count integer;
  expected_count integer;
BEGIN
  FOR profile_row IN
    SELECT id, lower(full_name) AS profile_name
      FROM public.profiles
     WHERE lower(full_name) IN ('administrador', 'andrea', 'mauro', 'mideli')
       AND is_active = true
  LOOP
    PERFORM set_config('request.jwt.claim.sub', profile_row.id::text, true);

    SELECT count(*)
      INTO visible_business_count
      FROM public.get_my_multibusiness_context();

    expected_count := CASE
      WHEN profile_row.profile_name = 'mideli' THEN 0
      ELSE 1
    END;

    IF visible_business_count <> expected_count THEN
      RAISE EXCEPTION
        'El contexto de % devolvió % negocios; se esperaba %',
        profile_row.profile_name,
        visible_business_count,
        expected_count;
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

SELECT jsonb_agg(
  jsonb_build_object(
    'scope_type', membership.scope_type,
    'role_code', membership.role_code,
    'status', membership.status
  )
  ORDER BY membership.scope_type, membership.role_code
)
  FROM public.memberships AS membership
 WHERE membership.organization_id = (
   SELECT id
     FROM public.organizations
    WHERE slug = 'rincon-404-food-park'
 )
   AND membership.status = 'active';
