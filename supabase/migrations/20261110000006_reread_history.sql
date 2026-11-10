-- read the last 30 days once more, now that status changes by monday automations no longer stop the history
update public.sync_meta set full_done = false where id = 1;
