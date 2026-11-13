// One press on the lead screen: save the note (if any) and the answer to monday, as the
// original page's finish(). The note is signed "— Name · date time" and monday's "Last change in
// MWP Leads" column says who did what and when, so monday shows who really did it.
import { admin, cors, json, monday, MondayError, teamMember } from "../_shared/common.ts";
import { BOARD, C, LOST, STATUSES, STATUS_GROUP, historyText, israelToUtc, noteHtml, utcToIsrael } from "../_shared/signals.js";

// monday's "Last change in MWP Leads" column: the lead's whole history, newest first (who, when, what).
// The sync keeps it up to date too; a failure here never undoes the change itself.
async function stampMonday(db: any, id: string) {
  try {
    const { data: rows } = await db.from("lead_updates").select("kind,text,by,at,bot").eq("lead_id", id);
    const v = historyText(rows || []);
    await monday(`mutation ($b: ID!, $i: ID!, $c: String!, $v: String!) { change_simple_column_value(board_id: $b, item_id: $i, column_id: $c, value: $v) { id } }`, { b: String(BOARD), i: id, c: C.who, v });
    await db.from("lead_hist").upsert({ lead_id: id, text: v, at: Date.now() });
  } catch (e) { console.log("history to monday failed", id, String((e as Error).message)); }
}

// Work the person doesn't need to wait for (monday's history column, the group move) runs after the
// answer is sent, so a status or a note saves in about one monday call (Jeinna, 13 Nov 2026).
function later(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(p); else p.catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();
  const me = await teamMember(req, db);
  if (!me) return json({ error: "not_team" }, 403);

  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "");
  const label: string | null = b.label ? String(b.label) : null;
  const noAnswer = !!b.noAnswer;
  const reason: string | null = b.reason ? String(b.reason) : null;
  let text = String(b.note || "").trim().slice(0, 5000);

  if (!/^\d+$/.test(id)) return json({ error: "bad_id" }, 400);
  if (label && !STATUSES.includes(label)) return json({ error: "bad_status" }, 400);
  if (reason && (label !== "Lost" || !LOST.includes(reason))) return json({ error: "bad_reason" }, 400);

  const [{ data: l }, { data: lock }] = await Promise.all([
    db.from("leads").select("*").eq("id", id).maybeSingle(),
    db.from("lead_locks").select("by_email,by_name,expires").eq("lead_id", id).maybeSingle(),
  ]);
  if (!l) return json({ error: "not_found" }, 404);

  // one person on a lead at a time
  if (lock && lock.by_email !== me.email && new Date(lock.expires).getTime() > Date.now()) {
    return json({ ok: false, code: "locked", by: lock.by_name }, 409);
  }

  // a tap on Call, WhatsApp or Copy number (Jeinna with Matan's OK, 11 Nov 2026): recorded in MWP Leads
  // only, for the report. Nothing goes to monday and the lead itself isn't changed.
  if (b.tap) {
    const kind = ["call", "whatsapp", "copy"].includes(String(b.tap)) ? String(b.tap) : "call";
    const now = Date.now();
    const { data: act } = await db.from("lead_actions").insert({ lead_id: id, by_email: me.email, by_name: me.name, kind: "tap", status_from: l.status, note: kind }).select("id").single();
    await db.from("lead_updates").upsert({ id: "tap-" + (act?.id || now), lead_id: id, kind: "tap", text: kind, by: me.name, at: now, source: "app" });
    return json({ ok: true });
  }

  // follow-up call: Follow Up Date (date + time, Israel time in, UTC to monday) and Follow Up = Follow-Up.
  // No monday update is posted (so nobody gets an email); the call shows in MWP Leads' history.
  if (b.schedule && typeof b.schedule === "object") {
    const date = String(b.schedule.date || ""), time = String(b.schedule.time || ""), note = String(b.schedule.note || "").trim().slice(0, 500);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return json({ ok: false, code: "bad_time" }, 400);
    const at = israelToUtc(date, time);
    if (!at || at < Date.now() - 864e5 * 2 || at > Date.now() + 864e5 * 400) return json({ ok: false, code: "bad_time" }, 400);
    const u = new Date(at).toISOString();
    const cols = { [C.fuDate]: { date: u.slice(0, 10), time: u.slice(11, 19) }, [C.fu]: { label: "Follow-Up" } };
    try {
      await monday(`mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }`, { b: String(BOARD), i: id, v: JSON.stringify(cols) });
    } catch (e) {
      const code = e instanceof MondayError ? e.code : "error";
      return json({ ok: false, code, message: String((e as Error).message) }, code === "no_token" ? 503 : 502);
    }
    const now = Date.now(), loc = utcToIsrael(at);
    const what = "Call → " + loc.date.split("-").reverse().join(".") + " " + loc.time;
    const fields = { fu_at: at, fu_has_time: true, fu_date: loc.date, fu_state: "Follow-Up", touch: now, changed_by: me.name, changed_at: now, changed_what: what };
    await db.from("leads").update(fields).eq("id", id);
    const { data: act } = await db.from("lead_actions").insert({ lead_id: id, by_email: me.email, by_name: me.name, kind: "call", status_from: l.status, note: what + (note ? " · " + note : "") }).select("id").single();
    await db.from("lead_updates").upsert({ id: "call-" + (act?.id || now), lead_id: id, kind: "call", text: loc.date.split("-").reverse().join(".") + " " + loc.time + (note ? " · " + note : ""), by: me.name, at: now, source: "app" });
    later(stampMonday(db, id));
    return json({ ok: true, fields });
  }
  if (b.callDone === true) {
    try {
      await monday(`mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }`, { b: String(BOARD), i: id, v: JSON.stringify({ [C.fu]: { label: "Done" } }) });
    } catch (e) {
      const code = e instanceof MondayError ? e.code : "error";
      return json({ ok: false, code, message: String((e as Error).message) }, code === "no_token" ? 503 : 502);
    }
    const now = Date.now();
    const fields = { fu_state: "Done", touch: now, changed_by: me.name, changed_at: now, changed_what: "Call done" };
    await db.from("leads").update(fields).eq("id", id);
    const { data: act } = await db.from("lead_actions").insert({ lead_id: id, by_email: me.email, by_name: me.name, kind: "call_done", status_from: l.status, note: "Call done" }).select("id").single();
    await db.from("lead_updates").upsert({ id: "calldone-" + (act?.id || now), lead_id: id, kind: "call", text: "done", by: me.name, at: now, source: "app" });
    later(stampMonday(db, id));
    return json({ ok: true, fields });
  }

  // delete: the lead goes from monday (to monday's Trash, where it can be restored for 30 days) and from this list
  if (b.delete === true) {
    if (!me.can_delete) return json({ ok: false, code: "no_delete" }, 403); // only Matan and Jeinna
    try {
      await monday(`mutation ($i: ID!) { delete_item(item_id: $i) { id } }`, { i: id });
    } catch (e) {
      const code = e instanceof MondayError ? e.code : "error";
      const message = String((e as Error).message);
      await db.from("lead_actions").insert({ lead_id: id, by_email: me.email, by_name: me.name, kind: "delete", status_from: l.status, note: "Deleted: " + l.name, ok: false, error: code + ": " + message.slice(0, 300) });
      return json({ ok: false, code, message }, code === "no_token" ? 503 : 502);
    }
    await db.from("lead_actions").insert({ lead_id: id, by_email: me.email, by_name: me.name, kind: "delete", status_from: l.status, note: "Deleted: " + l.name + (l.phone ? " · " + l.phone : "") });
    await db.from("lead_locks").delete().eq("lead_id", id);
    await db.from("leads").delete().eq("id", id);
    return json({ ok: true, deleted: true });
  }

  if (noAnswer) text = "No answer" + (text ? "\n" + text : "");
  if (!label && !text) return json({ error: "note_required" }, 400);

  const kind = label ? "status" : noAnswer ? "no_answer" : "note";
  const fields: Record<string, unknown> = {};
  let updateId: string | null = null;
  const t0 = Date.now();
  const moving = !!label && label !== l.status;
  try {
    // the note and the status go to monday at the same time
    const noteP = text
      ? monday(`mutation ($i: ID!, $b: String!) { create_update(item_id: $i, body: $b) { id } }`, { i: id, b: noteHtml(text, me.name, t0) })
      : Promise.resolve(null);
    let statusP: Promise<unknown> = Promise.resolve(null);
    if (moving) {
      const cols: Record<string, unknown> = { [C.status]: { label } };
      if (reason) cols[C.lost] = { label: reason };
      statusP = monday(`mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }`, { b: String(BOARD), i: id, v: JSON.stringify(cols) });
    }
    const [noteR, statusR] = await Promise.allSettled([noteP, statusP]);
    if (noteR.status === "fulfilled") {
      const d: any = noteR.value;
      updateId = d?.create_update?.id ? String(d.create_update.id) : null;
      if (text) { fields.last_t = text.slice(0, 400); fields.last_at = Date.now(); fields.last_by = me.name; }
    }
    if (moving && statusR.status === "fulfilled") fields.status = label;
    // a half-done save (the note went but not the status, or the other way) still records the part that went
    const failed = noteR.status === "rejected" ? noteR.reason : statusR.status === "rejected" ? statusR.reason : null;
    if (failed) {
      if (Object.keys(fields).length) await db.from("leads").update(fields).eq("id", id);
      if (updateId) await db.from("note_authors").upsert({ update_id: updateId, by: me.name, why: "MWP Leads" });
      throw failed;
    }
    if (noAnswer) fields.na = (l.na || 0) + 1;
    if (moving) {
      // and to the group of the same name, after the answer (a failed move never undoes the status change)
      const g = STATUS_GROUP[label!];
      if (g) later(monday(`mutation ($i: ID!, $g: String!) { move_item_to_group(item_id: $i, group_id: $g) { id } }`, { i: id, g })
        .catch((e) => console.log("group move failed", id, label, String((e as Error).message))));
    }
    if (label) fields.st_at = Date.now();
    const now = Date.now();
    fields.touch = now;
    // the stamp: who, when, what
    fields.changed_by = me.name;
    fields.changed_at = now;
    fields.changed_what = moving ? "Status → " + label + (reason ? " (" + reason + ")" : "") : noAnswer ? "No answer" : "Note";
    // the note is signed in monday ("— Name · date time"); the real author is also kept here,
    // so the sync, the stamp and the history always show who did it.
    const [, { data: act }] = await Promise.all([
      db.from("leads").update(fields).eq("id", id),
      db.from("lead_actions").insert({ lead_id: id, by_email: me.email, by_name: me.name, kind, status_from: l.status, status_to: label, lost_reason: reason, note: text || null, monday_update_id: updateId }).select("id").single(),
      updateId ? db.from("note_authors").upsert({ update_id: updateId, by: me.name, why: "MWP Leads" }) : Promise.resolve(null),
    ]);
    // history rows, so the lead screen shows them at once (the sync keeps these, not monday's copies)
    const rows: any[] = [];
    if (text && updateId) rows.push({ id: updateId, lead_id: id, kind: "note", text, by: me.name, at: now, source: "app" });
    if (moving) rows.push({ id: "app-" + (act?.id || now), lead_id: id, kind: "status", text: (l.status || "—") + " → " + label + (reason ? " (" + reason + ")" : ""), by: me.name, at: now, source: "app" });
    if (rows.length) await db.from("lead_updates").upsert(rows);
    later(stampMonday(db, id));
    return json({ ok: true, fields });
  } catch (e) {
    const code = e instanceof MondayError ? e.code : "error";
    const message = String((e as Error).message);
    await db.from("lead_actions").insert({ lead_id: id, by_email: me.email, by_name: me.name, kind, status_from: l.status, status_to: label, lost_reason: reason, note: text || null, monday_update_id: updateId, ok: false, error: code + ": " + message.slice(0, 300) });
    return json({ ok: false, code, message }, code === "no_token" ? 503 : 502);
  }
});
