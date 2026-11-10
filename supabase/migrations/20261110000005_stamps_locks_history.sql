-- Who changed a lead and when, who is working on a lead right now, and the full history
-- (monday notes, status changes made in monday, and everything done in this app).

-- ---------- the stamp on every lead ----------
alter table public.leads
  add column changed_by text not null default '',
  add column changed_at bigint not null default 0,
  add column changed_what text not null default '';

-- ---------- history: one row per note or status change, from monday or from the app ----------
create table public.lead_updates (
  id text primary key,            -- monday update id, or st-<item>-<time> for a status change
  lead_id text not null,
  kind text not null check (kind in ('note','status')),
  text text not null default '',
  by text not null default '',
  at bigint not null default 0,
  source text not null default 'monday' check (source in ('monday','app')),
  bot boolean not null default false
);
create index lead_updates_lead on public.lead_updates (lead_id, at desc);
alter table public.lead_updates enable row level security;
create policy team_read_updates on public.lead_updates for select to authenticated using (public.is_team());
revoke all on public.lead_updates from anon;
grant select on public.lead_updates to authenticated;
alter publication supabase_realtime add table public.lead_updates;

-- ---------- locks: one person on a lead at a time ----------
-- Held while the lead is open; the page renews it every minute and frees it on Back or after a press; a tab left open frees it 10 minutes after it stops renewing (long enough for a phone call, when the browser sleeps).
create table public.lead_locks (
  lead_id text primary key,
  by_email text not null,
  by_name text not null,
  at timestamptz not null default now(),
  expires timestamptz not null
);
alter table public.lead_locks enable row level security;
create policy team_read_locks on public.lead_locks for select to authenticated using (public.is_team());
revoke all on public.lead_locks from anon;
grant select on public.lead_locks to authenticated;
alter publication supabase_realtime add table public.lead_locks;
alter table public.lead_locks replica identity full;

-- take (or renew) the lock; answers who holds it if someone else does
create or replace function public.claim_lead(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; cur record;
begin
  select email, name into me from public.team where email = lower(coalesce(auth.jwt() ->> 'email', ''));
  if me.email is null then raise exception 'not_team'; end if;
  select * into cur from public.lead_locks where lead_id = p_id for update;
  if found and cur.by_email <> me.email and cur.expires > now() then
    return jsonb_build_object('ok', false, 'by', cur.by_name, 'since', cur.at);
  end if;
  insert into public.lead_locks (lead_id, by_email, by_name, at, expires)
    values (p_id, me.email, me.name, now(), now() + interval '10 minutes')
  on conflict (lead_id) do update
    set by_email = excluded.by_email, by_name = excluded.by_name,
        at = case when public.lead_locks.by_email = excluded.by_email and public.lead_locks.expires > now() then public.lead_locks.at else now() end,
        expires = excluded.expires;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.release_lead(p_id text) returns void
language sql security definer set search_path = public as $$
  delete from public.lead_locks where lead_id = p_id and by_email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

revoke all on function public.claim_lead(text), public.release_lead(text) from public, anon;
grant execute on function public.claim_lead(text), public.release_lead(text) to authenticated;

-- old locks are cleared every 5 minutes (expired ones already count as free)
select cron.schedule('mwp-leads-locks', '*/5 * * * *', $$delete from public.lead_locks where expires < now() - interval '5 minutes'$$);

-- read the last 30 days again once, so the history starts full
update public.sync_meta set full_done = false where id = 1;
