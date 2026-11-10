-- Temporary check: length and short fingerprint of the Vault copy (never the value), for the sync log.
create or replace function public.cron_secret_fp() returns text
language sql stable security definer set search_path = public, vault, extensions as $$
  select string_agg(length(decrypted_secret)::text || ':' || left(encode(extensions.digest(decrypted_secret, 'sha256'), 'hex'), 8), ',')
    from vault.decrypted_secrets where name = 'leads_cron_secret';
$$;
revoke all on function public.cron_secret_fp() from public, anon, authenticated;
grant execute on function public.cron_secret_fp() to service_role;
