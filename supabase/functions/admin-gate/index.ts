import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_FAILS = 5;
const FAIL_WINDOW_MIN = 15;
const STATUSES = ["pending", "reviewing", "accepted", "rejected"];

async function hmac(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function makeToken(secret: string) {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${exp}.${await hmac(`kickmods-admin-v2:${exp}`, secret)}`;
}

async function checkToken(token: unknown, secret: string) {
  if (typeof token !== "string") return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  return safeEqual(sig, await hmac(`kickmods-admin-v2:${exp}`, secret));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration missing" }, 500);
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  // ---------- authenticated actions ----------
  if (body.action === "list" || body.action === "set_status") {
    if (!(await checkToken(body.token, serviceKey))) return json({ error: "Unauthorized" }, 401);

    if (body.action === "set_status") {
      if (typeof body.id !== "string" || !STATUSES.includes(body.status)) return json({ error: "Bad request" }, 400);
      const { error } = await db.from("applications").update({ status: body.status }).eq("id", body.id);
      if (error) return json({ error: "Update failed" }, 500);
      return json({ ok: true });
    }

    const { data, error } = await db.from("applications").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) return json({ error: "Could not load applications" }, 500);
    const bucket = db.storage.from("application-private");
    const applications = await Promise.all((data ?? []).map(async (a) => {
      const { data: video } = await bucket.createSignedUrl(a.video_path, 3600);
      let proofUrl: string | null = null;
      if (a.age_proof_path) {
        const { data: proof } = await bucket.createSignedUrl(a.age_proof_path, 3600);
        proofUrl = proof?.signedUrl ?? null;
      }
      return { ...a, video_url: video?.signedUrl ?? null, age_proof_url: proofUrl };
    }));
    return json({ applications });
  }

  // ---------- login ----------
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000).toISOString();
  const { count } = await db.from("admin_login_failures").select("id", { count: "exact", head: true }).eq("ip", ip).gte("at", since);
  if ((count ?? 0) >= MAX_FAILS) return json({ error: "Too many attempts" }, 429);

  if (typeof body.password !== "string" || body.password.length > 200) return json({ error: "Invalid credentials" }, 401);
  const { data: ok, error } = await db.rpc("verify_admin_password", { p: body.password });
  if (error) return json({ error: "Server error" }, 500);
  if (ok !== true) {
    await db.from("admin_login_failures").insert({ ip });
    return json({ error: "Invalid credentials" }, 401);
  }
  return json({ token: await makeToken(serviceKey) });
});
