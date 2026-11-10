-- Follow-up calls (Jeinna, 10 Nov 2026): scheduled from MWP Leads into monday's Follow Up Date (with time)
-- and Follow Up columns. fu_at is the call's moment (ms, UTC); fu_state is monday's Follow Up label.
alter table public.leads
  add column if not exists fu_at bigint not null default 0,
  add column if not exists fu_state text not null default '';

alter table public.lead_actions drop constraint if exists lead_actions_kind_check;
alter table public.lead_actions add constraint lead_actions_kind_check
  check (kind in ('status','no_answer','note','delete','call','call_done'));

alter table public.lead_updates drop constraint if exists lead_updates_kind_check;
alter table public.lead_updates add constraint lead_updates_kind_check check (kind in ('note','status','call'));
