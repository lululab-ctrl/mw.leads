-- Focus: a temporary, private view of chosen leads (Matan, 10 Nov 2026). It's only a filter: no lead is
-- moved, copied or changed, in MWP Leads or in monday. Only its creator sees, edits and closes it.
-- A lead is in a focus when it isn't removed by hand and: it was added by hand, OR its status is one of
-- `statuses`, OR one of `keywords` appears in its name, Interested in, Lead Source or About.
create table public.focus_lists (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  name text not null check (length(name) between 1 and 60),
  statuses text[] not null default '{}',
  keywords text[] not null default '{}',
  add_ids text[] not null default '{}',
  remove_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.focus_lists enable row level security;
create policy focus_own on public.focus_lists for all to authenticated
  using (public.is_team() and owner_email = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (public.is_team() and owner_email = lower(coalesce(auth.jwt() ->> 'email', '')));
revoke all on public.focus_lists from anon;
grant select, insert, update, delete on public.focus_lists to authenticated;
alter publication supabase_realtime add table public.focus_lists;
alter table public.focus_lists replica identity full;
