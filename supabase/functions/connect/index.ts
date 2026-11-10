// Connect (or disconnect) the signed-in person's own monday account.
// The token is checked with monday first and never sent back to the page.
import { admin, cors, json, monday, MondayError, teamMember } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();
  const me = await teamMember(req, db);
  if (!me) return json({ error: "not_team" }, 403);
  const b = await req.json().catch(() => ({}));

  if (b.disconnect) {
    await db.from("monday_tokens").delete().eq("email", me.email);
    return json({ ok: true, connected: false });
  }

  const token = String(b.token || "").replace(/\s+/g, "");
  if (token.length < 20 || token.length > 2000) return json({ ok: false, code: "bad_token" }, 400);
  try {
    const d = await monday(`query { me { id name email } }`, {}, token);
    const u = d?.me;
    if (!u?.id) return json({ ok: false, code: "bad_token" }, 400);
    await db.from("monday_tokens").upsert({ email: me.email, token, monday_id: String(u.id), monday_name: String(u.name || ""), added_at: new Date().toISOString() });
    return json({ ok: true, connected: true, name: u.name || "" });
  } catch (e) {
    const code = e instanceof MondayError && e.code === "needs_reauth" ? "bad_token" : "error";
    return json({ ok: false, code, message: String((e as Error).message) }, 400);
  }
});
