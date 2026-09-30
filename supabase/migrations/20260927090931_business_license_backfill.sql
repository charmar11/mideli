-- Preserve the exact local calendar-day expiry for every already operational
-- business. Drafts remain without a license and cannot sell until assigned.
INSERT INTO public.business_licenses (
  business_id, status, valid_until, activated_at, updated_at, updated_by
)
SELECT business.id,
       'active',
       (global_license.valid_until AT TIME ZONE CASE
         WHEN EXISTS (
           SELECT 1 FROM pg_catalog.pg_timezone_names AS zone
            WHERE zone.name = business.timezone
         ) THEN business.timezone
         ELSE 'America/Hermosillo'
       END)::date,
       business.created_at,
       now(),
       NULL
  FROM public.businesses AS business
  CROSS JOIN public.app_license AS global_license
 WHERE global_license.id = 1
   AND business.lifecycle_status IN ('active', 'paused')
ON CONFLICT (business_id) DO NOTHING;

INSERT INTO public.business_license_events (
  business_id, actor_user_id, event_type, previous_status,
  next_status, previous_valid_until, next_valid_until, note
)
SELECT license.business_id,
       NULL,
       'migrated',
       NULL,
       license.status,
       NULL,
       license.valid_until,
       'Vigencia inicial copiada de la licencia global durante la migración'
  FROM public.business_licenses AS license
 WHERE NOT EXISTS (
   SELECT 1 FROM public.business_license_events AS event
    WHERE event.business_id = license.business_id
      AND event.event_type = 'migrated'
 );
