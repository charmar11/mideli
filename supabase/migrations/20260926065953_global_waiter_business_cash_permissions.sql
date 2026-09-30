-- Business-scoped operational cash permissions for global waiters.
-- Cash administration remains exclusive to business.manage_cash.

INSERT INTO public.capabilities (code, scope_type, description)
VALUES
  (
    'business.open_cash',
    'business',
    'Abrir la caja de este negocio'
  ),
  (
    'business.close_cash',
    'business',
    'Cerrar la caja y consultar el corte recién cerrado de este negocio'
  )
ON CONFLICT (code) DO UPDATE
SET
  scope_type = EXCLUDED.scope_type,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.set_global_waiter_cash_permissions(
  p_membership_id uuid,
  p_business_id uuid,
  p_can_open boolean,
  p_can_close boolean,
  p_reason text DEFAULT 'Permisos ajustados desde Personal global'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_user_id uuid;
  v_business_name text;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_permission record;
  v_changed_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  IF p_membership_id IS NULL OR p_business_id IS NULL
     OR p_can_open IS NULL OR p_can_close IS NULL THEN
    RAISE EXCEPTION 'Los permisos enviados no son válidos';
  END IF;

  IF length(v_reason) NOT BETWEEN 4 AND 240 THEN
    RAISE EXCEPTION 'Escribe un motivo válido para el cambio';
  END IF;

  SELECT membership.organization_id, membership.user_id
    INTO v_organization_id, v_user_id
    FROM public.memberships AS membership
   WHERE membership.id = p_membership_id
     AND membership.scope_type = 'organization'
     AND membership.role_code = 'global_waiter'
     AND membership.status IN ('active', 'inactive')
     AND membership.organization_id IS NOT NULL
     AND membership.business_id IS NULL;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró una mesera global administrable';
  END IF;

  IF v_user_id = v_actor_id THEN
    RAISE EXCEPTION 'No puedes asignarte permisos de caja a tu propia cuenta';
  END IF;

  IF NOT private.multibusiness_has_capability(
    'organization.manage_global_waiters', v_organization_id, NULL
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para administrar meseras globales';
  END IF;

  SELECT business.display_name
    INTO v_business_name
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.organization_id = v_organization_id
     AND business.lifecycle_status = 'active';

  IF v_business_name IS NULL THEN
    RAISE EXCEPTION 'El negocio no está activo dentro de esta organización';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_membership_id::text || ':' || p_business_id::text, 781)
  );

  FOR v_permission IN
    SELECT permission.code, permission.enabled
      FROM (VALUES
        ('business.open_cash'::text, p_can_open),
        ('business.close_cash'::text, p_can_close)
      ) AS permission(code, enabled)
  LOOP
    v_changed_id := NULL;

    IF v_permission.enabled THEN
      INSERT INTO public.membership_capabilities (
        membership_id,
        capability_code,
        organization_id,
        business_id,
        granted_by,
        grant_reason
      )
      SELECT
        p_membership_id,
        v_permission.code,
        v_organization_id,
        p_business_id,
        v_actor_id,
        v_reason
      WHERE NOT EXISTS (
        SELECT 1
          FROM public.membership_capabilities AS existing
         WHERE existing.membership_id = p_membership_id
           AND existing.capability_code = v_permission.code
           AND existing.organization_id = v_organization_id
           AND existing.business_id = p_business_id
           AND existing.revoked_at IS NULL
      )
      RETURNING id INTO v_changed_id;

      IF v_changed_id IS NOT NULL THEN
        INSERT INTO public.audit_events (
          actor_user_id, organization_id, business_id, action,
          entity_type, entity_id, reason, metadata
        ) VALUES (
          v_actor_id, v_organization_id, p_business_id,
          'global_waiter.cash_permission.granted',
          'membership_capability', v_changed_id, v_reason,
          jsonb_build_object(
            'membership_id', p_membership_id,
            'user_id', v_user_id,
            'business_name', v_business_name,
            'capability_code', v_permission.code
          )
        );
      END IF;
    ELSE
      UPDATE public.membership_capabilities AS existing
         SET revoked_by = v_actor_id,
             revoked_at = now(),
             revocation_reason = v_reason
       WHERE existing.membership_id = p_membership_id
         AND existing.capability_code = v_permission.code
         AND existing.organization_id = v_organization_id
         AND existing.business_id = p_business_id
         AND existing.revoked_at IS NULL
      RETURNING existing.id INTO v_changed_id;

      IF v_changed_id IS NOT NULL THEN
        INSERT INTO public.audit_events (
          actor_user_id, organization_id, business_id, action,
          entity_type, entity_id, reason, metadata
        ) VALUES (
          v_actor_id, v_organization_id, p_business_id,
          'global_waiter.cash_permission.revoked',
          'membership_capability', v_changed_id, v_reason,
          jsonb_build_object(
            'membership_id', p_membership_id,
            'user_id', v_user_id,
            'business_name', v_business_name,
            'capability_code', v_permission.code
          )
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'membership_id', p_membership_id,
    'business_id', p_business_id,
    'can_open', p_can_open,
    'can_close', p_can_close
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.can_view_cash_shift(p_shift_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.cash_shifts AS shift
      JOIN public.businesses AS business
        ON business.id = shift.business_id
      JOIN public.profiles AS profile
        ON profile.id = (SELECT auth.uid())
       AND profile.is_active
     WHERE shift.id = p_shift_id
       AND (
         private.multibusiness_has_capability(
           'business.manage_cash', business.organization_id, business.id
         )
         OR (
           shift.status = 'open'
           AND (
             private.multibusiness_has_capability(
               'business.open_cash', business.organization_id, business.id
             )
             OR private.multibusiness_has_capability(
               'business.close_cash', business.organization_id, business.id
             )
           )
         )
         OR (
           shift.status = 'closed'
           AND shift.closed_by = profile.id
           AND shift.closed_at >= now() - interval '2 hours'
           AND private.multibusiness_has_capability(
             'business.close_cash', business.organization_id, business.id
           )
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_cash_shift(p_shift_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.cash_shifts AS shift
      JOIN public.businesses AS business
        ON business.id = shift.business_id
      JOIN public.profiles AS profile
        ON profile.id = (SELECT auth.uid())
       AND profile.is_active
     WHERE shift.id = p_shift_id
       AND private.multibusiness_has_capability(
         'business.manage_cash', business.organization_id, business.id
       )
  );
$$;

-- Cashier roles may read the shift needed for opening/closing. Supporting
-- finance tables remain visible only to full cash administrators; the
-- controlled detail RPC supplies the cashier's own fresh cut after closure.
DROP POLICY IF EXISTS "Cash movements visible with shift" ON public.cash_movements;
CREATE POLICY "Cash movements visible to cash administrators"
  ON public.cash_movements FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_cash_shift(shift_id)));

DROP POLICY IF EXISTS "Transferred orders visible with shift" ON public.cash_shift_pending_orders;
CREATE POLICY "Transferred orders visible to cash administrators"
  ON public.cash_shift_pending_orders FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_cash_shift(closing_shift_id)));

DROP POLICY IF EXISTS "Cash adjustments visible with shift" ON public.cash_shift_adjustments;
CREATE POLICY "Cash adjustments visible to cash administrators"
  ON public.cash_shift_adjustments FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_cash_shift(shift_id)));

CREATE OR REPLACE FUNCTION public.multibusiness_cash_action(
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
  v_organization_id uuid;
  v_lifecycle_status text;
  v_shift_id uuid;
  v_result jsonb;
  v_can_manage_cash boolean;
  v_can_open_cash boolean;
  v_can_close_cash boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  SELECT business.organization_id, business.lifecycle_status
    INTO v_organization_id, v_lifecycle_status
    FROM public.businesses AS business
   WHERE business.id = p_business_id
     AND business.lifecycle_status NOT IN ('archived', 'retired');
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'El negocio seleccionado no está disponible';
  END IF;

  v_can_manage_cash := private.multibusiness_has_capability(
    'business.manage_cash', v_organization_id, p_business_id
  );
  v_can_open_cash := v_can_manage_cash OR private.multibusiness_has_capability(
    'business.open_cash', v_organization_id, p_business_id
  );
  v_can_close_cash := v_can_manage_cash OR private.multibusiness_has_capability(
    'business.close_cash', v_organization_id, p_business_id
  );

  IF p_action = 'current' THEN
    IF NOT (
      private.multibusiness_can_operate_business(p_business_id)
      OR v_can_open_cash OR v_can_close_cash
    ) THEN
      RAISE EXCEPTION 'No tienes permiso para consultar la caja de este negocio';
    END IF;
  ELSIF p_action = 'open' THEN
    IF v_lifecycle_status <> 'active' THEN
      RAISE EXCEPTION 'El negocio no está activo para abrir caja';
    END IF;
    IF NOT v_can_open_cash THEN
      RAISE EXCEPTION 'No tienes permiso para abrir la caja de este negocio';
    END IF;
  ELSIF p_action IN ('close', 'preview_close', 'detail', 'list_authorizers', 'authorize') THEN
    IF NOT v_can_close_cash THEN
      RAISE EXCEPTION 'No tienes permiso para cerrar o consultar este corte';
    END IF;
  ELSIF p_action IN (
    'correct_opening', 'record_movement', 'list_history', 'list_movements',
    'correct_movement', 'adjustment', 'archive', 'restore',
    'deletion_impact', 'delete'
  ) THEN
    IF NOT v_can_manage_cash THEN
      RAISE EXCEPTION 'No tienes permiso para administrar la caja de este negocio';
    END IF;
  ELSE
    RAISE EXCEPTION 'La operación de caja no es válida';
  END IF;

  PERFORM pg_catalog.set_config(
    'mideli.business_id',
    p_business_id::text,
    true
  );

  CASE p_action
    WHEN 'current' THEN
      SELECT shift.id
        INTO v_shift_id
        FROM public.cash_shifts AS shift
       WHERE shift.business_id = p_business_id
         AND shift.status = 'open'
       ORDER BY shift.opened_at DESC
       LIMIT 1;

      IF v_shift_id IS NULL THEN
        v_result := NULL;
      ELSIF v_can_close_cash THEN
        v_result := private.cash_shift_json(v_shift_id, false);
      ELSE
        -- Operators and opening-only cashiers need to know whether a shift
        -- exists, not see its financial totals or staff details.
        v_result := jsonb_build_object(
          'id', v_shift_id,
          'business_id', p_business_id,
          'status', 'open',
          'status_only', true
        );
      END IF;
    WHEN 'open' THEN
      v_result := private.open_cash_shift(
        (v_payload->>'p_opening_float')::numeric,
        COALESCE(v_payload->'p_opening_denominations', '{}'::jsonb),
        COALESCE(v_payload->>'p_note', '')
      );
      IF v_result IS NOT NULL AND NOT v_can_close_cash THEN
        v_result := jsonb_build_object(
          'id', v_result->'id',
          'business_id', p_business_id,
          'status', 'open',
          'status_only', true
        );
      END IF;
    WHEN 'correct_opening' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.correct_cash_shift_opening_float(
        v_shift_id,
        (v_payload->>'p_new_amount')::numeric,
        COALESCE(v_payload->>'p_reason', '')
      );
    WHEN 'list_authorizers' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', profile.id,
        'full_name', profile.full_name,
        'role', profile.role,
        'pin_configured', pin.user_id IS NOT NULL
      ) ORDER BY
        CASE profile.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
        profile.full_name
      ), '[]'::jsonb)
        INTO v_result
        FROM public.profiles AS profile
        LEFT JOIN private.staff_authorization_pins AS pin
          ON pin.user_id = profile.id
       WHERE profile.is_active
         AND profile.role IN ('owner', 'admin', 'supervisor')
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
         );
    WHEN 'authorize' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      IF NOT EXISTS (
        SELECT 1
          FROM public.profiles AS profile
         WHERE profile.id = (v_payload->>'p_authorizer_id')::uuid
           AND profile.is_active
           AND profile.role IN ('owner', 'admin', 'supervisor')
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
      v_result := to_jsonb(private.authorize_cash_action(
        (v_payload->>'p_authorizer_id')::uuid,
        COALESCE(v_payload->>'p_pin', ''),
        v_shift_id,
        COALESCE(v_payload->>'p_action', ''),
        (v_payload->>'p_amount')::numeric
      ));
    WHEN 'record_movement' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.record_cash_movement(
        v_shift_id,
        COALESCE(v_payload->>'p_movement_type', ''),
        COALESCE(v_payload->>'p_direction', ''),
        (v_payload->>'p_amount')::numeric,
        COALESCE(v_payload->>'p_reason', ''),
        (v_payload->>'p_authorization')::uuid
      );
    WHEN 'preview_close' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.preview_cash_shift_close(
        v_shift_id,
        COALESCE(v_payload->>'p_count_mode', ''),
        COALESCE(v_payload->'p_denominations', '{}'::jsonb),
        (v_payload->>'p_counted_cash')::numeric
      );
    WHEN 'close' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.multibusiness_close_cash_shift(
        p_business_id,
        v_shift_id,
        COALESCE(v_payload->>'p_count_mode', ''),
        COALESCE(v_payload->'p_denominations', '{}'::jsonb),
        (v_payload->>'p_counted_cash')::numeric,
        COALESCE(v_payload->>'p_note', ''),
        (v_payload->>'p_authorization')::uuid
      );
    WHEN 'list_history' THEN
      SELECT COALESCE(jsonb_agg(
        private.cash_shift_json(source.id, true)
        ORDER BY source.opened_at DESC
      ), '[]'::jsonb)
        INTO v_result
        FROM (
          SELECT shift.id, shift.opened_at
            FROM public.cash_shifts AS shift
           WHERE shift.business_id = p_business_id
           ORDER BY shift.opened_at DESC
           LIMIT LEAST(GREATEST(COALESCE((v_payload->>'p_limit')::integer, 50), 1), 200)
           OFFSET GREATEST(COALESCE((v_payload->>'p_offset')::integer, 0), 0)
        ) AS source;
    WHEN 'detail' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.get_cash_shift_detail(v_shift_id);
    WHEN 'list_movements' THEN
      SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
        INTO v_result
        FROM (
          SELECT
            to_jsonb(movement)
            || jsonb_build_object(
              'shift_number', shift.number,
              'shift_status', shift.status,
              'shift_archived_at', shift.archived_at,
              'created_by_name', creator.full_name,
              'authorized_by_name', authorizer.full_name,
              'corrected_amount', correction.corrected_amount,
              'correction_reason', correction.reason,
              'corrected_by', correction.created_by,
              'corrected_by_name', correction_creator.full_name,
              'correction_authorized_by', correction.authorized_by,
              'correction_authorized_by_name', correction_authorizer.full_name,
              'corrected_at', correction.created_at,
              'correction_status', CASE
                WHEN correction.id IS NULL THEN 'active'
                WHEN correction.corrected_amount = 0 THEN 'voided'
                ELSE 'corrected'
              END
            ) AS row_data,
            movement.created_at
            FROM public.cash_movements AS movement
            JOIN public.cash_shifts AS shift ON shift.id = movement.shift_id
            JOIN public.profiles AS creator ON creator.id = movement.created_by
            JOIN public.profiles AS authorizer ON authorizer.id = movement.authorized_by
            LEFT JOIN public.cash_movement_corrections AS correction
              ON correction.movement_id = movement.id
            LEFT JOIN public.profiles AS correction_creator
              ON correction_creator.id = correction.created_by
            LEFT JOIN public.profiles AS correction_authorizer
              ON correction_authorizer.id = correction.authorized_by
           WHERE movement.business_id = p_business_id
             AND (
               v_payload->>'p_since' IS NULL
               OR movement.created_at >= (v_payload->>'p_since')::timestamptz
             )
             AND (
               v_payload->>'p_until' IS NULL
               OR movement.created_at < (v_payload->>'p_until')::timestamptz
             )
           ORDER BY movement.created_at DESC
           LIMIT LEAST(GREATEST(COALESCE((v_payload->>'p_limit')::integer, 250), 1), 500)
           OFFSET GREATEST(COALESCE((v_payload->>'p_offset')::integer, 0), 0)
        ) AS rows;
    WHEN 'correct_movement' THEN
      IF NOT EXISTS (
        SELECT 1
          FROM public.cash_movements AS movement
         WHERE movement.id = (v_payload->>'p_movement_id')::uuid
           AND movement.business_id = p_business_id
      ) THEN
        RAISE EXCEPTION 'El movimiento no pertenece al negocio seleccionado';
      END IF;
      v_result := private.correct_cash_movement(
        (v_payload->>'p_movement_id')::uuid,
        (v_payload->>'p_corrected_amount')::numeric,
        COALESCE(v_payload->>'p_reason', ''),
        (v_payload->>'p_authorization')::uuid
      );
    WHEN 'adjustment' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.record_cash_shift_adjustment(
        v_shift_id,
        COALESCE(v_payload->>'p_payment_method', ''),
        COALESCE(v_payload->>'p_direction', ''),
        (v_payload->>'p_amount')::numeric,
        COALESCE(v_payload->>'p_reason', ''),
        (v_payload->>'p_authorization')::uuid
      );
    WHEN 'archive' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.archive_cash_shift(
        v_shift_id,
        COALESCE(v_payload->>'p_reason', '')
      );
    WHEN 'restore' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.restore_cash_shift(v_shift_id);
    WHEN 'deletion_impact' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.cash_shift_deletion_impact(v_shift_id);
    WHEN 'delete' THEN
      v_shift_id := (v_payload->>'p_shift_id')::uuid;
      PERFORM private.multibusiness_assert_shift_business(v_shift_id, p_business_id);
      v_result := private.permanently_delete_cash_shift(
        v_shift_id,
        COALESCE(v_payload->>'p_reason', ''),
        COALESCE(v_payload->>'p_confirmation', '')
      );
    ELSE
      RAISE EXCEPTION 'La operación de caja no es válida';
  END CASE;

  RETURN v_result;
END;
$$;

-- The old single-business RPCs bypass the business-aware authorization gate.
-- Application code uses multibusiness_cash_action once this schema is present.
REVOKE ALL ON FUNCTION public.get_current_cash_shift() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.open_cash_shift(numeric, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.authorize_cash_action(uuid, text, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_cash_movement(uuid, text, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_cash_shift_close(uuid, text, jsonb, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_cash_shift(uuid, text, jsonb, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_cash_shifts(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_cash_shift_detail(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_cash_shift_adjustment(uuid, text, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_cash_authorizers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_cash_shift(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_cash_shift(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_cash_shift_deletion_impact(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.permanently_delete_cash_shift(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.correct_cash_shift_opening_float(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_cash_movements(timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.correct_cash_movement(uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_global_waiter_cash_permissions(uuid, uuid, boolean, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_global_waiter_cash_permissions(uuid, uuid, boolean, boolean, text)
  TO authenticated;

REVOKE ALL ON FUNCTION private.can_view_cash_shift(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_cash_shift(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.can_manage_cash_shift(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_cash_shift(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.multibusiness_cash_action(uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.multibusiness_cash_action(uuid, text, jsonb)
  TO authenticated;
