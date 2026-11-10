-- Deleting a lead from MWP Leads is logged like every other press (who, when, which lead, its name).
alter table public.lead_actions drop constraint if exists lead_actions_kind_check;
alter table public.lead_actions add constraint lead_actions_kind_check check (kind in ('status','no_answer','note','delete'));
