// Sync monday's Leads board into the leads table: the same reading and signal rules as
// Matan's page. Called every minute by pg_cron (x-cron-secret) and by the page's Refresh
// button / auto-refresh (a signed-in team member).
import { admin, cors, json, monday, MondayError, teamMember } from "../_shared/common.ts";
import { BOARD, C, SKIP_GROUPS, differs, fromItem, historyRow, historyText, merge, signals, stamp, statusLog, teamName } from "../_shared/signals.js";

// only the columns MWP Leads uses (Follow Up Date's value carries its time)
const BASIC = [C.status, C.phone, C.email, C.source, C.interest, C.about, C.lang, C.fuDate, C.fu];
const BASIC_FIELDS = `id name created_at group { id } column_values(ids: ${JSON.stringify(BASIC)}) { id text value }`;

function iso(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();

  // the every-minute job: its secret must match the Vault copy it was sent with
  const sent = req.headers.get("x-cron-secret") || "";
  let fromCron = false;
  if (sent) {
    const { data, error } = await db.rpc("cron_secret_ok", { s: sent });
    fromCron = data === true;
    if (!fromCron) console.log("cron secret refused", error ? error.message : "no match");
  }
  if (!fromCron && !(await teamMember(req, db))) return json({ error: "not_team" }, 403);

  // a manual refresh skips a sync that finished under 10 seconds ago
  const { data: meta } = await db.from("sync_meta").select("*").eq("id", 1).single();
  if (!fromCron && meta && Date.now() - Number(meta.at) < 10000) return json({ ok: true, at: meta.at, skipped: "fresh" });

  const { data: lease } = await db.rpc("take_sync_lease", { seconds: 90 });
  if (!lease) return json({ ok: true, skipped: "busy" });

  const started = Date.now();
  try {
    // 1. items, 500 a page, up to 8 pages (as the original)
    const readItems = async (FIELDS: string) => {
      const out: any[] = []; let done = false;
      let d = await monday(`query { boards(ids: [${BOARD}]) { items_page(limit: 500) { cursor items { ${FIELDS} } } } }`);
      let page = d?.boards?.[0]?.items_page; let guard = 0;
      while (page) {
        out.push(...(page.items || []));
        if (!page.cursor) { done = true; break; }
        if (++guard >= 8) break;
        d = await monday(`query ($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { ${FIELDS} } } }`, { c: page.cursor });
        page = d?.next_items_page;
      }
      return { out, done };
    };
    const r0 = await readItems(BASIC_FIELDS); const items = r0.out, complete = r0.done;
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
    // real authors of updates posted under someone else's monday account
    const { data: na } = await db.from("note_authors").select("update_id,by");
    const authors: Record<string, string> = {};
    for (const r of na || []) authors[r.update_id] = r.by;
    const sig = signals(ups, authors);

    // 2b. status changes made in monday, with who made them (monday's activity log)
    const logsByLead: Record<string, any[]> = {};
    const statusRows: any[] = [];
    try {
      const days = meta?.full_done ? 2 : 30;
      const fromIso = new Date(Date.now() - days * 864e5).toISOString();
      const a = await monday(
        `query ($f: ISO8601DateTime!) { boards(ids: [${BOARD}]) { activity_logs(from: $f, column_ids: ["${C.status}"], limit: 500) { id event data user_id created_at } } }`,
        { f: fromIso },
      );
      const logs = (a?.boards?.[0]?.activity_logs || []).map(statusLog).filter(Boolean);
      // automations have negative user ids: they aren't people, so they're named "monday automation"
      const ids = [...new Set(logs.map((l: any) => l.user_id).filter((x: string) => Number(x) > 0))];
      const names: Record<string, string> = {};
      if (ids.length) {
        const u = await monday(`query ($i: [ID!]) { users(ids: $i) { id name } }`, { i: ids });
        for (const x of u?.users || []) names[String(x.id)] = String(x.name || "");
      }
      // a status change this app made shows in monday under the token's account: keep the app's row instead
      const { data: appSt } = await db.from("lead_updates").select("lead_id,text,at").eq("source", "app").eq("kind", "status").gte("at", Date.now() - days * 864e5);
      for (const l of logs as any[]) {
        const dup = (appSt || []).some((r: any) => r.lead_id === l.lead_id && Math.abs(Number(r.at) - l.at) < 120000 && String(r.text).includes("→ " + l.to));
        if (dup) continue;
        l.by = authors["st-" + l.lead_id + "-" + l.at] || (Number(l.user_id) > 0 ? teamName(names[l.user_id] || "monday") : "monday automation");
        (logsByLead[l.lead_id] ||= []).push(l);
        statusRows.push({ id: "st-" + l.lead_id + "-" + l.at, lead_id: l.lead_id, kind: "status", text: (l.from || "—") + " → " + l.to, by: l.by, at: l.at, source: "monday", bot: false });
      }
    } catch (e) {
      if (e instanceof MondayError && e.code !== "tool_error") throw e;
      console.log("activity log skipped", String((e as Error).message));
    }

    // 2c. history: every monday note and status change, kept for the lead screen
    const hist = ups.map((u: any) => historyRow(u, authors)).filter((r: any) => r.lead_id && r.text);
    for (let i = 0; i < hist.length; i += 300) await db.from("lead_updates").upsert(hist.slice(i, i + 300), { ignoreDuplicates: true });
    for (let i = 0; i < statusRows.length; i += 300) await db.from("lead_updates").upsert(statusRows.slice(i, i + 300), { ignoreDuplicates: true });

    // 3. merge with what we have; leave alone anything changed from the page in the last 30 s
    const { data: have } = await db.from("leads").select("*");
    const prevById = new Map((have || []).map((r: any) => [r.id, r]));
    const seen = new Set<string>();
    const upserts: any[] = [];
    for (const it of kept) {
      const row: any = fromItem(it);
      if (!row.id) continue;
      seen.add(row.id);
      const prev: any = prevById.get(row.id);
      if (prev && Number(prev.touch || 0) > started - 30000) continue;
      merge(row, prev, sig[row.id]);
      Object.assign(row, stamp(prev, sig[row.id], logsByLead[row.id]));
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

    // 5. the lead's history to monday's "Last change in MWP Leads" column, for every lead whose history
    // changed since it was last written (25 a minute, so a first fill spreads over a few minutes)
    let histSent = 0;
    try {
      const all: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await db.from("lead_updates").select("lead_id,kind,text,by,at,bot").range(from, from + 999);
        all.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const byLead: Record<string, any[]> = {};
      for (const r of all) (byLead[r.lead_id] ||= []).push(r);
      const { data: sentRows } = await db.from("lead_hist").select("lead_id,text");
      const sent = new Map((sentRows || []).map((r: any) => [r.lead_id, r.text]));
      const todo: { id: string; v: string }[] = [];
      // every lead on the board, Won and Lost included, so the last step is always there
      for (const id of new Set(items.map((it: any) => String(it.id)))) {
        const v = historyText(byLead[id] || []);
        if (sent.get(id) !== v) todo.push({ id, v });
        if (todo.length >= 25) break;
      }
      if (todo.length) {
        const q = todo.map((t, i) => `u${i}: change_simple_column_value(board_id: ${BOARD}, item_id: ${t.id}, column_id: "${C.who}", value: $v${i}) { id }`).join("\n");
        const vars: Record<string, string> = {};
        todo.forEach((t, i) => { vars["v" + i] = t.v; });
        let done = todo;
        try {
          await monday(`mutation (${todo.map((_, i) => "$v" + i + ": String!").join(", ")}) {\n${q}\n}`, vars);
        } catch (_) {
          // one bad item (deleted, archived…) must not hold up the rest: one at a time, and a lead that
          // still fails is marked so it isn't retried every minute until its history changes again
          done = [];
          for (const t of todo) {
            try {
              await monday(`mutation ($v: String!) { change_simple_column_value(board_id: ${BOARD}, item_id: ${t.id}, column_id: "${C.who}", value: $v) { id } }`, { v: t.v });
              done.push(t);
            } catch (e) { console.log("history to monday failed", t.id, String((e as Error).message)); done.push({ id: t.id, v: t.v }); }
          }
        }
        await db.from("lead_hist").upsert(done.map((t) => ({ lead_id: t.id, text: t.v, at: Date.now() })));
        histSent = done.length;
      }
    } catch (e) { console.log("history to monday skipped", String((e as Error).message)); }

    const at = Date.now();
    await db.from("sync_meta").update({ at, running_until: null, last_error: null }).eq("id", 1);
    return json({ ok: true, at, items: kept.length, changed: upserts.length, removed, updates: ups.length, histSent });
  } catch (e) {
    const code = e instanceof MondayError ? e.code : "error";
    await db.from("sync_meta").update({ running_until: null, last_error: code + ": " + String((e as Error).message).slice(0, 300), last_error_at: new Date().toISOString() }).eq("id", 1);
    return json({ ok: false, code, message: String((e as Error).message) }, code === "no_token" ? 503 : 502);
  }
});
