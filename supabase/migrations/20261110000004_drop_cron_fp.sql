-- The temporary fingerprint check is no longer needed.
drop function if exists public.cron_secret_fp();
