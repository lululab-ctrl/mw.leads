// The rules from Matan's "MWP Leads" page, unchanged. Plain JavaScript so the same file
// runs in the Supabase functions (Deno) and in tests/signals.html (a browser).

export const BOARD = 5100640869;
export const BOT = "103935161"; // Flow Admin: monday's automation account
export const C = {
  status: "color_mm5dd249", phone: "phone_mm5mysp", email: "email_mm5mxbf", source: "color_mm5mqmpf",
  interest: "text_mm5m935t", about: "long_text_mm5mtfrr", lang: "color_mm65s7rd", fu: "color_mm5mczpc",
  fuDate: "date_mm5mqtxx", lost: "color_mm8menag", who: "text_mm8z41wf",
};
// Newsletter · Field Guides pop-up, Lost, Won
export const SKIP_GROUPS = ["group_mm8f26v7", "group_mm5mhqhp", "group_mm5m96pr"];
export const STATUSES = ["New Lead", "In conversation", "Qualified", "Offer sent", "Committed", "Won", "Future", "Lost"];
export const LOST = ["Price", "Dates", "Not a fit", "No response", "Other"];
// each status has its own group on the Leads board; a status change moves the lead there too (Jeinna, 10 Nov 2026)
export const STATUS_GROUP = {
  "New Lead": "topics", "In conversation": "group_mm5y88wd", "Qualified": "group_mm7wb0b0", "Offer sent": "group_mm7w8hm7",
  "Committed": "group_mm8m1xmp", "Won": "group_mm5m96pr", "Future": "group_mm7wj1a8", "Lost": "group_mm5mhqhp",
};

export const CB_RE = /^הליד לחץ/; // the update monday gets when a lead clicks the call-me button in the info email
export const META_RE = /ביקש\/?ה? שנחזור בטלפון|בטלפון\?: ?כן|ביקש בטופס של Meta|call you\?: ?(?!email)\S/i;
export const NA_RE = /^(no answer|לא ענ)/i;
export const RET_RE = /^הליד חזר|התעניינות קודמת|lead returned/i;
export const AUTO_RE = /^נשלח אוטומטית/;
// Notes posted from this app end with "— Name · 10.11.2026 14:32" (one monday token posts them all)
export const SIGN_RE = /\n?\s*— ([^\n—·]{1,40}?)\s*(?:·[^\n—]{0,40})?\s*$/;
// the note without its signature
export function unsign(t) { return String(t || "").replace(SIGN_RE, "").trim(); }
// Israel time as monday readers expect it: "10.11.2026 14:32"
export function whenIL(ms) { const o = utcToIsrael(ms); return o.date.split("-").reverse().join(".") + " " + o.time; }

export function txt(v) { return v == null ? "" : typeof v === "object" ? (v.text || v.label || "") : String(v); }

// a monday item (GraphQL shape: column_values = [{id,text}]) → a lead row
// Israel time <-> UTC (monday keeps a date column's time in UTC)
const TZ = "Asia/Jerusalem";
function tzOffsetMs(utcMs) {
  const p = {};
  for (const x of new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - utcMs;
}
// "2026-11-12", "14:00" in Israel -> ms since 1970 (UTC)
export function israelToUtc(date, time) {
  const [y, m, d] = String(date).split("-").map(Number), [h, mi] = String(time || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - tzOffsetMs(guess);
  t = guess - tzOffsetMs(t); // once more, for the days the clocks change
  return t;
}
// ms (UTC) -> { date: "2026-11-12", time: "14:00" } in Israel
export function utcToIsrael(ms) {
  const o = new Date(ms + tzOffsetMs(ms)).toISOString();
  return { date: o.slice(0, 10), time: o.slice(11, 16) };
}
// monday's Follow Up Date value -> the call's moment (0 if no time is set)
export function fuMoment(value) {
  let v = value;
  try { if (typeof v === "string") v = JSON.parse(v); } catch (_) { return { at: 0, hasTime: false }; }
  if (!v || !v.date) return { at: 0, hasTime: false };
  if (!v.time) return { at: israelToUtc(v.date, "00:00"), hasTime: false, date: v.date }; // a date with no time
  return { at: Date.parse(v.date + "T" + v.time + "Z") || 0, hasTime: true };
}

export function fromItem(it) {
  const cv = {}, vals = {};
  for (const c of it.column_values || []) { cv[c.id] = c.text == null ? "" : String(c.text); vals[c.id] = c.value; }
  const fu = fuMoment(vals[C.fuDate]), fuAt = fu.at;
  return {
    id: String(it.id), name: String(it.name || ""), status: cv[C.status] || "", phone: cv[C.phone] || "",
    email: cv[C.email] || "", source: cv[C.source] || "", interest: cv[C.interest] || "",
    about: (cv[C.about] || "").slice(0, 1500), lang: cv[C.lang] || "",
    fu_date: fu.date || (fuAt ? utcToIsrael(fuAt).date : (cv[C.fuDate] || "").slice(0, 10)), fu_at: fuAt, fu_has_time: !!fu.hasTime, fu_state: cv[C.fu] || "",
    created: Date.parse(it.created_at) || 0,
  };
}

// monday account names → team names
export const ACCOUNT_NAMES = { "emilya": "Emilia", "Matan Wild": "Matan", "Jeinna Louise Perez": "Jeinna" };
export function teamName(n) { n = String(n || ""); return ACCOUNT_NAMES[n] || n; }

// who wrote a note: a known real author (note_authors), the "— Name" signature if this app posted it,
// else the monday account (as a team name)
export function noteBy(t, creatorName, override) {
  if (override) return override;
  const m = SIGN_RE.exec(t);
  return m ? m[1].trim() : teamName(creatorName);
}

// monday updates → per-lead signals { cb, m, na, ret, last }
export function signals(updates, authors) {
  authors = authors || {};
  const sig = {};
  for (const u of updates) {
    const id = String(u.item_id || "");
    if (!id) continue;
    const s = sig[id] || (sig[id] = { cb: 0, m: 0, na: 0, ret: 0, last: null, claude: [] });
    const t = String(u.text_body || "").trim();
    const at = Date.parse(u.created_at) || 0;
    const bot = String((u.creator && u.creator.id) || "") === BOT;
    if (AUTO_RE.test(t)) continue;
    const isCb = bot && CB_RE.test(t);
    if (isCb) s.cb = Math.max(s.cb, at);
    if (bot && META_RE.test(t)) s.m = Math.max(s.m, at);
    if (!bot && NA_RE.test(t)) s.na++;
    if (RET_RE.test(t)) s.ret = Math.max(s.ret, at);
    if (CLAUDE_RE.test(t)) s.claude.push(at);
    if (!bot && !isCb && t && t.charAt(0) !== "@" && (!s.last || at > s.last.at)) {
      s.last = { t: unsign(t).slice(0, 400), at, by: CLAUDE_RE.test(t) ? "Claude" : noteBy(t, u.creator && u.creator.name, authors[String(u.id)]) };
    }
  }
  return sig;
}

// fresh item + signals + what we already had → the row to keep
export function merge(d, prev, s) {
  prev = prev || {}; s = s || {};
  d.ecb = Math.max(prev.ecb || 0, s.cb || 0);
  d.mcb = Math.max(prev.mcb || 0, s.m || 0, META_RE.test(d.about) ? d.created : 0);
  d.na = Math.max(prev.na || 0, s.na || 0);
  d.ret = Math.max(prev.ret || 0, s.ret || 0);
  const pl = prev.last_at ? { t: prev.last_t, at: prev.last_at, by: prev.last_by } : null;
  const last = (s.last && (!pl || s.last.at >= (pl.at || 0) - 5000)) ? s.last : pl;
  d.last_t = last ? last.t : null; d.last_at = last ? last.at : 0; d.last_by = last ? (last.by || "") : "";
  d.st_at = prev.st_at || 0;
  d.touch = prev.touch || 0;
  return d;
}

const KEYS = ["name", "status", "phone", "email", "source", "interest", "about", "lang", "fu_date", "fu_at", "fu_state", "created", "ecb", "mcb", "na", "ret", "last_at", "last_t", "changed_by", "changed_at", "changed_what"];
export function differs(a, b) {
  for (const k of KEYS) if ((a[k] || "") !== (b[k] || "")) return true;
  if (!!a.fu_has_time !== !!b.fu_has_time) return true;
  return false;
}

// HTML body for a note posted to monday, signed with who wrote it and when (Jeinna, 10 Nov 2026:
// monday names the token's owner on every note, so the signature says who really did it)
export function noteHtml(text, by, at) {
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sig = by ? "<br>— " + esc(by) + (at ? " · " + whenIL(at) : "") : "";
  return "<p>" + esc(text).replace(/\n/g, "<br>") + sig + "</p>";
}

// monday update → a history row
export function historyRow(u, authors) {
  authors = authors || {};
  const t = String(u.text_body || "").trim();
  const bot = String((u.creator && u.creator.id) || "") === BOT;
  return {
    id: String(u.id), lead_id: String(u.item_id || ""), kind: "note", text: unsign(t).slice(0, 4000),
    by: bot ? "Flow Admin" : CLAUDE_RE.test(t) ? "Claude" : noteBy(t, u.creator && u.creator.name, authors[String(u.id)]), at: Date.parse(u.created_at) || 0, source: "monday", bot,
  };
}

// monday activity log entry for the Status column → { lead_id, at, from, to, user_id } or null
export function statusLog(a) {
  let d = a.data;
  try { if (typeof d === "string") d = JSON.parse(d); } catch (_) { return null; }
  if (!d || String(d.column_id || "") !== C.status) return null;
  const lab = (v) => (v && v.label && (v.label.text || v.label)) || "";
  const at = Math.round(Number(a.created_at) / 10000); // monday gives 1/10,000,000 s
  if (!d.pulse_id || !at) return null;
  return { lead_id: String(d.pulse_id), at, from: String(lab(d.previous_value) || ""), to: String(lab(d.value) || ""), user_id: String(a.user_id || "") };
}

// the newest change by a person (team note, or a status change made in monday) → the lead's stamp.
// Changes made from this app are stamped by the app itself and are never older-than-newest here.
export function stamp(prev, s, logs) {
  prev = prev || {};
  let best = { changed_by: prev.changed_by || "", changed_at: Number(prev.changed_at || 0), changed_what: prev.changed_what || "" };
  const cands = [];
  if (s && s.last) cands.push({ by: s.last.by, at: s.last.at, what: NA_RE.test(s.last.t) ? "No answer" : "Note" });
  for (const l of logs || []) if (l.to && l.by !== "monday automation") cands.push({ by: l.by, at: l.at, what: "Status → " + l.to });
  for (const c of cands) {
    if (c.by && c.at > best.changed_at + 5000) best = { changed_by: c.by, changed_at: c.at, changed_what: c.what };
    else if (c.by && c.by !== best.changed_by && Math.abs(c.at - best.changed_at) <= 5000 && c.what === best.changed_what) best = { changed_by: c.by, changed_at: c.at, changed_what: c.what };
  }
  return best;
}

// "Last change in MWP Leads" in monday: the lead's whole history, newest first, one line each,
// with who really did it (Jeinna, 10 Nov 2026). Claude's notes and automatic emails posted under
// a person's monday account are labelled as such, so nobody is credited with work they didn't do.
export const CLAUDE_RE = /\(\d{1,2}\.\d{1,2}(\.\d{2,4})?, ?Claude/;
export function histWho(r) {
  const t = String(r.text || "");
  if (r.bot || r.by === "Flow Admin" || r.by === "monday automation" || AUTO_RE.test(t) || CB_RE.test(t) || RET_RE.test(t)) return "Automation";
  if (CLAUDE_RE.test(t)) return "Claude";
  return r.by || "—";
}
export function histLine(r) {
  const one = (x, n) => { x = String(x || "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };
  const what = r.kind === "status" ? "Status " + one(String(r.text || "").replace(/\[object Object\]/g, "—"), 80)
    : r.kind === "call" ? (r.text === "done" ? "Follow-up call done" : "Follow-up call set: " + one(r.text, 80))
    : one(unsign(r.text), 140);
  return whenIL(Number(r.at)) + " · " + histWho(r) + " · " + what;
}
export function historyText(rows, max = 1900) {
  rows = (rows || []).filter((r) => r.kind !== "tap"); // taps stay in MWP Leads; monday's history shows what was done
  rows = [...rows].filter((r) => r && r.at);
  // a status change made by Claude shows under the person's monday account, a moment before Claude's note
  const claude = rows.filter((r) => r.kind === "note" && CLAUDE_RE.test(String(r.text || "")));
  rows = rows.map((r) => r.kind === "status" && claude.some((n) => n.by === r.by && Math.abs(Number(n.at) - Number(r.at)) < 180000) ? { ...r, by: "Claude" } : r);
  const lines = rows.sort((a, b) => Number(b.at) - Number(a.at)).map(histLine);
  // MWP Leads' record starts on 13.10.2026: say so, so an empty or short history is never read as "nobody did anything"
  const foot = lines.length
    ? "(MWP Leads history starts 13.10.2026; older notes are in this lead's Updates)"
    : "No changes recorded in MWP Leads (its history starts 13.10.2026). Older notes are in this lead's Updates.";
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const more = lines.length - i;
    const next = (out ? out + "\n" : "") + lines[i];
    if (next.length > max - 40 - foot.length) return out + "\n… " + more + " older in MWP Leads\n" + foot;
    out = next;
  }
  return (out ? out + "\n" : "") + foot;
}
