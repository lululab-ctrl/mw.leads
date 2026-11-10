// The rules from Matan's "MWP Leads" page, unchanged. Plain JavaScript so the same file
// runs in the Supabase functions (Deno) and in tests/signals.html (a browser).

export const BOARD = 5100640869;
export const BOT = "103935161"; // Flow Admin: monday's automation account
export const C = {
  status: "color_mm5dd249", phone: "phone_mm5mysp", email: "email_mm5mxbf", source: "color_mm5mqmpf",
  interest: "text_mm5m935t", about: "long_text_mm5mtfrr", lang: "color_mm65s7rd", fu: "color_mm5mczpc",
  fuDate: "date_mm5mqtxx", lost: "color_mm8menag",
};
// Newsletter · Field Guides pop-up, Lost, Won
export const SKIP_GROUPS = ["group_mm8f26v7", "group_mm5mhqhp", "group_mm5m96pr"];
export const STATUSES = ["New Lead", "In conversation", "Qualified", "Offer sent", "Committed", "Won", "Future", "Lost"];
export const LOST = ["Price", "Dates", "Not a fit", "No response", "Other"];

export const CB_RE = /^הליד לחץ/; // the update monday gets when a lead clicks the call-me button in the info email
export const META_RE = /ביקש\/?ה? שנחזור בטלפון|בטלפון\?: ?כן|ביקש בטופס של Meta|call you\?: ?(?!email)\S/i;
export const NA_RE = /^(no answer|לא ענ)/i;
export const RET_RE = /^הליד חזר|התעניינות קודמת|lead returned/i;
export const AUTO_RE = /^נשלח אוטומטית/;
// Notes posted from this app end with "— Name" (one monday token posts them all)
export const SIGN_RE = /\n?\s*— ([^\n—]{1,40})\s*$/;

export function txt(v) { return v == null ? "" : typeof v === "object" ? (v.text || v.label || "") : String(v); }

// a monday item (GraphQL shape: column_values = [{id,text}]) → a lead row
export function fromItem(it) {
  const cv = {};
  for (const c of it.column_values || []) cv[c.id] = c.text == null ? "" : String(c.text);
  return {
    id: String(it.id), name: String(it.name || ""), status: cv[C.status] || "", phone: cv[C.phone] || "",
    email: cv[C.email] || "", source: cv[C.source] || "", interest: cv[C.interest] || "",
    about: (cv[C.about] || "").slice(0, 1500), lang: cv[C.lang] || "", fu_date: (cv[C.fuDate] || "").slice(0, 10),
    created: Date.parse(it.created_at) || 0,
  };
}

// who wrote a note: the "— Name" signature if this app posted it, else the monday account
export function noteBy(t, creatorName) {
  const m = SIGN_RE.exec(t);
  return m ? m[1].trim() : String(creatorName || "");
}

// monday updates → per-lead signals { cb, m, na, ret, last }
export function signals(updates) {
  const sig = {};
  for (const u of updates) {
    const id = String(u.item_id || "");
    if (!id) continue;
    const s = sig[id] || (sig[id] = { cb: 0, m: 0, na: 0, ret: 0, last: null });
    const t = String(u.text_body || "").trim();
    const at = Date.parse(u.created_at) || 0;
    const bot = String((u.creator && u.creator.id) || "") === BOT;
    if (AUTO_RE.test(t)) continue;
    const isCb = bot && CB_RE.test(t);
    if (isCb) s.cb = Math.max(s.cb, at);
    if (bot && META_RE.test(t)) s.m = Math.max(s.m, at);
    if (!bot && NA_RE.test(t)) s.na++;
    if (RET_RE.test(t)) s.ret = Math.max(s.ret, at);
    if (!bot && !isCb && t && t.charAt(0) !== "@" && (!s.last || at > s.last.at)) {
      s.last = { t: t.slice(0, 400), at, by: noteBy(t, u.creator && u.creator.name) };
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

const KEYS = ["name", "status", "phone", "email", "source", "interest", "about", "lang", "fu_date", "created", "ecb", "mcb", "na", "ret", "last_at", "last_t", "changed_by", "changed_at", "changed_what"];
export function differs(a, b) {
  for (const k of KEYS) if ((a[k] || "") !== (b[k] || "")) return true;
  return false;
}

// HTML body for a note posted to monday, signed with the real person's name
export function noteHtml(text, by) {
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return "<p>" + esc(text).replace(/\n/g, "<br>") + "<br>— " + esc(by) + "</p>";
}

// monday update → a history row
export function historyRow(u) {
  const t = String(u.text_body || "").trim();
  const bot = String((u.creator && u.creator.id) || "") === BOT;
  return {
    id: String(u.id), lead_id: String(u.item_id || ""), kind: "note", text: t.slice(0, 4000),
    by: bot ? "Flow Admin" : noteBy(t, u.creator && u.creator.name), at: Date.parse(u.created_at) || 0, source: "monday", bot,
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
  for (const l of logs || []) if (l.to) cands.push({ by: l.by, at: l.at, what: "Status → " + l.to });
  for (const c of cands) if (c.by && c.at > best.changed_at + 5000) best = { changed_by: c.by, changed_at: c.at, changed_what: c.what };
  return best;
}
