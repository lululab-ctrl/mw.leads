// MWP Leads: Matan's page, moved out of Claude. The screens, ranking and buttons are his,
// unchanged. What changed: the list comes from Supabase (kept in sync with monday by the
// `sync` function every minute) and each press goes through the `act` function.
const CFG = window.MWPL_CONFIG || {};
const sb = window.__MWPL_MOCK || (await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm"))
  .createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });

const BOARD = 5100640869;
const ST = [
  { k: "New Lead", c: "new", he: "ליד חדש", en: "New" },
  { k: "In conversation", c: "talk", he: "בשיחה", en: "In conversation" },
  { k: "Qualified", c: "qual", he: "מתאים", en: "Qualified" },
  { k: "Offer sent", c: "offer", he: "נשלחה הצעה", en: "Offer sent" },
  { k: "Committed", c: "commit", he: "התחייב/ה", en: "Committed" },
  { k: "Won", c: "won", he: "נרשם/ה", en: "Won" },
  { k: "Future", c: "future", he: "לעתיד", en: "Later" },
  { k: "Lost", c: "lost", he: "לא רלוונטי", en: "Lost" }];
const STM = {}; ST.forEach((s) => { STM[s.k] = s; });
const LOST = [["Price", "מחיר"], ["Dates", "תאריכים"], ["Not a fit", "לא מתאים"], ["No response", "אין מענה"], ["Other", "אחר"]];
const OPEN = ["New Lead", "In conversation", "Qualified", "Offer sent", "Committed"];
const S = { tab: 0, lang: "en", leads: new Map(), locks: new Map(), hist: [], hb: 0, q: "", open: null, user: null, me: null, syncing: false, syncAt: 0, metaAt: 0, dbReady: false, err: null, later: false };
try { const sl = localStorage.getItem("mwpl.lang"); S.lang = sl || ((navigator.language || "").slice(0, 2) === "he" ? "he" : "en"); } catch (_) {}
function L(he, en) { return S.lang === "he" ? he : en; }
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function dayStart() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function ago(ms) {
  if (!ms) return "";
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return L("עכשיו", "just now");
  if (m < 60) return L("לפני " + m + " דק׳", m + " min ago");
  const h = Math.round(m / 60);
  if (h < 24) return L("לפני " + h + " שע׳", h + " h ago");
  const d = Math.round(h / 24);
  return d === 1 ? L("אתמול", "yesterday") : L("לפני " + d + " ימים", d + " days ago");
}
function tel(raw) {
  const d = String(raw || "").replace(/[^\d+]/g, "");
  if (d.replace(/\D/g, "").length < 7) return null;
  if (d[0] === "+") return d;
  if (d.indexOf("00") === 0) return "+" + d.slice(2);
  if (d.indexOf("972") === 0 && d.length >= 11) return "+" + d;
  if (d[0] === "0") return "+972" + d.slice(1);
  if (d.length === 8 || d.length === 9) return "+972" + d;
  if (d.length === 10) return "+1" + d;
  return "+" + d;
}
function telShow(e) { if (!e) return ""; if (e.indexOf("+972") === 0) { const r = "0" + e.slice(4); return r.length === 10 ? r.slice(0, 3) + "-" + r.slice(3, 6) + "-" + r.slice(6) : r; } return e; }
function toast(t, bad) {
  const el = $("toast"); el.firstElementChild.textContent = t; el.firstElementChild.className = bad ? "bad" : ""; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, bad ? 6000 : 2600);
}

// a database row → the shape the original page works with
function fromRow(r) {
  return { id: r.id, name: r.name, status: r.status, phone: r.phone, email: r.email, source: r.source, interest: r.interest,
    about: r.about, lang: r.lang, fuDate: r.fu_date, created: +r.created || 0, ecb: +r.ecb || 0, mcb: +r.mcb || 0,
    ret: +r.ret || 0, na: r.na || 0, last: r.last_t ? { t: r.last_t, at: +r.last_at || 0, by: r.last_by || "" } : null,
    stAt: +r.st_at || 0, touch: +r.touch || 0,
    changedBy: r.changed_by || "", changedAt: +r.changed_at || 0, changedWhat: r.changed_what || "" };
}

/* ---------- stamps and locks ---------- */
function when(ms) {
  if (!ms) return "";
  const d = new Date(ms), o = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
  return new Intl.DateTimeFormat(S.lang === "he" ? "he-IL" : "en-GB", o).format(d);
}
const WHAT_HE = { "Note": "הערה", "No answer": "לא ענה/תה" };
function whatText(w) {
  if (S.lang !== "he" || !w) return w || "";
  if (WHAT_HE[w]) return WHAT_HE[w];
  const m = /^Status → (.+?)( \((.+)\))?$/.exec(w);
  return m ? "סטטוס ← " + ((STM[m[1]] && STM[m[1]].he) || m[1]) + (m[3] ? " (" + m[3] + ")" : "") : w;
}
function stampText(l) { return l.changedBy ? "✎ " + l.changedBy + " · " + when(l.changedAt) + (l.changedWhat ? " · " + whatText(l.changedWhat) : "") : ""; }
function lockOf(id) {
  const k = S.locks.get(id);
  if (!k || new Date(k.expires).getTime() <= Date.now()) return null;
  if (S.me && k.by_email === S.me.email) return null;
  return k;
}
async function claim(id) {
  const { data, error } = await sb.rpc("claim_lead", { p_id: id });
  if (error) return { ok: true }; // never block work on a lock error: the server still checks on every press
  return data || { ok: true };
}
function release(id) { if (id) sb.rpc("release_lead", { p_id: id }).then(() => {}, () => {}); }

/* ---------- ranking (unchanged) ---------- */
function facts(l) {
  /* Order: 1 asked us to call (Meta form in the past week, or the email button), 2 came back again, 3 new by date (past week, never contacted), 4 follow-up due. Old = New Lead for over two weeks. */
  const now = Date.now(), t0 = dayStart(), lastAt = (l.last && l.last.at) || 0, W = 7 * 864e5;
  const f = { cbE: !!(l.ecb && l.ecb > lastAt), cbM: !!(l.mcb && l.mcb > lastAt && l.mcb > now - W),
    ret: !!(l.ret && l.ret > lastAt && l.ret > now - W),
    fresh: l.status === "New Lead" && (l.created || 0) > now - W,
    due: !!(l.fuDate && l.fuDate <= iso(new Date())),
    done: lastAt >= t0 || (l.stAt || 0) >= t0, open: OPEN.indexOf(l.status) >= 0, na: l.na || 0 };
  f.cb = f.cbE || f.cbM;
  f.tier = f.cb ? 1 : f.ret ? 2 : f.fresh ? 3 : 0;
  if (f.na >= 3) f.tier = 0;
  f.old = !f.tier && l.status === "New Lead" && (l.created || 0) < now - 14 * 864e5;
  f.score = f.tier ? (5 - f.tier) * 1000 + (f.cbE ? 500 : 0) - f.na * 10 : 0;
  f.top = f.open && !f.done && f.tier > 0;
  f.g = f.done ? 3 : f.top ? 0 : f.old ? 2 : 1;
  return f;
}

/* ---------- screens ---------- */
function word(k) { return k || ""; }
const PHONE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
function why(l, f) {
  if (f.tier === 1) return f.cbE ? L("לחץ/ה ״תחזרו אליי״ במייל", "Clicked Call me in the email") : L("ביקש/ה שנתקשר (טופס Meta)", "Asked for a call (Meta form)");
  if (f.tier === 2) return L("חזר/ה שוב", "Came back again");
  if (f.tier === 3) return (l.created || 0) >= dayStart() ? L("חדש מהיום", "New today") : L("חדש · ", "New · ") + ago(l.created);
  if (f.tier === 4) return L("לחזור היום", "Follow up today");
  if (f.old) return L("מחכה ", "Waiting ") + Math.round((Date.now() - l.created) / 864e5) + L(" ימים", " days");
  return "";
}
function rows() {
  const q = S.q.trim().toLowerCase(), out = [];
  S.leads.forEach((l) => {
    if (l.status === "Won" || l.status === "Lost") return;
    const show = q ? (l.name + " " + (l.phone || "") + " " + (l.interest || "")).toLowerCase().indexOf(q) >= 0 : true;
    if (show) { l._f = facts(l); l._t = l.status === "Future" ? 4 : l._f.g; out.push(l); }
  });
  out.sort((a, b) => a._f.g - b._f.g || b._f.score - a._f.score || (b.created || 0) - (a.created || 0));
  return out;
}
function rowHtml(l) {
  const f = l._f, s = f.old ? { c: "na" } : (STM[l.status] || { c: "future" }), e = tel(l.phone), w = why(l, f);
  const k = lockOf(l.id);
  const line = k ? "🔒 " + k.by_name + L(" עובד/ת על הליד", " is working on this lead") : f.done ? L("טופל היום", "Done today") : (w || l.interest || l.source || "");
  const st = stampText(l);
  return '<div class="row' + (f.top && w && !k ? " hot" : "") + (f.done ? " done" : "") + (k ? " locked" : "") + '" data-id="' + esc(l.id) + '">' +
    '<button type="button" class="open" data-act="open"><span class="av st-' + s.c + '">' + esc((l.name || "?").trim().charAt(0).toUpperCase()) + '</span>' +
    '<span class="txt"><b>' + esc(l.name) + '</b><small>' + esc(line) + '</small>' + (st ? '<small class="stamp">' + esc(st) + '</small>' : "") + '</span></button>' +
    (e && !k ? '<a class="ring" data-act="call" href="tel:' + esc(e) + '" aria-label="' + L("להתקשר", "Call") + '">' + PHONE + '</a>' : '<span class="ring off" aria-hidden="true">' + PHONE + '</span>') + '</div>';
}
function render() {
  $("app").dir = S.lang === "he" ? "rtl" : "ltr";
  document.documentElement.lang = S.lang;
  $("lang").textContent = S.lang === "he" ? "EN" : "עב";
  $("ttl").textContent = L("MWP לידים", "MWP Leads");
  $("q").placeholder = L("חיפוש שם", "Find a name");
  $("signout").textContent = L("יציאה", "Sign out");
  $("whoName").textContent = S.me ? S.me.name : (S.user ? S.user.email : "");
  renderSignin();
  // an open lead stays open even if it leaves the list (e.g. Won / Lost); it closes on Back
  if (!S.dbReady && !S.leads.size) return;
  const r = rows(), list = $("list"), searching = !!S.q.trim();
  $("later").hidden = true; // Call later is its own section (and tab) at the end of the list
  // one long list with every section, as before; the tabs are shortcuts that jump to a section
  const names = TABS(), cnt = [0, 0, 0, 0, 0];
  r.forEach((l) => { cnt[l._t]++; });
  $("tabwrap").hidden = searching || !S.leads.size;
  if (!searching) {
    const th = ORDER.map((i) => [names[i], i]).map(([name, i]) => '<button type="button" role="tab" class="tab' + (i === 0 ? " hot" : "") + (S.tab === i ? " on" : "") + '" aria-selected="' + (S.tab === i) + '" data-tab="' + i + '">' + esc(name) + ' <span>' + cnt[i] + '</span></button>').join("");
    if ($("tabs").innerHTML !== th) { $("tabs").innerHTML = th; tabArrows(); }
  }
  if (!r.length) {
    list.innerHTML = '<div class="empty">' + (S.leads.size ? L("אין כאן אף אחד.", "Nobody here.") : (S.syncing ? L("מביאים את הלידים…", "Getting your leads…") : L("אין עדיין לידים. לוחצים על רענון.", "No leads yet. Tap refresh."))) + '</div>';
    render.h = ""; return;
  }
  let html = "", g0 = -1;
  r.sort((a, b) => ORDER.indexOf(a._t) - ORDER.indexOf(b._t));
  r.forEach((l) => {
    // with the tabs on top, a section starts with a thin line (its name is read out, not shown twice)
    if (l._t !== g0) {
      html += searching
        ? '<div class="sec' + (l._t === 0 ? " hot" : "") + '" id="sec-' + l._t + '">' + names[l._t] + ' <span>' + cnt[l._t] + '</span></div>' // search: no tabs, so the names show
        : '<div class="sec divider' + (g0 === -1 ? " first" : "") + '" id="sec-' + l._t + '" role="heading" aria-level="3"><span class="sr">' + names[l._t] + ' ' + cnt[l._t] + '</span></div>';
      g0 = l._t;
    }
    html += rowHtml(l);
  });
  if (render.h !== html) { list.innerHTML = html; render.h = html; }
}
async function openLead(id) {
  const l = S.leads.get(id); if (!l) return;
  const k = lockOf(id);
  if (k) { toast(k.by_name + L(" עובד/ת על הליד הזה עכשיו", " is working on this lead right now"), true); return; }
  const c = await claim(id);
  if (!c.ok) { toast((c.by || "") + L(" עובד/ת על הליד הזה עכשיו", " is working on this lead right now"), true); return; }
  S.open = id; S.hist = []; S.openCopy = l;
  try { localStorage.setItem("mwpl.open", id); } catch (_) {} // a refresh opens it again; only Close forgets it
  // where the list was and which section the lead was in, to come back to the same place on Close
  S.listY = window.scrollY; S.openSec = secOf(id);
  clearInterval(S.hb); S.hb = setInterval(() => { if (S.open) claim(S.open); }, 60000);
  loadHist(id);
  renderLead(id, true);
}
// draws the open lead; after a press it redraws in place (the lead stays open until Back)
function renderLead(id, fresh) {
  const l = S.leads.get(id) || S.openCopy; if (!l) return;
  const keep = fresh ? 0 : $("lead").scrollTop;
  const f = facts(l), e = tel(l.phone), w = why(l, f);
  const btns = ["New Lead", "In conversation", "Qualified", "Offer sent", "Committed", "Won", "Future", "Lost"].map((k) =>
    '<button type="button" class="big st-' + STM[k].c + (l.status === k ? " cur" : "") + '" data-st="' + k + '">' + esc(word(k)) + '</button>').join("");
  $("leadBody").innerHTML =
    '<button type="button" class="back" data-act="back" aria-label="' + L("סגירת הליד", "Close the lead") + '">✕ ' + L("סגירה", "Close") + '</button>' +
    '<h2 class="name">' + esc(l.name) + '</h2>' +
    (l.interest ? '<div class="about">' + esc(l.interest) + '</div>' : "") +
    (w ? '<div class="flag">' + esc(w) + '</div>' : "") +
    (e ? '<a class="giant" href="tel:' + esc(e) + '">' + PHONE + '<span>' + L("להתקשר", "Call") + '<small>' + esc(telShow(e)) + '</small></span></a>' : '<div class="giant off">' + L("אין מספר טלפון", "No phone number") + '</div>') +
    (e ? '<div class="two"><a class="soft" target="_blank" rel="noopener" href="https://wa.me/' + esc(e.slice(1)) + '">WhatsApp</a><button type="button" class="soft" data-act="copy" data-v="' + esc(telShow(e)) + '">' + L("העתקת מספר", "Copy number") + '</button></div>' : "") +
    (l.changedBy ? '<div class="stampbig">' + esc(stampText(l)) + '</div>' : "") +
    (l.last && l.last.t ? '<div class="lastn">' + esc(l.last.t) + '<small>' + esc(l.last.by || "") + ' · ' + esc(when(l.last.at)) + '</small></div>' : "") +
    '<textarea id="noteBox" dir="auto" placeholder="' + L("לכתוב הערה (לא חובה)", "Write a note (optional)") + '"></textarea>' +
    '<button type="button" class="dark" data-act="noteonly">' + L("לשמור רק את ההערה", "Save the note only") + '</button>' +
    '<div class="q">' + L("מה קרה?", "What happened?") + '</div>' +
    '<div class="two" id="answers"><button type="button" class="big wide st-na" data-na="1">' + L("לא ענה/תה", "No answer") + '</button>' + btns + '</div>' +
    '<div id="lostWhy" hidden><div class="q">Lost reason</div><div class="two" style="margin-top:10px">' + LOST.map((r) => '<button type="button" class="soft" data-lost="' + r[0] + '">' + r[0] + '</button>').join('') + '</div></div>' +
    '<div class="q">' + L("היסטוריה", "History") + '</div><div id="hist" class="hist"></div>' +
    '<div class="leadfoot"><a class="mon" target="_blank" rel="noopener" href="https://matanwildphotography.monday.com/boards/' + BOARD + '/pulses/' + esc(l.id) + '">' + L("פתיחה ב-monday", "Open in monday") + '</a>' +
    '<button type="button" class="trash" data-act="delete" aria-label="' + L("מחיקת הליד", "Delete this lead") + '" title="' + L("מחיקת הליד", "Delete this lead") + '">' + TRASH + '</button></div>';
  $("lead").hidden = false; $("lead").scrollTop = keep; $("home").hidden = true;
  try { const dr = localStorage.getItem("mwpl.draft." + id); if (dr && fresh) $("noteBox").value = dr; } catch (_) {}
  renderHist();
}
function closeLead() {
  const id = S.open; S.open = null; S.openCopy = null; clearInterval(S.hb); release(id);
  try { localStorage.removeItem("mwpl.open"); } catch (_) {}
  $("lead").hidden = true; $("home").hidden = !S.user;
  render();
  window.scrollTo(0, S.listY || 0); // back exactly where you were
  // if what you did moved the lead, say where it went
  const before = S.openSec, after = id ? secOf(id) : null, l = id && S.leads.get(id);
  if (l && before !== after) {
    const name = l.name || "";
    if (after === null) toast(name + L(" יצא/ה מהרשימה (", " left the list (") + (STM[l.status] ? L(STM[l.status].he, l.status) : l.status) + ")");
    else toast(name + L(" עבר/ה ל״", " moved to \u201c") + secName(after) + L("״", "\u201d"));
  }
}
// which list section a lead is in right now (null: not listed, e.g. Won, Lost, Future)
function secOf(id) {
  const l = S.leads.get(id);
  if (!l || l.status === "Won" || l.status === "Lost") return null;
  return l.status === "Future" ? 4 : facts(l).g;
}
function TABS() { return [L("להתקשר קודם", "Call first"), L("בתהליך", "In progress"), L("ישנים, עוד לא חזרנו אליהם", "Old, never called"), L("טופלו היום", "Done today"), L("לחזור אליהם אחר כך", "Call later")]; }
function secName(g) { return TABS()[g]; }
// the order of the tabs and the sections: Old, never called comes last (Jeinna, 10 Nov 2026)
const ORDER = [0, 1, 3, 4, 2];
async function loadHist(id) {
  const { data } = await sb.from("lead_updates").select("*").eq("lead_id", id).order("at", { ascending: false }).limit(40);
  if (S.open !== id) return;
  S.hist = data || []; renderHist();
}
function renderHist() {
  const el = $("hist"); if (!el) return;
  if (!S.hist.length) { el.innerHTML = '<div class="hi muted">' + L("אין עדיין היסטוריה.", "No history yet.") + '</div>'; return; }
  el.innerHTML = S.hist.map((h) => '<div class="hi' + (h.bot ? " bot" : "") + '"><div class="ht">' +
    (h.kind === "status" ? '<b>' + L("סטטוס: ", "Status: ") + esc(h.text) + '</b>' : esc(h.text)) +
    '</div><small>' + esc(h.by || "") + ' · ' + esc(when(+h.at)) + (h.source === "app" ? L(" · מהכלי", " · from this app") : L(" · ב-monday", " · in monday")) + '</small></div>').join("");
}

/* ---------- delete a lead (here and in monday), after "Are you sure?" ---------- */
const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
function askDelete() {
  const id = S.open, l = S.leads.get(id) || S.openCopy; if (!l) return;
  const d = $("delDlg");
  $("delTtl").textContent = L("למחוק את ", "Delete ") + (l.name || "") + "?";
  $("delSub").textContent = L("הליד יימחק גם ב-monday (monday שומר אותו בסל המחזור שלו 30 יום). אי אפשר לבטל את זה מכאן.", "The lead is deleted in monday too (monday keeps it in its Trash for 30 days). You can't undo this from here.");
  $("delYes").textContent = L("כן, למחוק", "Yes, delete");
  $("delNo").textContent = L("ביטול", "Cancel");
  $("delYes").disabled = false;
  d.hidden = false; $("delNo").focus();
}
$("delNo").addEventListener("click", () => { $("delDlg").hidden = true; });
$("delDlg").addEventListener("click", (ev) => { if (ev.target.id === "delDlg") $("delDlg").hidden = true; });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !$("delDlg").hidden) $("delDlg").hidden = true; });
$("delYes").addEventListener("click", async () => {
  const id = S.open, l = S.leads.get(id) || S.openCopy; if (!l) return;
  $("delYes").disabled = true;
  try {
    await fn("act", { id, delete: true });
    $("delDlg").hidden = true;
    S.leads.delete(id); S.openSec = null;
    closeLead();
    toast(L("נמחק: ", "Deleted: ") + (l.name || ""));
  } catch (e) {
    $("delYes").disabled = false;
    toast(e && e.code === "locked" ? (e.by || "") + L(" עובד/ת על הליד הזה עכשיו", " is working on this lead right now") : errText(e), true);
  }
});

/* ---------- server calls ---------- */
async function fn(name, body) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw { code: "signed_out" };
  const r = await fetch(CFG.supabaseUrl + "/functions/v1/" + name, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token, apikey: CFG.supabaseAnonKey },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw { code: j.code || j.error || "error", message: j.message || "", by: j.by || "" };
  return j;
}

/* one tap = save the note (if any) and the answer to monday; the lead stays open until Back (Matan, 10 Nov 2026) */
async function finish(label, noAnswer, reason) {
  const id = S.open, l = S.leads.get(id) || S.openCopy; if (!l) return;
  const box = $("noteBox"), text = (box ? box.value : "").trim();
  if (!label && !noAnswer && !text) { toast(L("קודם כותבים הערה", "Write a note first"), true); return; }
  const bs = $("leadBody").querySelectorAll("button"); bs.forEach((b) => { b.disabled = true; });
  try {
    const j = await fn("act", { id, label, noAnswer, reason, note: text });
    try { localStorage.removeItem("mwpl.draft." + id); } catch (_) {}
    const nl = fromRow(Object.assign(toRow(l), j.fields || {}));
    S.openCopy = nl; patch(id, nl);
    toast(label ? L("נשמר: ", "Saved: ") + word(label) : L("נשמר", "Saved"));
    renderLead(id, false);
  } catch (e) { toast(e && e.code === "locked" ? (e.by || "") + L(" עובד/ת על הליד הזה עכשיו", " is working on this lead right now") : errText(e), true); bs.forEach((b) => { b.disabled = false; }); }
}
function toRow(l) {
  return { id: l.id, name: l.name, status: l.status, phone: l.phone, email: l.email, source: l.source, interest: l.interest, about: l.about,
    lang: l.lang, fu_date: l.fuDate, created: l.created, ecb: l.ecb, mcb: l.mcb, ret: l.ret, na: l.na,
    last_t: l.last ? l.last.t : null, last_at: l.last ? l.last.at : 0, last_by: l.last ? l.last.by : "", st_at: l.stAt, touch: l.touch };
}
function patch(id, l) { l.id = id; S.leads.set(id, l); draw(); }

async function sync(manual) {
  if (S.syncing || !S.user) return;
  S.syncing = true; S.err = null; setSync(); draw();
  try {
    const j = await fn("sync", {});
    if (j.at) S.syncAt = +j.at;
    banner(null);
    if (manual) toast(L("מעודכן", "Up to date"));
  } catch (e) { S.err = e || {}; banner(errText(e), "", true); }
  S.syncing = false; setSync(); draw();
}

/* ---------- events ---------- */
$("list").addEventListener("click", (ev) => {
  const row = ev.target.closest(".row"), t = ev.target.closest("[data-act]"); if (!row || !t) return;
  if (row.classList.contains("locked")) { const k = lockOf(row.dataset.id); toast((k ? k.by_name : "") + L(" עובד/ת על הליד הזה עכשיו", " is working on this lead right now"), true); return; }
  if (t.dataset.act === "call") { const id = row.dataset.id; setTimeout(() => openLead(id), 400); return; }
  openLead(row.dataset.id);
});
$("leadBody").addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-act],[data-st],[data-na],[data-lost]"); if (!t) return;
  if (t.dataset.lost) { finish("Lost", false, t.dataset.lost); return; }
  if (t.dataset.st === "Lost") { const w = $("lostWhy"); w.hidden = false; w.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
  if (t.dataset.st) { finish(t.dataset.st, false); return; }
  if (t.dataset.na) { finish(null, true); return; }
  if (t.dataset.act === "back") { closeLead(); return; }
  if (t.dataset.act === "delete") { askDelete(); return; }
  if (t.dataset.act === "noteonly") { finish(null, false); return; }
  if (t.dataset.act === "copy") {
    const v = t.dataset.v;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast(L("המספר הועתק", "Number copied"))).catch(() => toast(v));
  }
});
$("leadBody").addEventListener("input", (ev) => {
  if (ev.target.id !== "noteBox" || !S.open) return;
  try { const v = ev.target.value; if (v.trim()) localStorage.setItem("mwpl.draft." + S.open, v); else localStorage.removeItem("mwpl.draft." + S.open); } catch (_) {}
});
$("q").addEventListener("input", function () { S.q = this.value; draw(); });
$("tabs").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-tab]"); if (!b) return;
  const i = +b.dataset.tab, h = $("sec-" + i);
  if (!h) { toast(TABS()[i] + L(": אין כאן אף אחד.", ": nobody here.")); return; }
  setTab(i);
  window.scrollTo(0, Math.max(0, h.getBoundingClientRect().top + window.scrollY - $("tabwrap").offsetHeight - 6));
  S.jumpY = window.scrollY; // keep the tapped tab until you scroll away yourself (the end of the list can't reach the top)
});
// the underline follows the section you're looking at while you scroll
function setTab(i) {
  if (S.tab === i) return;
  S.tab = i;
  document.querySelectorAll("#tabs .tab").forEach((t) => { const on = +t.dataset.tab === i; t.classList.toggle("on", on); t.setAttribute("aria-selected", on); if (on) { const bar = $("tabs"), r = t.getBoundingClientRect(), br = bar.getBoundingClientRect(); if (r.left < br.left || r.right > br.right) { bar.scrollLeft += (r.left + r.width / 2) - (br.left + br.width / 2); tabArrows(); } } });
}
window.addEventListener("scroll", () => {
  if ($("tabwrap").hidden || $("home").hidden) return;
  const y = $("tabwrap").getBoundingClientRect().bottom + 12; let cur = null;
  document.querySelectorAll("#list .sec").forEach((h) => { if (h.getBoundingClientRect().top <= y) cur = +h.id.slice(4); });
  if (cur === null) { const f = document.querySelector("#list .sec"); cur = f ? +f.id.slice(4) : 0; }
  // while you scroll, a small label under the tabs says which section you're in
  showPill(S.jumpY != null && Math.abs(window.scrollY - S.jumpY) < 40 ? S.tab : cur);
  if (S.jumpY != null) { if (Math.abs(window.scrollY - S.jumpY) < 40) return; S.jumpY = null; }
  setTab(cur);
}, { passive: true });
function showPill(i) {
  const p = $("secPill"), h = $("sec-" + i);
  if (window.scrollY < 30 || !h) { p.classList.remove("on"); return; }
  const n = h.querySelector(".sr") ? h.querySelector(".sr").textContent : "";
  p.textContent = n.replace(/ (\d+)$/, " · $1");
  p.classList.add("on");
  clearTimeout(showPill.t); showPill.t = setTimeout(() => p.classList.remove("on"), 1400);
}
// arrows show there are more tabs (swipe the bar, or tap an arrow)
function tabArrows() {
  const t = $("tabs"), rtl = getComputedStyle(t).direction === "rtl";
  const max = t.scrollWidth - t.clientWidth, pos = Math.abs(t.scrollLeft);
  $("tPrev").hidden = pos < 4; $("tNext").hidden = pos > max - 4 || max < 4;
  $("tPrev").textContent = rtl ? "›" : "‹"; $("tNext").textContent = rtl ? "‹" : "›";
}
$("tabs").addEventListener("scroll", tabArrows, { passive: true });
window.addEventListener("resize", tabArrows);
function slideTabs(dir) { const t = $("tabs"), rtl = getComputedStyle(t).direction === "rtl"; t.scrollLeft += dir * (rtl ? -1 : 1) * t.clientWidth * 0.7; tabArrows(); }
$("tNext").addEventListener("click", () => slideTabs(1));
$("tPrev").addEventListener("click", () => slideTabs(-1));
$("refresh").addEventListener("click", () => sync(true));
$("lang").addEventListener("click", () => {
  S.lang = S.lang === "he" ? "en" : "he";
  try { localStorage.setItem("mwpl.lang", S.lang); } catch (_) {}
  render(); setSync();
});
$("banner").addEventListener("click", (ev) => { if (ev.target.id === "retry") sync(true); });
$("signout").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
let rq = 0;
function draw() { cancelAnimationFrame(rq); rq = requestAnimationFrame(render); }
function setSync() {
  const d = $("dot"), t = $("sync");
  d.className = "live" + (S.syncing ? " busy" : S.err ? " err" : S.syncAt || S.metaAt ? " on" : "");
  t.textContent = S.syncing ? L("מסתנכרן עם monday…", "Syncing with monday…") : S.err ? L("אין חיבור ל-monday", "Not connected to monday") : Math.max(S.syncAt, S.metaAt) ? L("מסונכרן עם monday · ", "In sync with monday · ") + ago(Math.max(S.syncAt, S.metaAt)) : L("מתחבר…", "Connecting…");
  $("refresh").classList.toggle("spin", S.syncing);
}
function banner(msg, kind, retry) {
  const b = $("banner"); if (!msg) { b.hidden = true; return; }
  b.className = "banner" + (kind ? " " + kind : "");
  b.innerHTML = esc(msg) + (retry ? '<button type="button" id="retry">' + L("לנסות שוב", "Try again") + '</button>' : "");
  b.hidden = false;
}
function errText(e) {
  const c = e && e.code;
  if (c === "no_token") return L("החיבור ל-monday עוד לא הוגדר (חסר מפתח API). הרשימה השמורה מוצגת.", "The monday connection isn't set up yet (no API token). Showing the saved list.");
  if (c === "needs_reauth") return L("monday דחה את מפתח ה-API. צריך מפתח חדש.", "monday refused the API token. A new token is needed.");
  if (c === "not_team" || c === "signed_out") return L("צריך להתחבר מחדש.", "Please sign in again.");
  if (c === "note_required") return L("קודם כותבים הערה", "Write a note first");
  if (c === "tool_error") return L("monday החזיר שגיאה: ", "monday returned an error: ") + ((e && e.message) || "");
  return L("monday לא עונה כרגע. מוצגת הרשימה האחרונה שנשמרה.", "monday isn't answering right now. Showing the last saved list.");
}

/* ---------- sign-in: email + password (accounts are made by Jeinna in Supabase; no emails are sent) ---------- */
function renderSignin() {
  $("siTtl").textContent = L("MWP לידים", "MWP Leads");
  $("siSub").textContent = L("נכנסים עם המייל של הצוות והסיסמה.", "Sign in with your team email and password.");
  $("siEmail").placeholder = L("המייל שלך", "Your email");
  $("siPass").placeholder = L("סיסמה", "Password");
  $("siBtn").textContent = L("כניסה", "Sign in");
  $("pwTtl").textContent = L("בוחרים סיסמה משלך", "Choose your own password");
  $("pwSub").textContent = L("נכנסת עם הסיסמה הזמנית. בוחרים סיסמה חדשה (לפחות 8 תווים).", "You signed in with the starting password. Choose a new one (at least 8 characters).");
  $("pw1").placeholder = L("סיסמה חדשה", "New password");
  $("pw2").placeholder = L("שוב, לבדיקה", "Again, to check");
  $("pwSave").textContent = L("שמירת הסיסמה", "Save password");
  $("pwLater").textContent = L("אחר כך", "Later");
  $("chpw").textContent = L("שינוי סיסמה", "Change password");
}
$("siForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = $("siEmail").value.trim().toLowerCase(), m = $("siMsg");
  $("siBtn").disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password: $("siPass").value });
  $("siBtn").disabled = false;
  if (error) {
    m.hidden = false; m.className = "msg bad";
    m.textContent = /invalid login credentials/i.test(error.message) ? L("המייל או הסיסמה לא נכונים.", "Wrong email or password.")
      : /rate limit|too many/i.test(error.message) ? L("יותר מדי ניסיונות. מנסים שוב בעוד כמה דקות.", "Too many tries. Try again in a few minutes.")
      : error.message;
    return;
  }
  $("siPass").value = ""; m.hidden = true;
});
// the starting password must be replaced: until a person chooses their own, the box shows after every sign-in
function needsPw(user) { return !!user && !(user.user_metadata && user.user_metadata.own_password); }
function showPw(force) {
  const box = $("pwBox");
  box.hidden = !(force || needsPw(S.user));
  $("pwLater").hidden = !!force ? false : false;
  if (!box.hidden) { $("pwMsg").hidden = true; $("pw1").value = ""; $("pw2").value = ""; }
}
$("chpw").addEventListener("click", () => { showPw(true); window.scrollTo(0, 0); $("pw1").focus(); });
$("pwLater").addEventListener("click", () => { $("pwBox").hidden = true; });
$("pwBox").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const a = $("pw1").value, b = $("pw2").value, m = $("pwMsg");
  m.hidden = false; m.className = "msg bad";
  if (a.length < 8) { m.textContent = L("לפחות 8 תווים.", "At least 8 characters."); return; }
  if (a !== b) { m.textContent = L("שתי הסיסמאות לא זהות.", "The two passwords don't match."); return; }
  $("pwSave").disabled = true;
  const { data, error } = await sb.auth.updateUser({ password: a, data: { own_password: true } });
  $("pwSave").disabled = false;
  if (error) { m.textContent = /same|different from the old/i.test(error.message) ? L("בוחרים סיסמה שונה מהקודמת.", "Choose a password different from the old one.") : error.message; return; }
  if (data && data.user) S.user = data.user;
  $("pwBox").hidden = true; toast(L("הסיסמה נשמרה", "Password saved"));
});

/* ---------- boot ---------- */
async function loadAll() {
  const { data, error } = await sb.from("leads").select("*").limit(1000);
  if (error) { banner(L("הרשימה השמורה לא נטענה.", "The saved list didn't load."), "", true); S.dbReady = true; draw(); return; }
  const m = new Map(); (data || []).forEach((r) => m.set(r.id, fromRow(r)));
  S.leads = m; S.dbReady = true; draw();
}
async function loadLocks() {
  const { data } = await sb.from("lead_locks").select("*");
  S.locks = new Map((data || []).map((k) => [k.lead_id, k])); draw();
}
async function loadMeta() {
  const { data } = await sb.from("sync_meta").select("at").eq("id", 1).maybeSingle();
  S.metaAt = (data && +data.at) || 0; setSync();
}
async function start(user) {
  S.user = user;
  $("signin").hidden = true; $("home").hidden = false;
  showPw(false);
  const { data: me } = await sb.from("team").select("name,email").eq("email", (user.email || "").toLowerCase()).maybeSingle();
  S.me = me || null;
  if (!me) { S.dbReady = true; banner(L("המייל הזה לא ברשימת הצוות.", "This email isn't on the team list."), ""); render(); return; }
  await Promise.all([loadAll(), loadMeta(), loadLocks()]);
  // a lead that was open before a refresh opens again
  let was = null; try { was = localStorage.getItem("mwpl.open"); } catch (_) {}
  if (was && S.leads.has(was)) openLead(was); else if (was) { try { localStorage.removeItem("mwpl.open"); } catch (_) {} }
  sb.channel("leads-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (p) => {
      if (p.eventType === "DELETE") { S.leads.delete(p.old.id); } else if (p.new) { S.leads.set(p.new.id, fromRow(p.new)); }
      draw();
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sync_meta" }, (p) => { S.metaAt = +p.new.at || 0; setSync(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "lead_locks" }, (p) => {
      if (p.eventType === "DELETE") S.locks.delete(p.old.lead_id); else if (p.new) S.locks.set(p.new.lead_id, p.new);
      draw();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_updates" }, (p) => {
      if (p.new && p.new.lead_id === S.open && !S.hist.some((h) => h.id === p.new.id)) {
        S.hist.unshift(p.new); S.hist.sort((a, b) => b.at - a.at); renderHist();
      }
    })
    .subscribe((st) => { if (st === "SUBSCRIBED") { loadAll(); loadLocks(); } });
  setInterval(draw, 30000); // expired locks turn back to normal
  setTimeout(() => sync(false), 1200);
  setInterval(() => {
    if (document.hidden) return;
    if (Date.now() - Math.max(S.syncAt, S.metaAt) > 55000 && !S.open) sync(false); else setSync();
  }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - Math.max(S.syncAt, S.metaAt) > 55000) sync(false); });
}

render(); setSync();
const { data: { session } } = await sb.auth.getSession();
if (session && session.user) start(session.user);
else { $("signin").hidden = false; $("home").hidden = true; }
sb.auth.onAuthStateChange((ev, s) => { if (ev === "SIGNED_IN" && s && !S.user) start(s.user); });
