# MWP Leads

The standalone copy of Matan's "MWP Leads" page (a Claude artifact): a two-screen calling list
for the monday **Leads** board (5100640869). Same screens, ranking and buttons; it now runs on
GitHub Pages + Supabase instead of inside Claude.

- `web/`: the page (HTML/CSS/JS, no build step). `style.css` and the ranking in `app.js` are Matan's, unchanged.
- `supabase/migrations/`: tables `team`, `leads`, `sync_meta`, `lead_actions`; access rules; the every-minute sync job.
- `supabase/functions/sync`: reads monday (items + updates) into `leads`. Rules in `_shared/signals.js`.
- `supabase/functions/act`: one press on the lead screen → note and/or status (and Lost reason) in monday.
- `tests/signals.html`, `tests/app.html`: open through a local server (`python3 -m http.server 8800`).

## How it works

**Sync (every minute, plus Refresh and the page's own check every 30 s when the list is over 55 s old).**
Items from the Leads board, leaving out the Won, Lost and "Newsletter · Field Guides pop-up" groups.
Updates from the last 30 days on the first pass, then 2 days (100 a page, up to 8 pages). From the updates:

| Signal | Rule |
|---|---|
| Clicked "Call me" in the info email (`ecb`) | Flow Admin update starting `הליד לחץ` |
| Asked for a call, Meta form (`mcb`) | Flow Admin update matching the phone-call request, or the request in the About column (then = the day it came in) |
| Came back (`ret`) | `הליד חזר`, `התעניינות קודמת` or `lead returned` |
| No answer count (`na`) | team updates starting `No answer` / `לא ענ` |
| Last note | newest team update; skips Flow Admin, `נשלח אוטומטית…` and notes starting with `@` |

A lead changed from the page in the last 30 seconds is left alone. Leads that left the board (or those groups) leave the list.

**Ranking (on the page).** Priority 1: asked for a call (email button counts more), 2: came back in the last week,
3: New Lead from the last week. A signal counts only if newer than the last team note (Meta and came-back: also within 7 days).
3+ "No answer"s drops the priority. Sections: Call first · In progress · Old, never called (New Lead > 14 days) · Done today.
Won and Lost never show; Future sits behind "Call later (n)".

**Buttons.** No answer (posts "No answer", count +1), the 8 statuses, Lost → reason (Price, Dates, Not a fit, No response, Other),
Save the note only. Every note posted to monday ends with "— Name" (one monday token posts them all), and every press is logged in `lead_actions`.

Known quirks kept from the original: the follow-up date is read but not used ("Follow up today" never shows); the Lost reasons are English on the Hebrew screen.

## Setup

1. GitHub: Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions:
   - Variables: `SUPABASE_PROJECT_REF`, `SUPABASE_URL` (`https://<ref>.supabase.co`), `SUPABASE_ANON_KEY`, `SITE_URL` (the Pages address), `SITE_ORIGIN` (the same, without a path)
   - Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CRON_SECRET` (long random text), `TEAM` (one per line: `email,Name`), `MONDAY_API_TOKEN` (later)
3. Push to `main` (or run the Deploy workflow). Until `MONDAY_API_TOKEN` is set the list stays empty and the page says the monday connection isn't set up.
4. Supabase → Authentication → Emails: set a custom SMTP server (the built-in sender allows only a few emails an hour).

## Team

Only the people in the `TEAM` secret can sign in (a trigger refuses any other login). One per line, `email,Name`.
Change the secret and re-run the Deploy workflow. The names appear on notes in monday. No emails are kept in this repository.
