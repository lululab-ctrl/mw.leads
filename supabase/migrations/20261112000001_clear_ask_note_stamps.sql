-- The automation's "the lead asked in the Meta form to be called back" note, written under Matan's monday
-- account, was stamped as "Matan · Note" on the lead before 12 Nov 2026. It's Automation, not someone
-- handling the lead: clear those stamps once (new ones aren't made any more). Jeinna, 12 Nov 2026.
update public.leads l
set changed_by = '', changed_at = 0, changed_what = ''
where l.changed_what = 'Note'
  and exists (
    select 1 from public.lead_updates u
    where u.lead_id = l.id and u.kind = 'note'
      and u.text like 'הליד ביקש בטופס%'
      and abs(u.at - l.changed_at) < 5000
  );
