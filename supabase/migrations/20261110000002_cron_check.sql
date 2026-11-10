-- The sync function checks the every-minute job's secret against the same Vault copy the job sends,
-- so the two can never disagree.
create or replace function public.cron_secret_ok(s text) returns boolean
language sql stable security definer set search_path = public, vault as $$
  select coalesce(s, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'leads_cron_secret' and decrypted_secret = s);
$$;
revoke all on function public.cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.cron_secret_ok(text) to service_role;
