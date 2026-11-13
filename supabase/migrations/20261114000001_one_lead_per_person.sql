-- One open lead per person (Jeinna, 14 Nov 2026: Matan showed as working on two leads at once).
-- Opening a lead now frees any other lead the same person holds. The every-minute renewal passes
-- p_renew = true: it only renews a lock the person still has, so two open tabs or devices don't keep
-- taking leads back from each other.
drop function if exists public.claim_lead(text);

create or replace function public.claim_lead(p_id text, p_renew boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; cur record;
begin
  select email, name into me from public.team where email = lower(coalesce(auth.jwt() ->> 'email', ''));
  if me.email is null then raise exception 'not_team'; end if;
  select * into cur from public.lead_locks where lead_id = p_id for update;
  if found and cur.by_email <> me.email and cur.expires > now() then
    return jsonb_build_object('ok', false, 'by', cur.by_name, 'since', cur.at);
  end if;
  if p_renew and not (found and cur.by_email = me.email) then
    return jsonb_build_object('ok', false, 'moved', true); -- this person opened another lead since
  end if;
  delete from public.lead_locks where by_email = me.email and lead_id <> p_id;
  insert into public.lead_locks (lead_id, by_email, by_name, at, expires)
    values (p_id, me.email, me.name, now(), now() + interval '10 minutes')
  on conflict (lead_id) do update
    set by_email = excluded.by_email, by_name = excluded.by_name,
        at = case when public.lead_locks.by_email = excluded.by_email and public.lead_locks.expires > now() then public.lead_locks.at else now() end,
        expires = excluded.expires;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.claim_lead(text, boolean) from public, anon;
grant execute on function public.claim_lead(text, boolean) to authenticated;
