-- The real author of monday updates posted under someone else's account.
-- Eliran has no monday login: the Control App posts his work through a teammate's page, so monday shows
-- that teammate's name. These come from the Control App's own record of who did each note (noteBy).
create table public.note_authors (
  update_id text primary key,  -- monday update id, or st-<item>-<time> for a status change
  by text not null,
  why text not null default ''
);
alter table public.note_authors enable row level security;
revoke all on public.note_authors from anon, authenticated;

insert into public.note_authors (update_id, by, why) values
  ('667603383', 'Eliran', 'Control App, posted from Jeinna''s page 9.11'),
  ('667603406', 'Eliran', 'Control App, posted from Jeinna''s page 9.11'),
  ('667603451', 'Eliran', 'Control App, posted from Jeinna''s page 9.11'),
  ('667603509', 'Eliran', 'Control App, posted from Jeinna''s page 9.11'),
  ('667603560', 'Eliran', 'Control App, posted from Jeinna''s page 9.11'),
  ('667603600', 'Eliran', 'Control App, posted from Jeinna''s page 9.11'),
  ('667603650', 'Eliran', 'Control App, posted from Jeinna''s page 9.11'),
  ('667603700', 'Eliran', 'Control App, posted from Jeinna''s page 9.11'),
  ('667603761', 'Eliran', 'Control App, posted from Jeinna''s page 9.11'),
  ('667603806', 'Eliran', 'Control App, posted from Jeinna''s page 9.11'),
  ('st-3334052142-1794223815120', 'Eliran', 'Lost on 8.11 by Eliran, sent from Jeinna''s page 9.11'),
  ('st-3336975795-1794223818086', 'Eliran', 'Lost on 8.11 by Eliran, sent from Jeinna''s page 9.11'),
  ('668117867', 'Matan', 'Control App: Matan''s note, posted from Jeinna''s page 9.11');

-- fix what is already stored
update public.lead_updates u set by = a.by from public.note_authors a where u.id = a.update_id;
update public.leads set changed_by = 'Eliran'
  where changed_by ilike '%jeinna%' and id in ('3337886613','3338511150','3337105423','3338522203','3338830707','3337633000','3338439916');
update public.leads set last_by = 'Eliran'
  where last_by ilike '%jeinna%' and id in ('3337886613','3338511150','3337105423','3338522203','3338830707','3337633000','3338439916');

-- team names instead of monday account names
update public.lead_updates set by = case by when 'emilya' then 'Emilia' when 'Matan Wild' then 'Matan' when 'Jeinna Louise Perez' then 'Jeinna' else by end
  where by in ('emilya','Matan Wild','Jeinna Louise Perez');
update public.leads set changed_by = case changed_by when 'emilya' then 'Emilia' when 'Matan Wild' then 'Matan' when 'Jeinna Louise Perez' then 'Jeinna' else changed_by end
  where changed_by in ('emilya','Matan Wild','Jeinna Louise Perez');
update public.leads set last_by = case last_by when 'emilya' then 'Emilia' when 'Matan Wild' then 'Matan' when 'Jeinna Louise Perez' then 'Jeinna' else last_by end
  where last_by in ('emilya','Matan Wild','Jeinna Louise Perez');
