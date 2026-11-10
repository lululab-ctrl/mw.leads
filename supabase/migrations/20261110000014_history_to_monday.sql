-- What MWP Leads last wrote to monday's "Last change in MWP Leads" column for each lead (its history),
-- so the sync only writes a lead again when its history changed. Server-only.
create table if not exists public.lead_hist (
  lead_id text primary key,
  text text not null,
  at bigint not null default 0
);
alter table public.lead_hist enable row level security;
revoke all on public.lead_hist from anon, authenticated;
