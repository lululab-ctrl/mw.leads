-- Each person with a monday login connects their own monday token, so monday shows THEM as the author
-- of what they do here. Only the server functions can read this table; the page only learns
-- whether you're connected and as whom (my_monday()).
create table public.monday_tokens (
  email text primary key,
  token text not null,
  monday_id text not null default '',
  monday_name text not null default '',
  added_at timestamptz not null default now()
);
alter table public.monday_tokens enable row level security;
revoke all on public.monday_tokens from anon, authenticated;

create or replace function public.my_monday() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('connected', true, 'name', monday_name, 'since', added_at)
       from public.monday_tokens where email = lower(coalesce(auth.jwt() ->> 'email', ''))),
    jsonb_build_object('connected', false));
$$;
revoke all on function public.my_monday() from public, anon;
grant execute on function public.my_monday() to authenticated;
