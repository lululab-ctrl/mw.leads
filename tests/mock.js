// Stand-in Supabase for tests/app.html: sample leads, a signed-in team member, fake functions.
(function () {
  // the test browser pane may run in the background, where requestAnimationFrame never fires
  window.requestAnimationFrame = (f) => setTimeout(f, 16); window.cancelAnimationFrame = (i) => clearTimeout(i);
  const now = Date.now(), D = 864e5, H = 36e5;
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const rows = [
    { id: "1", name: "Dana Levi", status: "New Lead", phone: "050-1234567", interest: "Snow leopards", created: now - 2 * D, ecb: now - H, changed_by: "Eliran", changed_at: now - 2 * H, changed_what: "Status → In conversation" },
    { id: "2", name: "רון כהן", status: "In conversation", phone: "0529998877", interest: "Kerkini", created: now - 20 * D, mcb: now - 2 * D, last_t: "Spoke, call later", last_at: now - 3 * D, last_by: "Eliran" },
    { id: "3", name: "Tom Old", status: "New Lead", phone: "", interest: "Iceland", created: now - 30 * D, fu_at: now - 3 * H, fu_has_time: true, fu_state: "Follow-Up" },
    { id: "4", name: "Maya Done", status: "Qualified", phone: "+447700900123", email: "maya@example.com", fu_at: now + 2 * D, fu_has_time: true, fu_state: "Follow-Up", created: now - 5 * D, last_t: "Sent the PDF", last_at: day.getTime() + 60000, last_by: "Jeinna" },
    { id: "5", name: "Future Guy", status: "Future", phone: "0541112233", created: now - 40 * D },
    { id: "9", name: "Date Only", status: "In conversation", phone: "0541112299", created: now - 9 * D, fu_at: now + 3 * D, fu_has_time: false, fu_state: "Follow-Up",
      details: [{ t: "Interested in (Form from Website)", v: "Japan winter" }, { t: "Status", v: "In conversation" }, { t: "Email", v: "date.only@example.com" }, { t: "Lead Source", v: "Facebook" }, { t: "Follow Up", v: "Follow-Up" }, { t: "Follow Up Date", v: "2026-11-13" }, { t: "General Notes", v: "Asked about February.\nPrefers WhatsApp." }, { t: "Form Language", v: "English" }, { t: "UTM", v: "fb / paid / japan" }, { t: "Receive updates", v: "✓" }] },
    { id: "6", name: "Won Person", status: "Won", phone: "0541112234", created: now - 40 * D },
    { id: "7", name: "Back Again", status: "Offer sent", phone: "0541112235", created: now - 50 * D, ret: now - D },
    { id: "8", name: "New Today", status: "New Lead", phone: "0541112236", created: day.getTime() + 1000, na: 3 },
  ].map((r) => Object.assign({ email: "", source: "Website Form", interest: "", about: "", lang: "", fu_date: "", ecb: 0, mcb: 0, ret: 0, na: 0, last_t: null, last_at: 0, last_by: "", st_at: 0, touch: 0 }, r));
  window.__calls = [];
  window.__focus = [];
  const fq = () => {
    let op = "select", vals = null, id = null;
    const done = () => {
      if (op === "insert") { const r = Object.assign({ id: "f" + (window.__focus.length + 1) + Date.now(), add_ids: [], remove_ids: [], created_at: new Date().toISOString() }, vals); window.__focus.push(r); return { data: r, error: null }; }
      if (op === "update") { const r = window.__focus.find((f) => f.id === id); Object.assign(r, vals); return { data: r, error: null }; }
      if (op === "delete") { window.__focus = window.__focus.filter((f) => f.id !== id); return { data: null, error: null }; }
      return { data: window.__focus.slice(), error: null };
    };
    const a = { select() { return a; }, order() { return a; }, single() { return Promise.resolve(done()); },
      insert(v) { op = "insert"; vals = v; return a; }, update(v) { op = "update"; vals = v; return a; }, delete() { op = "delete"; return a; },
      eq(k, v) { id = v; return a; }, then(ok, bad) { return Promise.resolve(done()).then(ok, bad); } };
    return a;
  };
  const q = (table) => {
    if (table === "focus_lists") return fq();
    const st = { table, eqv: null };
    const res = () => {
      if (table === "leads") return { data: rows.slice(), error: null };
      if (table === "sync_meta") return { data: { at: now - 20000 }, error: null };
      if (table === "team") return { data: { name: "Jeinna", email: "tester@example.com", can_delete: !location.hash.includes("nodelete") }, error: null };
      if (table === "lead_locks") return { data: [{ lead_id: "7", by_email: "emilia@example.com", by_name: "Emilia", at: new Date().toISOString(), expires: new Date(Date.now() + 6e5).toISOString() }], error: null };
      if (table === "lead_updates" && st.rep) { const M = 6e4; return { data: [
        { id: "r1", lead_id: "1", kind: "note", text: "Called, interested\n— Matan · 11.11.2026 10:00", by: "Matan", at: now - 30 * M, source: "app", bot: false },
        { id: "r2", lead_id: "1", kind: "status", text: "New Lead → In conversation", by: "Matan", at: now - 29 * M, source: "app", bot: false },
        { id: "st-1-x", lead_id: "1", kind: "status", text: "New Lead → In conversation", by: "Matan", at: now - 28 * M, source: "monday", bot: false },
        { id: "r3", lead_id: "6", kind: "status", text: "Offer sent → Won", by: "Emilia", at: now - 20 * M, source: "app", bot: false },
        { id: "r4", lead_id: "2", kind: "call", text: "15.11.2026 12:00", by: "Emilia", at: now - 19 * M, source: "app", bot: false },
        { id: "r5", lead_id: "99999", kind: "status", text: "In conversation → Lost (Price)", by: "Emilia", at: now - 18 * M, source: "monday", bot: false },
        { id: "r6", lead_id: "3", kind: "note", text: "Sent an email (11.11, Claude)", by: "Matan", at: now - 10 * M, source: "monday", bot: false },
        { id: "r7", lead_id: "3", kind: "status", text: "New Lead → In conversation", by: "Matan", at: now - 9 * M, source: "monday", bot: false },
        { id: "r8", lead_id: "8", kind: "note", text: "הליד לחץ על הכפתור", by: "Flow Admin", at: now - 8 * M, source: "monday", bot: true },
        ...[11, 12, 13, 14, 15].map((k, i) => ({ id: "b" + k, lead_id: String(k), kind: "status", text: "New Lead → Lost", by: "Matan", at: now - 40 * M + i * M, source: "monday", bot: false })),
        { id: "b16n", lead_id: "16", kind: "note", text: "No answer 3 times", by: "Matan", at: now - 5 * D, source: "app", bot: false },
        { id: "b16", lead_id: "16", kind: "status", text: "In conversation → Lost", by: "Matan", at: now - 50 * M, source: "monday", bot: false },
        { id: "b11r", lead_id: "11", kind: "status", text: "Lost → In conversation", by: "Emilia", at: now - 6 * M, source: "app", bot: false },
        { id: "t1", lead_id: "2", kind: "tap", text: "call", by: "Emilia", at: now - 25 * M, source: "app", bot: false },
        { id: "t2", lead_id: "4", kind: "tap", text: "call", by: "Emilia", at: now - 24 * M, source: "app", bot: false },
        { id: "t3", lead_id: "7", kind: "tap", text: "whatsapp", by: "Emilia", at: now - 23 * M, source: "app", bot: false },
        { id: "t5", lead_id: "5", kind: "tap", text: "copy", by: "Matan", at: now - 45 * M, source: "app", bot: false },
        { id: "t4", lead_id: "1", kind: "tap", text: "call", by: "Matan", at: now - 31 * M, source: "app", bot: false },
        { id: "n5", lead_id: "9", kind: "note", text: "No answer", by: "Eliran", at: now - 12 * M, source: "app", bot: false },
        { id: "q1", lead_id: "4", kind: "status", text: "In conversation → Qualified", by: "Emilia", at: now - 22 * M, source: "app", bot: false },
        { id: "r9", lead_id: "4", kind: "note", text: "Spoke with Maya\n— Eliran · 11.11.2026 09:00", by: "Eliran", at: now - 7 * M, source: "monday", bot: false },
      ].filter((r) => st.ids ? st.ids.indexOf(r.lead_id) >= 0 : r.at >= st.gte && r.at < st.lt), error: null }; }
      if (table === "lead_updates") return { data: [
        { id: "u2", lead_id: "1", kind: "status", text: "New Lead → In conversation", by: "Eliran", at: now - 2 * H, source: "monday", bot: false },
        { id: "u1", lead_id: "1", kind: "note", text: "הליד לחץ על הכפתור", by: "Flow Admin", at: now - 3 * H, source: "monday", bot: true }], error: null };
      return { data: null, error: null };
    };
    const api = { in(k, v) { st.rep = true; st.ids = v; return api; }, gte(k, v) { st.rep = true; st.gte = v; return api; }, lt(k, v) { st.lt = v; return api; }, range() { return Promise.resolve(res()); }, select() { return api; }, limit() { return Promise.resolve(res()); }, eq() { return api; }, order() { return api; }, maybeSingle() { return Promise.resolve(res()); },
      then(ok, bad) { return Promise.resolve(res()).then(ok, bad); } };
    return api;
  };
  window.MWPL_CONFIG = { supabaseUrl: "https://mock.supabase.co", supabaseAnonKey: "anon" };
  window.__MWPL_MOCK = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "t", user: { email: "tester@example.com" } } } }),
      onAuthStateChange() {}, signOut: async () => {}, signInWithOtp: async () => ({ error: null }),
      signInWithPassword: async () => ({ error: null }),
      updateUser: async (u) => { window.__calls.push({ name: "updateUser", body: { hasPassword: !!u.password, data: u.data } }); return { data: { user: { email: "tester@example.com", user_metadata: u.data } }, error: null }; },
    },
    from: q,
    rpc: async (name, args) => { window.__calls.push({ name, body: args }); return { data: { ok: true }, error: null }; },
    channel() { const c = { on() { return c; }, subscribe(cb) { cb && cb("SUBSCRIBED"); return c; } }; return c; },
  };
  const realFetch = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).includes("/functions/v1/")) {
      const name = String(url).split("/").pop(), body = JSON.parse(opt.body || "{}");
      window.__calls.push({ name, body });
      const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
      if (name === "sync") return window.__noToken ? new Response(JSON.stringify({ ok: false, code: "no_token" }), { status: 503 }) : ok({ ok: true, at: Date.now() });
      if (name === "act" && body.schedule) { const [y, m, d] = body.schedule.date.split("-").map(Number), [h, mi] = body.schedule.time.split(":").map(Number); const at = Date.UTC(y, m - 1, d, h - 2, mi); return ok({ ok: true, fields: { fu_at: at, fu_date: body.schedule.date, fu_state: "Follow-Up", changed_by: "Jeinna", changed_at: Date.now(), changed_what: "Call → " + body.schedule.date + " " + body.schedule.time } }); }
      if (name === "act" && body.callDone) return ok({ ok: true, fields: { fu_state: "Done", changed_by: "Jeinna", changed_at: Date.now(), changed_what: "Call done" } });
      if (name === "act" && body.tap) return ok({ ok: true });
      if (name === "act" && body.delete) return window.__failDelete ? new Response(JSON.stringify({ ok: false, code: "tool_error", message: "test" }), { status: 502 }) : ok({ ok: true, deleted: true });
      if (name === "act") {
        const f = { touch: Date.now() };
        let text = (body.note || "").trim(); if (body.noAnswer) text = "No answer" + (text ? "\n" + text : "");
        if (text) { f.last_t = text; f.last_at = Date.now(); f.last_by = "Jeinna"; }
        if (body.noAnswer) f.na = 1;
        if (body.label) { f.status = body.label; f.st_at = Date.now(); }
        return ok({ ok: true, fields: f });
      }
    }
    return realFetch(url, opt);
  };
})();
