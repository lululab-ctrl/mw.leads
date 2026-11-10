-- Everything on the Leads board shows in MWP Leads, even when it's incomplete (Jeinna, 10 Nov 2026).
-- details: every filled-in column, in the board's order, as [{t: title, v: text}].
-- fu_has_time: false when monday's Follow Up Date has a date but no time (fu_at is then that day's start, Israel time).
alter table public.leads
  add column if not exists details jsonb not null default '[]'::jsonb,
  add column if not exists fu_has_time boolean not null default false;
