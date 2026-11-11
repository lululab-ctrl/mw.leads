-- A tap on Call, WhatsApp or Copy number in MWP Leads is recorded (for the report), Jeinna with Matan's OK, 11 Nov 2026
alter table public.lead_actions drop constraint if exists lead_actions_kind_check;
alter table public.lead_actions add constraint lead_actions_kind_check
  check (kind in ('status','no_answer','note','delete','call','call_done','tap'));
alter table public.lead_updates drop constraint if exists lead_updates_kind_check;
alter table public.lead_updates add constraint lead_updates_kind_check check (kind in ('note','status','call','tap'));
