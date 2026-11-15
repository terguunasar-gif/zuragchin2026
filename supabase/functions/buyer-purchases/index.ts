// buyer-purchases — өөр төхөөрөмжөөс төлсөн захиалгаа сэргээх.
// POST /options                         → { sms } (SMS_API_URL байгаа эсэх). Нууц буцаахгүй.
// POST /request-code  { email, phone? } → имэйлээр 6 оронтой код (Supabase Auth OTP).
// POST /request-code  { phone }         → SMS код, зөвхөн SMS_API_URL тохируулсан бол.
// POST /verify-code   { email, phone? } + хэрэглэгчийн JWT
//                                       → зөвхөн JWT-ийн баталгаажсан имэйлийн төлсөн захиалга.
// POST /verify-code   { phone, code }   → тухайн дугаарын төлсөн захиалга (SMS).
//
// Имэйлийн код Supabase Auth дотор хэшлэгдэнэ (шинэ имэйл нууц хэрэггүй).
// Magic Link загварт {{ .Token }} байна, {{ .ConfirmationURL }} бүү оруул.
// user_metadata-аар эрх шийдэхгүй. getUser()-ийн email л хүчинтэй.
// Сэргээх session-ийг local scope-оор хүчингүй болгоно — өөр нэвтрэлтийг гаргахгүй.
//
// Татах холбоос энд үүсгэхгүй. Хөтөч нэхэмжлэхийн дугаарыг одоогийн баримт хуудас руу нээнэ.
// SMS: qpay-тай ижил SMS_API_URL / SMS_API_KEY / SMS_FROM.
// Deploy: supabase functions deploy buyer-purchases --no-verify-jwt
// Өмнө нь buyer_email баганын миграцийг ажиллуулна.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  LIMITS,
  emailRateSubject,
  groupPaidPurchases,
  groupPaidPurchasesByEmail,
  isSixDigitCode,
  normalizeEmail,
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
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
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

type PurchaseHit = {
  qpay_invoice_id?: string | null;
  created_at?: string | null;
  album_id?: string | null;
  type?: string | null;
  gross_amount?: number | null;
  buyer_name?: string | null;
  buyer_phone?: string | null;
  buyer_email?: string | null;
};

async function toPaidRows(db: Db, rows: PurchaseHit[]): Promise<PaidRow[]> {
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
  return rows.map((r) => {
    const album = albums.get(String(r.album_id ?? "")) ?? { name: "", title: "", share_link: "" };
    return {
      qpay_invoice_id: String(r.qpay_invoice_id ?? ""),
      created_at: String(r.created_at ?? ""),
      album_id: String(r.album_id ?? ""),
      type: String(r.type ?? ""),
      gross_amount: Number(r.gross_amount) || 0,
      buyer_name: String(r.buyer_name ?? ""),
      buyer_phone: String(r.buyer_phone ?? ""),
      buyer_email: normalizeEmail(r.buyer_email) ?? "",
      album_name: album.name,
      album_title: album.title,
      share_link: album.share_link,
    };
  });
}

async function loadOrders(db: Db, phone: string): Promise<RecoveredOrder[] | null> {
  const { data, error } = await db.from("purchases")
    .select("qpay_invoice_id, created_at, album_id, type, gross_amount, buyer_name, buyer_phone")
    .eq("payment_status", "paid")
    .eq("buyer_phone", phone)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return groupPaidPurchases(phone, await toPaidRows(db, (data ?? []) as PurchaseHit[]));
}

async function loadOrdersByEmail(db: Db, email: string, phone: string | null): Promise<RecoveredOrder[] | null> {
  let query = db.from("purchases")
    .select("qpay_invoice_id, created_at, album_id, type, gross_amount, buyer_name, buyer_phone, buyer_email")
    .eq("payment_status", "paid")
    .eq("buyer_email", email);
  if (phone) query = query.eq("buyer_phone", phone);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  return groupPaidPurchasesByEmail(email, await toPaidRows(db, (data ?? []) as PurchaseHit[]), phone);
}

async function hasPaidEmail(db: Db, email: string, phone: string | null): Promise<boolean> {
  let query = db.from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("payment_status", "paid")
    .eq("buyer_email", email);
  if (phone) query = query.eq("buyer_phone", phone);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

function bearerJwt(req: Request): string {
  const match = (req.headers.get("Authorization") ?? "").trim().match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? "";
}

/** Auth серверээс баталгаажсан имэйл. user_metadata уншихгүй. */
async function verifiedEmail(db: Db, jwt: string): Promise<string | null> {
  if (!jwt || jwt === SUPABASE_ANON_KEY || jwt === SUPABASE_SERVICE_ROLE_KEY) return null;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user || data.user.is_anonymous) return null;
  const confirmed = data.user.email_confirmed_at || data.user.confirmed_at;
  if (!confirmed) return null;
  return normalizeEmail(data.user.email);
}

async function revokeRecoverySession(db: Db, jwt: string): Promise<void> {
  try {
    const { error } = await db.auth.admin.signOut(jwt, "local");
    if (error) console.log("SIGNOUT:", error.code ?? "failed");
  } catch (e) {
    console.log("SIGNOUT:", e instanceof Error ? e.message : "failed");
  }
}

/** Supabase Auth-ийн имэйл OTP. Код Auth талд хэшлэгдэнэ. */
async function sendEmailOtp(email: string): Promise<"sent" | "failed" | "rate_limited"> {
  if (!SUPABASE_ANON_KEY) {
    console.log("EMAIL OTP: anon key missing");
    return "failed";
  }
  const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
  const { error } = await auth.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (!error) return "sent";
  const code = String(error.code ?? "");
  const status = Number(error.status ?? 0);
  console.log("EMAIL OTP:", code || error.name || "failed", status || "");
  if (status === 429 || code.includes("rate_limit")) return "rate_limited";
  return "failed";
}

function wantsEmail(body: Record<string, unknown>): boolean {
  return body.email !== undefined && String(body.email).trim() !== "";
}

function optionalPhone(body: Record<string, unknown>): { phone: string | null; error: boolean } {
  if (body.phone === undefined || String(body.phone).trim() === "") return { phone: null, error: false };
  const phone = normalizePhone(body.phone);
  return phone ? { phone, error: false } : { phone: null, error: true };
}

async function requestEmailCode(req: Request, email: string, phone: string | null): Promise<Response> {
  const db = admin();
  const ip = clientIp(req);
  await cleanup(db);
  const subject = emailRateSubject(email);
  const { error: hitErr } = await db.from("buyer_purchase_otp_hits").insert({ kind: "request", phone: subject, ip });
  if (hitErr) {
    console.log("HIT INSERT:", hitErr.message);
    return json({ error: "server_error" }, 500);
  }
  const wait = await rateLimit(db, "request", subject, ip);
  if (wait > 0) return json({ error: "rate_limited", retryAfter: wait }, 429);

  // Захиалгагүй имэйлд код явуулахгүй (Auth хэрэглэгч ч үүсгэхгүй). Хариу нь адилхан.
  if (!(await hasPaidEmail(db, email, phone))) return json({ ok: true });

  const sent = await sendEmailOtp(email);
  if (sent === "rate_limited") return json({ error: "rate_limited", retryAfter: 60 }, 429);
  if (sent !== "sent") return json({ error: "email_failed" }, 502);
  return json({ ok: true });
}

async function requestCode(req: Request): Promise<Response> {
  const body = await readBody(req);
  if (!body) return json({ error: "bad_request" }, 400);
  if (wantsEmail(body)) {
    const email = normalizeEmail(body.email);
    if (!email) return json({ error: "invalid_email" }, 400);
    const extra = optionalPhone(body);
    if (extra.error) return json({ error: "invalid_phone" }, 400);
    return requestEmailCode(req, email, extra.phone);
  }
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

async function verifyEmailCode(req: Request, email: string, phone: string | null): Promise<Response> {
  const db = admin();
  const ip = clientIp(req);
  await cleanup(db);
  const subject = emailRateSubject(email);
  const { error: hitErr } = await db.from("buyer_purchase_otp_hits").insert({ kind: "verify", phone: subject, ip });
  if (hitErr) {
    console.log("HIT INSERT:", hitErr.message);
    return json({ error: "server_error" }, 500);
  }
  const wait = await rateLimit(db, "verify", subject, ip);
  if (wait > 0) return json({ error: "rate_limited", retryAfter: wait }, 429);

  const jwt = bearerJwt(req);
  const owned = await verifiedEmail(db, jwt);
  // Биеийн имэйл JWT-ийн имэйлтэй таарахгүй бол захиалга буцаахгүй.
  if (!owned || owned !== email) return json({ error: "unauthorized" }, 401);

  try {
    return await respondEmailOrders(db, owned, phone);
  } finally {
    await revokeRecoverySession(db, jwt);
  }
}

async function verifyCode(req: Request): Promise<Response> {
  const body = await readBody(req);
  if (!body) return json({ error: "bad_request" }, 400);
  if (wantsEmail(body)) {
    const email = normalizeEmail(body.email);
    if (!email) return json({ error: "invalid_email" }, 400);
    const extra = optionalPhone(body);
    if (extra.error) return json({ error: "invalid_phone" }, 400);
    return verifyEmailCode(req, email, extra.phone);
  }
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

async function respondEmailOrders(db: Db, email: string, phone: string | null): Promise<Response> {
  let orders: RecoveredOrder[] | null;
  try {
    orders = await loadOrdersByEmail(db, email, phone);
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
    if (path === "/options") return json({ sms: Boolean(SMS_API_URL) });
    if (path === "/request-code") return await requestCode(req);
    if (path === "/verify-code") return await verifyCode(req);
    return json({ error: "bad_request" }, 404);
  } catch (e) {
    console.log("BUYER PURCHASES:", e instanceof Error ? e.message : "failed");
    return json({ error: "server_error" }, 500);
  }
});
