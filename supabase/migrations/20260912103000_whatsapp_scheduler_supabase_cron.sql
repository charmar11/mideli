-- Ejecuta el scheduler de WhatsApp cada minuto sin depender de los límites
-- de cron del plan de hosting. La URL y el secreto viven en Supabase Vault.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA cron TO postgres;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'mideli-whatsapp-scheduler'
  ) THEN
    PERFORM cron.schedule(
      'mideli-whatsapp-scheduler',
      '* * * * *',
      $job$
        SELECT net.http_post(
          url := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'mideli_app_url'
          ) || '/api/cron/whatsapp-scheduler',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'mideli_whatsapp_scheduler_secret'
            )
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 10000
        );
      $job$
    );
  END IF;
END;
$$;
