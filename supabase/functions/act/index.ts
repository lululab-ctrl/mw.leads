// One press on the lead screen: save the note (if any) and the answer to monday, as the
// original page's finish(). The note is signed "— Name" so monday shows who really did it.
import { admin, cors, json, monday, MondayError, teamMember } from "../_shared/common.ts";
import { BOARD, C, LOST, STATUSES, noteHtml } from "../_shared/signals.js";

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

  const { data: l } = await db.from("leads").select("*").eq("id", id).maybeSingle();
  if (!l) return json({ error: "not_found" }, 404);

  if (noAnswer) text = "No answer" + (text ? "\n" + text : "");
  if (!label && !text) return json({ error: "note_required" }, 400);

  const kind = label ? "status" : noAnswer ? "no_answer" : "note";
  const fields: Record<string, unknown> = {};
  let updateId: string | null = null;
  try {
    if (text) {
      const d = await monday(`mutation ($i: ID!, $b: String!) { create_update(item_id: $i, body: $b) { id } }`, { i: id, b: noteHtml(text, me.name) });
      updateId = d?.create_update?.id ? String(d.create_update.id) : null;
      fields.last_t = text.slice(0, 400); fields.last_at = Date.now(); fields.last_by = me.name;
    }
    if (noAnswer) fields.na = (l.na || 0) + 1;
    if (label && label !== l.status) {
      const cols: Record<string, unknown> = { [C.status]: { label } };
      if (reason) cols[C.lost] = { label: reason };
      await monday(`mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }`, { b: String(BOARD), i: id, v: JSON.stringify(cols) });
      fields.status = label;
    }
    if (label) fields.st_at = Date.now();
    fields.touch = Date.now();
    await db.from("leads").update(fields).eq("id", id);
    await db.from("lead_actions").insert({ lead_id: id, by_email: me.email, by_name: me.name, kind, status_from: l.status, status_to: label, lost_reason: reason, note: text || null, monday_update_id: updateId });
    return json({ ok: true, fields });
  } catch (e) {
    const code = e instanceof MondayError ? e.code : "error";
    const message = String((e as Error).message);
    await db.from("lead_actions").insert({ lead_id: id, by_email: me.email, by_name: me.name, kind, status_from: l.status, status_to: label, lost_reason: reason, note: text || null, monday_update_id: updateId, ok: false, error: code + ": " + message.slice(0, 300) });
    return json({ ok: false, code, message }, code === "no_token" ? 503 : 502);
  }
});
