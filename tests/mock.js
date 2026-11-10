// Stand-in Supabase for tests/app.html: sample leads, a signed-in team member, fake functions.
(function () {
  // the test browser pane may run in the background, where requestAnimationFrame never fires
  window.requestAnimationFrame = (f) => setTimeout(f, 16); window.cancelAnimationFrame = (i) => clearTimeout(i);
  const now = Date.now(), D = 864e5, H = 36e5;
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const rows = [
    { id: "1", name: "Dana Levi", status: "New Lead", phone: "050-1234567", interest: "Snow leopards", created: now - 2 * D, ecb: now - H, changed_by: "Eliran", changed_at: now - 2 * H, changed_what: "Status → In conversation" },
    { id: "2", name: "רון כהן", status: "In conversation", phone: "0529998877", interest: "Kerkini", created: now - 20 * D, mcb: now - 2 * D, last_t: "Spoke, call later", last_at: now - 3 * D, last_by: "Eliran" },
    { id: "3", name: "Tom Old", status: "New Lead", phone: "", interest: "Iceland", created: now - 30 * D },
    { id: "4", name: "Maya Done", status: "Qualified", phone: "+447700900123", created: now - 5 * D, last_t: "Sent the PDF", last_at: day.getTime() + 60000, last_by: "Jeinna" },
    { id: "5", name: "Future Guy", status: "Future", phone: "0541112233", created: now - 40 * D },
    { id: "6", name: "Won Person", status: "Won", phone: "0541112234", created: now - 40 * D },
    { id: "7", name: "Back Again", status: "Offer sent", phone: "0541112235", created: now - 50 * D, ret: now - D },
    { id: "8", name: "New Today", status: "New Lead", phone: "0541112236", created: day.getTime() + 1000, na: 3 },
  ].map((r) => Object.assign({ email: "", source: "Website Form", interest: "", about: "", lang: "", fu_date: "", ecb: 0, mcb: 0, ret: 0, na: 0, last_t: null, last_at: 0, last_by: "", st_at: 0, touch: 0 }, r));
  window.__calls = [];
  const q = (table) => {
    const st = { table, eqv: null };
    const res = () => {
      if (table === "leads") return { data: rows.slice(), error: null };
      if (table === "sync_meta") return { data: { at: now - 20000 }, error: null };
      if (table === "team") return { data: { name: "Jeinna", email: "tester@example.com" }, error: null };
      if (table === "lead_locks") return { data: [{ lead_id: "7", by_email: "emilia@example.com", by_name: "Emilia", at: new Date().toISOString(), expires: new Date(Date.now() + 6e5).toISOString() }], error: null };
      if (table === "lead_updates") return { data: [
        { id: "u2", lead_id: "1", kind: "status", text: "New Lead → In conversation", by: "Eliran", at: now - 2 * H, source: "monday", bot: false },
        { id: "u1", lead_id: "1", kind: "note", text: "הליד לחץ על הכפתור", by: "Flow Admin", at: now - 3 * H, source: "monday", bot: true }], error: null };
      return { data: null, error: null };
    };
    const api = { select() { return api; }, limit() { return Promise.resolve(res()); }, eq() { return api; }, order() { return api; }, maybeSingle() { return Promise.resolve(res()); },
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
    rpc: async (name, args) => { window.__calls.push({ name, body: args }); return { data: name === "my_monday" ? { connected: false } : { ok: true }, error: null }; },
    channel() { const c = { on() { return c; }, subscribe(cb) { cb && cb("SUBSCRIBED"); return c; } }; return c; },
  };
  const realFetch = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).includes("/functions/v1/")) {
      const name = String(url).split("/").pop(), body = JSON.parse(opt.body || "{}");
      window.__calls.push({ name, body });
      const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
      if (name === "sync") return window.__noToken ? new Response(JSON.stringify({ ok: false, code: "no_token" }), { status: 503 }) : ok({ ok: true, at: Date.now() });
      if (name === "connect") return body.disconnect ? ok({ ok: true }) : body.token === "bad" ? new Response(JSON.stringify({ ok: false, code: "bad_token" }), { status: 400 }) : ok({ ok: true, connected: true, name: "Jeinna Louise Perez" });
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
