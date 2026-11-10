-- MWP Leads: the standalone copy of Matan's "MWP Leads" artifact.
-- monday's Leads board stays the source of truth. This database keeps the synced list,
-- the signals worked out from monday's updates, and a log of every button press.

-- ---------- the team (only these emails can sign in) ----------
create table public.team (
  email text primary key check (email = lower(email)),
  name  text not null,
  added_at timestamptz not null default now()
);

-- The people come from the TEAM secret (set by the deploy workflow through set_team), so no
-- emails sit in this public repository. Names show on the notes posted to monday ("— Name").
create or replace function public.set_team(people jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.team where email not in (select lower(x ->> 'email') from jsonb_array_elements(people) x);
  insert into public.team (email, name)
    select lower(x ->> 'email'), x ->> 'name' from jsonb_array_elements(people) x
  on conflict (email) do update set name = excluded.name;
end $$;
revoke all on function public.set_team(jsonb) from public, anon, authenticated;

create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team t where t.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- Nobody outside the team can even create a login.
create or replace function public.only_team_signups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.team t where t.email = lower(new.email)) then
    raise exception 'This email is not on the MWP Leads team';
  end if;
  return new;
end $$;
create trigger only_team_signups before insert on auth.users
  for each row execute function public.only_team_signups();

-- ---------- leads: one row per monday item ----------
-- Times are milliseconds since 1970 (bigint), exactly as the original page keeps them.
create table public.leads (
  id       text primary key,          -- monday item id
  name     text not null default '',
  status   text not null default '',
  phone    text not null default '',
  email    text not null default '',
  source   text not null default '',
  interest text not null default '',
  about    text not null default '',  -- first 1500 characters
  lang     text not null default '',
  fu_date  text not null default '',  -- YYYY-MM-DD or ''
  created  bigint not null default 0,
  ecb      bigint not null default 0, -- clicked "Call me" in the info email (Flow Admin update)
  mcb      bigint not null default 0, -- asked for a call in the Meta form
  ret      bigint not null default 0, -- came back again
  na       int    not null default 0, -- "No answer" count
  last_t   text,                      -- newest team note (first 400 characters)
  last_at  bigint not null default 0,
  last_by  text not null default '',
  st_at    bigint not null default 0, -- status changed from this app
  touch    bigint not null default 0, -- last change from this app (sync leaves it alone for 30 s)
  synced_at timestamptz not null default now()
);

create table public.sync_meta (
  id int primary key default 1 check (id = 1),
  at bigint not null default 0,          -- last finished sync
  full_done boolean not null default false, -- first 30-day pass done: later passes read 2 days
  running_until timestamptz,             -- lease so two syncs never overlap
  last_error text,
  last_error_at timestamptz
);
insert into public.sync_meta (id) values (1);

-- ---------- every press, with who really did it ----------
create table public.lead_actions (
  id bigint generated always as identity primary key,
  lead_id text not null,
  by_email text not null,
  by_name text not null,
  kind text not null check (kind in ('status','no_answer','note')),
  status_from text,
  status_to text,
  lost_reason text,
  note text,
  monday_update_id text,
  ok boolean not null default true,
  error text,
  at timestamptz not null default now()
);
create index lead_actions_lead on public.lead_actions (lead_id, at desc);

-- ---------- access: the team reads, only the server functions write ----------
alter table public.team enable row level security;
alter table public.leads enable row level security;
alter table public.sync_meta enable row level security;
alter table public.lead_actions enable row level security;

create policy team_read_team on public.team for select to authenticated using (public.is_team());
create policy team_read_leads on public.leads for select to authenticated using (public.is_team());
create policy team_read_sync on public.sync_meta for select to authenticated using (public.is_team());
create policy team_read_actions on public.lead_actions for select to authenticated using (public.is_team());

revoke all on public.team, public.leads, public.sync_meta, public.lead_actions from anon;
grant select on public.team, public.leads, public.sync_meta, public.lead_actions to authenticated;

-- live list on every open page (the original page's onSnapshot)
alter publication supabase_realtime add table public.leads, public.sync_meta;
alter table public.leads replica identity full;

-- ---------- sync lease ----------
create or replace function public.take_sync_lease(seconds int default 90) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  update public.sync_meta set running_until = now() + make_interval(secs => seconds)
   where id = 1 and (running_until is null or running_until < now())
  returning true into ok;
  return coalesce(ok, false);
end $$;
revoke all on function public.take_sync_lease(int) from public, anon, authenticated;

-- ---------- sync every minute, even when nobody has the page open ----------
-- The function's address and the shared secret live in Vault (set by the deploy workflow).
-- Until they are there, the job does nothing.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.cron_sync() returns void
language plpgsql security definer set search_path = public, vault as $$
declare u text; s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'leads_sync_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'leads_cron_secret';
  if u is null or s is null then return; end if;
  perform net.http_post(url := u, body := '{"source":"cron"}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', s),
    timeout_milliseconds := 55000);
end $$;
revoke all on function public.cron_sync() from public, anon, authenticated;

select cron.schedule('mwp-leads-sync', '* * * * *', 'select public.cron_sync()');

-- the deploy workflow calls this to store the address and secret
create or replace function public.set_sync_secrets(sync_url text, cron_secret text) returns void
language plpgsql security definer set search_path = public, vault as $$
begin
  delete from vault.secrets where name in ('leads_sync_url','leads_cron_secret');
  perform vault.create_secret(sync_url, 'leads_sync_url');
  perform vault.create_secret(cron_secret, 'leads_cron_secret');
end $$;
revoke all on function public.set_sync_secrets(text, text) from public, anon, authenticated;
