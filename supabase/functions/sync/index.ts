// Sync monday's Leads board into the leads table: the same reading and signal rules as
// Matan's page. Called every minute by pg_cron (x-cron-secret) and by the page's Refresh
// button / auto-refresh (a signed-in team member).
import { admin, cors, json, monday, MondayError, teamMember } from "../_shared/common.ts";
import { BOARD, C, SKIP_GROUPS, differs, fromItem, merge, signals } from "../_shared/signals.js";

const COLS = [C.status, C.phone, C.email, C.source, C.interest, C.about, C.lang, C.fuDate];
const ITEM_FIELDS = `id name created_at group { id } column_values(ids: ${JSON.stringify(COLS)}) { id text }`;

function iso(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();

  // spaces and line breaks are ignored on both sides (a pasted secret often ends with a line break)
  const cronSecret = (Deno.env.get("CRON_SECRET") || "").replace(/\s+/g, "");
  const fromCron = !!cronSecret && (req.headers.get("x-cron-secret") || "").replace(/\s+/g, "") === cronSecret;
  if (!fromCron && !(await teamMember(req, db))) return json({ error: "not_team" }, 403);

  // a manual refresh skips a sync that finished under 10 seconds ago
  const { data: meta } = await db.from("sync_meta").select("*").eq("id", 1).single();
  if (!fromCron && meta && Date.now() - Number(meta.at) < 10000) return json({ ok: true, at: meta.at, skipped: "fresh" });

  const { data: lease } = await db.rpc("take_sync_lease", { seconds: 90 });
  if (!lease) return json({ ok: true, skipped: "busy" });

  const started = Date.now();
  try {
    // 1. items, 500 a page, up to 8 pages (as the original)
    const items: any[] = [];
    let complete = false;
    let d = await monday(`query { boards(ids: [${BOARD}]) { items_page(limit: 500) { cursor items { ${ITEM_FIELDS} } } } }`);
    let page = d?.boards?.[0]?.items_page;
    let guard = 0;
    while (page) {
      items.push(...(page.items || []));
      if (!page.cursor) { complete = true; break; }
      if (++guard >= 8) break;
      d = await monday(`query ($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { ${ITEM_FIELDS} } } }`, { c: page.cursor });
      page = d?.next_items_page;
    }
    const kept = items.filter((it) => !SKIP_GROUPS.includes(it.group?.id));

    // 2. updates: 30 days on the first pass, then 2 days; 100 a page, up to 8 pages
    let ups: any[] = [];
    try {
      const days = meta?.full_done ? 2 : 30;
      const from = iso(new Date(Date.now() - days * 864e5));
      for (let pg = 1; pg <= 8; pg++) {
        const u = await monday(
          `query ($p: Int!) { boards(ids: [${BOARD}]) { updates(limit: 100, page: $p) { id text_body created_at item_id creator { id name } } } }`,
          { p: pg },
        );
        const arr = u?.boards?.[0]?.updates || [];
        const inRange = arr.filter((x: any) => String(x.created_at || "").slice(0, 10) >= from);
        ups = ups.concat(inRange);
        if (arr.length < 100 || inRange.length < arr.length) break;
      }
      await db.from("sync_meta").update({ full_done: true }).eq("id", 1);
    } catch (e) {
      if (e instanceof MondayError && e.code !== "tool_error") throw e;
    }
    const sig = signals(ups);

    // 3. merge with what we have; leave alone anything changed from the page in the last 30 s
    const { data: have } = await db.from("leads").select("*");
    const prevById = new Map((have || []).map((r: any) => [r.id, r]));
    const seen = new Set<string>();
    const upserts: any[] = [];
    for (const it of kept) {
      const row = fromItem(it);
      if (!row.id) continue;
      seen.add(row.id);
      const prev: any = prevById.get(row.id);
      if (prev && Number(prev.touch || 0) > started - 30000) continue;
      merge(row, prev, sig[row.id]);
      if (!prev || differs(prev, row)) upserts.push({ ...row, synced_at: new Date().toISOString() });
    }
    for (let i = 0; i < upserts.length; i += 200) {
      const { error } = await db.from("leads").upsert(upserts.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }

    // 4. leads no longer on the board (or moved to Won / Lost / Newsletter) leave the list
    let removed = 0;
    if (complete && kept.length) {
      const gone = (have || []).filter((r: any) => !seen.has(r.id) && Number(r.touch || 0) < started - 30000).map((r: any) => r.id);
      if (gone.length) { await db.from("leads").delete().in("id", gone); removed = gone.length; }
    }

    const at = Date.now();
    await db.from("sync_meta").update({ at, running_until: null, last_error: null }).eq("id", 1);
    return json({ ok: true, at, items: kept.length, changed: upserts.length, removed, updates: ups.length });
  } catch (e) {
    const code = e instanceof MondayError ? e.code : "error";
    await db.from("sync_meta").update({ running_until: null, last_error: code + ": " + String((e as Error).message).slice(0, 300), last_error_at: new Date().toISOString() }).eq("id", 1);
    return json({ ok: false, code, message: String((e as Error).message) }, code === "no_token" ? 503 : 502);
  }
});
