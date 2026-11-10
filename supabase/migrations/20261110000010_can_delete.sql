-- Only Matan and Jeinna can delete leads (Jeinna, 10 Nov 2026). Emilia and Eliran can't.
alter table public.team add column if not exists can_delete boolean not null default false;
update public.team set can_delete = (name in ('Matan', 'Jeinna'));
