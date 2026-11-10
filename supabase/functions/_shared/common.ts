import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

// the signed-in team member behind this request, or null
export async function teamMember(req: Request, db: SupabaseClient): Promise<{ email: string; name: string; can_delete?: boolean } | null> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email || !data.user.email_confirmed_at) return null;
  const { data: t } = await db.from("team").select("email,name,can_delete").eq("email", email).maybeSingle();
  return t || null;
}

export class MondayError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

// one call to monday's API with the shop's token
export async function monday(query: string, variables: Record<string, unknown> = {}) {
  const token = Deno.env.get("MONDAY_API_TOKEN");
  if (!token) throw new MondayError("no_token", "The monday API token isn't set yet");
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token, "API-Version": "2025-04" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new MondayError("needs_reauth", "monday refused the token");
  if (!r.ok || body.errors || body.error_message) {
    const msg = body.errors?.[0]?.message || body.error_message || ("HTTP " + r.status);
    throw new MondayError("tool_error", String(msg));
  }
  return body.data;
}
