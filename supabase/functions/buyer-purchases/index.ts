// buyer-purchases — өөр төхөөрөмжөөс төлсөн захиалгаа утасны дугаараар сэргээх.
// POST /request-code  { phone }       → SMS нэг удаагийн код (5 мин). Дугаарт захиалга байгаа эсэхийг хэлэхгүй.
// POST /verify-code   { phone, code } → зөвхөн тухайн дугаарын payment_status='paid' захиалгууд.
//
// Татах холбоос энд үүсгэхгүй. Хөтөч нэхэмжлэхийн дугаарыг одоогийн баримт хуудас руу нээнэ.
// Тэр хуудас qpay/signed-urls → qpay/file (татагдсан тоолуур) замыг ашиглана.
//
// SMS: qpay болон print-agent-тай ижил SMS_API_URL / SMS_API_KEY / SMS_FROM.
//      Жишээ: https://api.example.mn/send?key={key}&from={from}&to={to}&text={text}
// Deploy: supabase functions deploy buyer-purchases --no-verify-jwt
// Өмнө нь supabase/migrations/20261115092054_buyer_purchase_recovery.sql-ийг ажиллуулна.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  LIMITS,
  groupPaidPurchases,
  isSixDigitCode,
  normalizePhone,
  randomCode,
  retryAfterSeconds,
  strictestRetry,
  timingSafeEqual,
  type PaidRow,
  type RecoveredOrder,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SMS_API_URL = Deno.env.get("SMS_API_URL") ?? "";
const SMS_API_KEY = Deno.env.get("SMS_API_KEY") ?? "";
const SMS_FROM = Deno.env.get("SMS_FROM") ?? "";

type Db = SupabaseClient;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function routePath(url: URL): string {
  const path = url.pathname
    .replace(/^\/functions\/v1\/buyer-purchases/, "")
    .replace(/^\/buyer-purchases/, "")
    .replace(/\/+$/, "");
  return path || "/";
}

function clientIp(req: Request): string {
  const one = (v: string | null) => (v ?? "").trim();
  const cf = one(req.headers.get("cf-connecting-ip"));
  if (cf) return cf.slice(0, 64);
  const real = one(req.headers.get("x-real-ip"));
  if (real) return real.slice(0, 64);
  const forwarded = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return (forwarded[forwarded.length - 1] || "unknown").slice(0, 64);
}

function admin(): Db {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function hashCode(phone: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${phone}:${code}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** qpay/index.ts sendSms-тэй ижил URL загвар. Код, түлхүүрийг логт бичихгүй. */
async function sendSms(phone: string, text: string): Promise<"sent" | "failed" | "not_configured"> {
  if (!SMS_API_URL) return "not_configured";
  try {
    const u = SMS_API_URL
      .replace("{key}", encodeURIComponent(SMS_API_KEY))
      .replace("{from}", encodeURIComponent(SMS_FROM))
      .replace("{to}", encodeURIComponent(phone))
      .replace("{text}", encodeURIComponent(text));
    const r = await fetch(u, { signal: AbortSignal.timeout(10_000) });
    console.log("SMS:", r.status);
    await r.text();
    return r.ok ? "sent" : "failed";
  } catch (e) {
    console.log("SMS ERROR:", e instanceof Error ? e.message : "failed");
    return "failed";
  }
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > 2000) return null;
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function cleanup(db: Db) {
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  await db.from("buyer_purchase_otp_hits").delete().lt("created_at", old);
  await db.from("buyer_purchase_otps").delete().lt("created_at", old);
}

async function hitTimes(db: Db, kind: "request" | "verify", column: "phone" | "ip", value: string, sinceIso: string): Promise<number[]> {
  const { data, error } = await db.from("buyer_purchase_otp_hits")
    .select("created_at")
    .eq("kind", kind)
    .eq(column, value)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r) => new Date(String(r.created_at)).getTime())
    .filter((n) => Number.isFinite(n));
}

async function rateLimit(db: Db, kind: "request" | "verify", phone: string, ip: string): Promise<number> {
  const now = Date.now();
  const since = new Date(now - LIMITS.windowDay).toISOString();
  const [phoneHits, ipHits] = await Promise.all([
    hitTimes(db, kind, "phone", phone, since),
    hitTimes(db, kind, "ip", ip, since),
  ]);
  const phone15 = kind === "request" ? LIMITS.requestPhone15m : LIMITS.verifyPhone15m;
  const phoneDay = kind === "request" ? LIMITS.requestPhoneDay : LIMITS.verifyPhoneDay;
  const ip15 = kind === "request" ? LIMITS.requestIp15m : LIMITS.verifyIp15m;
  const ipDay = kind === "request" ? LIMITS.requestIpDay : LIMITS.verifyIpDay;
  return strictestRetry([
    retryAfterSeconds(now, phoneHits, LIMITS.window15m, phone15),
    retryAfterSeconds(now, phoneHits, LIMITS.windowDay, phoneDay),
    retryAfterSeconds(now, ipHits, LIMITS.window15m, ip15),
    retryAfterSeconds(now, ipHits, LIMITS.windowDay, ipDay),
  ]);
}

async function hasPaid(db: Db, phone: string): Promise<boolean> {
  const { count, error } = await db.from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("payment_status", "paid")
    .eq("buyer_phone", phone);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

async function inCooldown(db: Db, phone: string): Promise<boolean> {
  const { data, error } = await db.from("buyer_purchase_otps")
    .select("created_at")
    .eq("phone", phone)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const created = data?.[0]?.created_at;
  if (!created) return false;
  return Date.now() - new Date(String(created)).getTime() < LIMITS.cooldownMs;
}

async function loadOrders(db: Db, phone: string): Promise<RecoveredOrder[] | null> {
  const { data, error } = await db.from("purchases")
    .select("qpay_invoice_id, created_at, album_id, type, gross_amount, buyer_name, buyer_phone")
    .eq("payment_status", "paid")
    .eq("buyer_phone", phone)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const albumIds = [...new Set(rows.map((r) => String(r.album_id ?? "")).filter(Boolean))];
  const albums = new Map<string, { name: string; title: string; share_link: string }>();
  for (let i = 0; i < albumIds.length; i += 100) {
    const chunk = albumIds.slice(i, i + 100);
    const { data: found, error: albumErr } = await db.from("albums")
      .select("id, name, title, share_link")
      .in("id", chunk);
    if (albumErr) throw new Error(albumErr.message);
    for (const a of found ?? []) {
      albums.set(String(a.id), {
        name: String(a.name ?? ""),
        title: String(a.title ?? ""),
        share_link: String(a.share_link ?? ""),
      });
    }
  }
  const paid: PaidRow[] = rows.map((r) => {
    const album = albums.get(String(r.album_id ?? "")) ?? { name: "", title: "", share_link: "" };
    return {
      qpay_invoice_id: String(r.qpay_invoice_id ?? ""),
      created_at: String(r.created_at ?? ""),
      album_id: String(r.album_id ?? ""),
      type: String(r.type ?? ""),
      gross_amount: Number(r.gross_amount) || 0,
      buyer_name: String(r.buyer_name ?? ""),
      buyer_phone: String(r.buyer_phone ?? ""),
      album_name: album.name,
      album_title: album.title,
      share_link: album.share_link,
    };
  });
  return groupPaidPurchases(phone, paid);
}

async function requestCode(req: Request): Promise<Response> {
  const body = await readBody(req);
  if (!body) return json({ error: "bad_request" }, 400);
  const phone = normalizePhone(body.phone);
  if (!phone) return json({ error: "invalid_phone" }, 400);
  if (!SMS_API_URL) return json({ error: "sms_not_configured" }, 503);

  const db = admin();
  const ip = clientIp(req);
  await cleanup(db);
  const { error: hitErr } = await db.from("buyer_purchase_otp_hits").insert({ kind: "request", phone, ip });
  if (hitErr) {
    console.log("HIT INSERT:", hitErr.message);
    return json({ error: "server_error" }, 500);
  }
  const wait = await rateLimit(db, "request", phone, ip);
  if (wait > 0) return json({ error: "rate_limited", retryAfter: wait }, 429);

  // Захиалгагүй дугаарт SMS явуулахгүй, гэхдээ хариу нь адилхан — дугаар таахаас сэргийлнэ.
  if (!(await hasPaid(db, phone))) return json({ ok: true });
  if (await inCooldown(db, phone)) return json({ ok: true });

  const code = randomCode();
  const codeHash = await hashCode(phone, code);
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + LIMITS.ttlMs).toISOString();
  await db.from("buyer_purchase_otps").update({ consumed_at: nowIso }).eq("phone", phone).is("consumed_at", null);
  const { error: insErr } = await db.from("buyer_purchase_otps").insert({
    phone,
    code_hash: codeHash,
    expires_at: expiresAt,
    request_ip: ip,
  });
  if (insErr) {
    console.log("OTP INSERT:", insErr.message);
    return json({ error: "server_error" }, 500);
  }
  const sms = await sendSms(phone, `Zuragchin.mn kod: ${code}. 5 min. Busdad buu og.`);
  if (sms !== "sent") {
    await db.from("buyer_purchase_otps").delete().eq("phone", phone).eq("code_hash", codeHash);
    return json({ error: sms === "not_configured" ? "sms_not_configured" : "sms_failed" }, sms === "not_configured" ? 503 : 502);
  }
  return json({ ok: true });
}

interface OtpRow {
  id: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
}

async function verifyCode(req: Request): Promise<Response> {
  const body = await readBody(req);
  if (!body) return json({ error: "bad_request" }, 400);
  const phone = normalizePhone(body.phone);
  const code = String(body.code ?? "").trim();
  if (!phone) return json({ error: "invalid_phone" }, 400);
  if (!isSixDigitCode(code)) return json({ error: "invalid_code" }, 400);

  const db = admin();
  const ip = clientIp(req);
  await cleanup(db);
  const { error: hitErr } = await db.from("buyer_purchase_otp_hits").insert({ kind: "verify", phone, ip });
  if (hitErr) {
    console.log("HIT INSERT:", hitErr.message);
    return json({ error: "server_error" }, 500);
  }
  const wait = await rateLimit(db, "verify", phone, ip);
  if (wait > 0) return json({ error: "rate_limited", retryAfter: wait }, 429);

  const submitted = await hashCode(phone, code);
  const { data, error } = await db.from("buyer_purchase_otps")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.log("OTP READ:", error.message);
    return json({ error: "server_error" }, 500);
  }
  const row = (data?.[0] ?? null) as OtpRow | null;
  const match = timingSafeEqual(submitted, row?.code_hash ?? "0".repeat(submitted.length));
  if (!row) return json({ error: "invalid_code" }, 400);

  const expired = new Date(row.expires_at).getTime() <= Date.now();
  if (!row.consumed_at && row.attempts >= LIMITS.maxAttempts) {
    return json({ error: "too_many_attempts" }, 400);
  }
  if (row.consumed_at) {
    const age = Date.now() - new Date(row.consumed_at).getTime();
    if (match && age >= 0 && age < 15_000 && !expired) return respondOrders(db, phone);
    return json({ error: "invalid_code" }, 400);
  }
  if (expired) return json({ error: "expired" }, 400);
  if (!match) {
    const next = Number(row.attempts) + 1;
    await db.from("buyer_purchase_otps")
      .update({ attempts: next })
      .eq("id", row.id)
      .eq("attempts", row.attempts)
      .is("consumed_at", null);
    return json({ error: next >= LIMITS.maxAttempts ? "too_many_attempts" : "invalid_code" }, 400);
  }

  const { data: consumed, error: consumeErr } = await db.from("buyer_purchase_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .lt("attempts", LIMITS.maxAttempts)
    .gt("expires_at", new Date().toISOString())
    .select("id");
  if (consumeErr) {
    console.log("OTP CONSUME:", consumeErr.message);
    return json({ error: "server_error" }, 500);
  }
  if (!consumed?.length) return json({ error: "invalid_code" }, 400);
  return respondOrders(db, phone);
}

async function respondOrders(db: Db, phone: string): Promise<Response> {
  let orders: RecoveredOrder[] | null;
  try {
    orders = await loadOrders(db, phone);
  } catch (e) {
    console.log("ORDERS:", e instanceof Error ? e.message : "failed");
    return json({ error: "server_error" }, 500);
  }
  if (orders === null) return json({ error: "server_error" }, 500);
  return json({ ok: true, orders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "server_error" }, 500);
  if (req.method !== "POST") return json({ error: "bad_request" }, 405);
  try {
    const path = routePath(new URL(req.url));
    if (path === "/request-code") return await requestCode(req);
    if (path === "/verify-code") return await verifyCode(req);
    return json({ error: "bad_request" }, 404);
  } catch (e) {
    console.log("BUYER PURCHASES:", e instanceof Error ? e.message : "failed");
    return json({ error: "server_error" }, 500);
  }
});
