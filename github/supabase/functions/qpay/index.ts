import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Туршилтын орчин: QPAY_BASE_URL=https://merchant-sandbox.qpay.mn/v2
const QPAY_BASE = (Deno.env.get("QPAY_BASE_URL") || "https://merchant.qpay.mn/v2").replace(/\/+$/, "");
const QPAY_USERNAME = Deno.env.get("QPAY_USERNAME") ?? "";
const QPAY_PASSWORD = Deno.env.get("QPAY_PASSWORD") ?? "";
const QPAY_INVOICE_CODE = Deno.env.get("QPAY_INVOICE_CODE") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const QPAY_FEE_RATE = 0.01;
const PLATFORM_FEE_RATE = 0.03;
const OWNER_COMMISSION_RATE = 0.10;
const AI_ALBUM_PRICE_DEFAULT = 3000;

async function qpayToken(): Promise<string> {
  const creds = btoa(`${QPAY_USERNAME}:${QPAY_PASSWORD}`);
  console.log("===== QPAY TOKEN REQUEST =====");
  console.log("QPAY_USERNAME EXISTS:", !!QPAY_USERNAME);
  console.log("QPAY_PASSWORD EXISTS:", !!QPAY_PASSWORD);
  const res = await fetch(`${QPAY_BASE}/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}` },
  });
  console.log("TOKEN RESPONSE STATUS:", res.status);
  if (!res.ok) {
    const txt = await res.text();
    console.log("TOKEN ERROR:", txt);
    throw new Error(`QPay token авч чадсангүй: ${txt}`);
  }
  const data = await res.json();
  console.log("TOKEN SUCCESS");
  return data.access_token as string;
}

async function qpayCreateInvoice(token: string, params: {
  invoiceCode: string;
  senderName: string;
  senderPhone: string;
  description: string;
  amount: number;
  callbackUrl: string;
}) {
  const payload = {
    invoice_code: params.invoiceCode,
    sender_invoice_no: crypto.randomUUID().slice(0, 16),
    invoice_receiver_code: "terminal",
    sender_branch_code: "BRANCH1",
    invoice_description: params.description,
    sender_staff_code: "online",
    amount: params.amount,
    callback_url: params.callbackUrl,
  };
  console.log("INVOICE PAYLOAD:", JSON.stringify(payload));
  const res = await fetch(`${QPAY_BASE}/invoice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  console.log("INVOICE RESPONSE STATUS:", res.status);
  if (!res.ok) {
    const body = await res.text();
    console.log("INVOICE RESPONSE DATA:", body);
    throw new Error(`QPay invoice үүсгэж чадсангүй: ${res.status} ${body}`);
  }
  const data = await res.json();
  console.log("INVOICE SUCCESS, id:", data.invoice_id);
  return data;
}

async function qpayCheckPayment(token: string, invoiceId: string) {
  const res = await fetch(`${QPAY_BASE}/payment/check`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      object_type: "INVOICE",
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    }),
  });
  if (!res.ok) throw new Error(`QPay шалгаж чадсангүй: ${res.status}`);
  return res.json();
}

/** QPay-ээс өөрсдөө шалгана: төлөгдсөн эсэх, гүйлгээний дугаар, төлсөн дүн. */
async function verifyPaid(invoiceId: string): Promise<{ isPaid: boolean; paymentId: string; paidAmount: number | null }> {
  try {
    const token = await qpayToken();
    const result = await qpayCheckPayment(token, invoiceId);
    const rows = (result.rows ?? []) as { payment_status?: string; payment_id?: string; payment_amount?: number | string }[];
    const paidRows = rows.filter(r => !r.payment_status || r.payment_status === "PAID");
    const isPaid = paidRows.length > 0;
    const fromRows = paidRows.reduce((s, r) => s + (Number(r.payment_amount) || 0), 0);
    const paidAmount = typeof result.paid_amount === "number"
      ? result.paid_amount
      : fromRows > 0 ? fromRows : null;
    return { isPaid, paymentId: paidRows[0]?.payment_id ?? "", paidAmount };
  } catch (e) {
    console.log("VERIFY PAYMENT ERROR:", e);
    return { isPaid: false, paymentId: "", paidAmount: null };
  }
}

/** Цомгийн size_prices → {"10x15": 10000, ...} (digital-ийг оруулахгүй). Сайтын логиктой ижил. */
function albumPrintPrices(sizePrices: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(sizePrices)) return out;
  for (const sp of sizePrices as { size?: string; price?: number; enabled?: boolean }[]) {
    const size = String(sp?.size ?? "");
    const price = Number(sp?.price ?? 0);
    if (sp?.enabled === false) continue;
    if (size && size !== "digital" && price > 0) out[size] = price;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/functions\/v1\/qpay/, "").replace(/^\/qpay/, "");

    console.log("REQUEST PATH:", path, "METHOD:", req.method);

    // ── QPay тохиргоо шалгах (нууц утгыг харуулахгүй) ──
    if (req.method === "GET" && path === "/health") {
      const report: Record<string, unknown> = {
        environment: QPAY_BASE.includes("sandbox") ? "sandbox (туршилт)" : "production (жинхэнэ)",
        QPAY_USERNAME: QPAY_USERNAME ? "✓ байна" : "✗ ДУТУУ",
        QPAY_PASSWORD: QPAY_PASSWORD ? "✓ байна" : "✗ ДУТУУ",
        QPAY_INVOICE_CODE: QPAY_INVOICE_CODE ? "✓ байна" : "✗ ДУТУУ",
      };
      if (QPAY_USERNAME && QPAY_PASSWORD) {
        try {
          await qpayToken();
          report.token = "✓ QPay нэвтрэлт амжилттай";
        } catch (e) {
          report.token = "✗ " + (e instanceof Error ? e.message : String(e));
        }
      } else {
        report.token = "✗ Нэвтрэх мэдээлэл дутуу";
      }
      report.ready = String(report.token).startsWith("✓") && !!QPAY_INVOICE_CODE;
      return json(report);
    }

    // CALLBACK
    if (req.method === "POST" && path === "/callback") {
      const body = await req.json().catch(() => ({}));
      const invoiceId: string = body.invoice_id ?? "";
      if (!invoiceId) return json({ ok: true });
      // Callback-ын агуулгад итгэхгүй — QPay-ээс өөрсдөө дахин шалгана
      const paid = await verifyPaid(invoiceId);
      if (paid.isPaid) {
        const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await processPayment(db, invoiceId, paid.paymentId, paid.paidAmount);
        await processExtension(db, invoiceId, paid.paymentId, paid.paidAmount);
        await processPackage(db, invoiceId, paid.paymentId, paid.paidAmount);
      }
      return json({ ok: true });
    }

    // ── ЦОМОГ СУНГАХ: нэхэмжлэх үүсгэх (хэн ч төлж болно) ──
    if (req.method === "POST" && path === "/extend-invoice") {
      const { albumId, buyerName, buyerPhone } = await req.json() as { albumId: string; buyerName: string; buyerPhone: string };
      if (!String(buyerName ?? "").trim() || !/^\d{8,}$/.test(String(buyerPhone ?? "").trim())) {
        return json({ error: "Нэр, утасны дугаараа зөв оруулна уу" }, 400);
      }
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: album } = await db.from("albums").select("id, name, title, status, files_purged_at").eq("id", albumId).maybeSingle();
      if (!album) return json({ error: "Цомог олдсонгүй" }, 404);
      if (album.files_purged_at) return json({ error: "Цомгийн зургууд устсан тул сунгах боломжгүй" }, 410);
      const price = await settingNumber(db, "album_extend_price", 10000);
      const days = await settingNumber(db, "album_extend_days", 30);
      if (!(price > 0) || !(days > 0)) return json({ error: "Сунгалтын тохиргоо буруу байна" }, 500);

      const token = await qpayToken();
      const invoice = await qpayCreateInvoice(token, {
        invoiceCode: QPAY_INVOICE_CODE,
        senderName: buyerName,
        senderPhone: buyerPhone,
        description: `Zuragchin.mn - цомог сунгах ${days} хоног`,
        amount: price,
        callbackUrl: `${SUPABASE_URL}/functions/v1/qpay/callback`,
      });
      const { error: insErr } = await db.from("album_extensions").insert({
        album_id: album.id, qpay_invoice_id: invoice.invoice_id, amount: price, days,
        payer_name: String(buyerName).trim(), payer_phone: String(buyerPhone).trim(),
      });
      if (insErr) throw new Error(`DB insert failed: ${insErr.message}`);
      return json({ invoiceId: invoice.invoice_id, qrImage: invoice.qr_image, qrText: invoice.qr_text, urls: invoice.urls ?? [], amount: price, days });
    }

    // ── ЦОМОГ СУНГАХ: төлбөр шалгах ──
    if (req.method === "GET" && path.startsWith("/check-extension/")) {
      const invoiceId = path.replace("/check-extension/", "").split("?")[0];
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const paid = await verifyPaid(invoiceId);
      let expiresAt: string | null = null;
      if (paid.isPaid) expiresAt = await processExtension(db, invoiceId, paid.paymentId, paid.paidAmount);
      return json({ isPaid: !!expiresAt, expiresAt });
    }

    // ── АДМИН: хугацаа хэтэрсэн цомгуудын файлыг цэвэрлэх ──
    if (req.method === "POST" && path === "/admin/cleanup-expired") {
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: userData } = await db.auth.getUser(jwt);
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Нэвтэрнэ үү" }, 401);
      const { data: me } = await db.from("users").select("role").eq("id", uid).maybeSingle();
      const roles = Array.isArray(me?.role) ? me.role : [me?.role];
      if (!roles.includes("admin")) return json({ error: "Зөвхөн админ" }, 403);

      const { dryRun } = await req.json().catch(() => ({ dryRun: true })) as { dryRun?: boolean };
      const purgeDays = await settingNumber(db, "album_purge_after_days", 60);
      const cutoff = new Date(Date.now() - purgeDays * 86400000).toISOString();
      const { data: albums } = await db.from("albums").select("id, name, expires_at")
        .lt("expires_at", cutoff).is("files_purged_at", null).limit(20);
      const report: { albumId: string; name: string; files: number }[] = [];
      for (const a of albums ?? []) {
        const { data: photos } = await db.from("photo_uploads").select("original_url, preview_url").eq("album_id", a.id);
        const originals = (photos ?? []).map(p => String(p.original_url ?? "").replace(/^photos-original\//, "")).filter(Boolean);
        const previews = (photos ?? []).map(p => String(p.preview_url ?? "").split("/photos-preview/")[1]?.split("?")[0]).filter(Boolean) as string[];
        report.push({ albumId: a.id, name: a.name, files: originals.length + previews.length });
        if (dryRun) continue;
        for (let i = 0; i < originals.length; i += 100) await db.storage.from("photos-original").remove(originals.slice(i, i + 100));
        for (let i = 0; i < previews.length; i += 100) await db.storage.from("photos-preview").remove(previews.slice(i, i + 100));
        await db.from("albums").update({ files_purged_at: new Date().toISOString(), status: "closed" }).eq("id", a.id);
      }
      return json({ dryRun: !!dryRun, purgeAfterDays: purgeDays, albums: report });
    }

    // CREATE INVOICE
    if (req.method === "POST" && path === "/create-invoice") {
      const body = await req.json();
      const { cartItems, buyerName, buyerPhone, albumId } = body as {
        cartItems: CartItem[];
        buyerName: string;
        buyerPhone: string;
        albumId: string;
      };

      console.log("ALBUM:", albumId);
      console.log("CART ITEMS COUNT:", cartItems?.length);

      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { data: album, error: albumErr } = await db
        .from("albums")
        .select("id, owner_id, owner_commission, is_free, download_price, size_prices, status, expires_at")
        .eq("id", albumId)
        .maybeSingle();

      if (albumErr) {
        console.log("ALBUM FETCH ERROR:", albumErr.message);
        return json({ error: "Album fetch failed: " + albumErr.message }, 500);
      }

      if (!album) {
        console.log("ALBUM NOT FOUND:", albumId);
        return json({ error: "Album not found" }, 404);
      }

      if (album.status && album.status !== "active") {
        return json({ error: "Цомог идэвхгүй байна" }, 400);
      }
      if (album.expires_at && new Date(album.expires_at).getTime() < Date.now()) {
        return json({ error: "Цомгийн хугацаа дууссан байна" }, 400);
      }
      if (!Array.isArray(cartItems) || cartItems.length === 0 || cartItems.length > 200) {
        return json({ error: "Сагс хоосон байна" }, 400);
      }
      if (!String(buyerName ?? "").trim() || !/^\d{8,}$/.test(String(buyerPhone ?? "").trim())) {
        return json({ error: "Нэр, утасны дугаараа зөв оруулна уу" }, 400);
      }

      // ── Үнийг хэрэглэгчээс авахгүй, мэдээллийн сангаас тооцоолно ──
      const photoIds = [...new Set(cartItems.map(i => String(i?.photoId ?? "")))];
      const { data: photos, error: photoErr } = await db
        .from("photo_uploads")
        .select("id, album_id, photographer_id, print_prices, source")
        .in("id", photoIds)
        .eq("album_id", albumId);
      if (photoErr) return json({ error: "Зураг шалгахад алдаа: " + photoErr.message }, 500);

      // AI бүүтийн зургийн цомог дахь үнийг сайтын админ тогтооно (platform_settings.ai_album_price)
      let aiAlbumPrice = AI_ALBUM_PRICE_DEFAULT;
      {
        const { data: setting } = await db.from("platform_settings").select("value").eq("key", "ai_album_price").maybeSingle();
        const v = Number(setting?.value);
        if (Number.isFinite(v) && v >= 0) aiAlbumPrice = v;
      }
      const photoMap = new Map((photos ?? []).map(p => [p.id as string, p]));
      const albumPrint = albumPrintPrices(album.size_prices);
      const downloadPrice = album.is_free ? 0 : Number(album.download_price ?? 0);

      const seen = new Set<string>();
      const pricedItems: { photoId: string; photographerId: string; type: "download" | "print"; printSize: string; price: number; isAi: boolean }[] = [];
      for (const raw of cartItems) {
        const photo = photoMap.get(String(raw?.photoId ?? ""));
        if (!photo) return json({ error: "Сагсанд энэ цомгийн биш зураг байна. Хуудсаа refresh хийнэ үү." }, 400);
        const type = raw?.type === "print" ? "print" : raw?.type === "download" ? "download" : null;
        if (!type) return json({ error: "Буруу захиалгын төрөл" }, 400);
        const printSize = type === "print" ? String(raw?.printSize ?? "") : "";
        const key = `${photo.id}|${type}|${printSize}`;
        if (seen.has(key)) continue; // давхардлыг хасна
        seen.add(key);

        const isAi = photo.source === "ai_booth";
        let price = 0;
        if (type === "download") {
          price = isAi ? aiAlbumPrice : downloadPrice;
        } else {
          const own = photo.print_prices && typeof photo.print_prices === "object" ? photo.print_prices as Record<string, number> : {};
          const table = Object.keys(own).length > 0 ? own : albumPrint;
          price = Number(table[printSize] ?? 0);
          if (!(price > 0)) return json({ error: `${printSize} хэмжээгээр угаалгах боломжгүй байна. Хуудсаа refresh хийнэ үү.` }, 400);
        }
        pricedItems.push({ photoId: photo.id, photographerId: photo.photographer_id ?? album.owner_id, type, printSize, price, isAi });
      }

      const ownerCommission: number = album.owner_commission ?? OWNER_COMMISSION_RATE;
      const grossTotal = pricedItems.reduce((s, i) => s + i.price, 0);
      if (!(grossTotal > 0)) return json({ error: "Төлөх дүн 0 байна — үнэгүй зургийг шууд татна уу." }, 400);


      console.log("QPAY_INVOICE_CODE:", QPAY_INVOICE_CODE);

      const token = await qpayToken();
      const callbackUrl = `${SUPABASE_URL}/functions/v1/qpay/callback`;

      const invoice = await qpayCreateInvoice(token, {
        invoiceCode: QPAY_INVOICE_CODE,
        senderName: buyerName,
        senderPhone: buyerPhone,
        description: `Zuragchin.mn - ${pricedItems.length} photo${pricedItems.length !== 1 ? "s" : ""}`,
        amount: grossTotal,
        callbackUrl,
      });

      const invoiceId: string = invoice.invoice_id;

      const purchaseRows = pricedItems.map((item) => {
        const itemQpay = Math.round(item.price * QPAY_FEE_RATE * 100) / 100;
        const itemOwner = Math.round(item.price * ownerCommission * 100) / 100;
        // AI бүүтийн зургийг зурагчин аваагүй тул зурагчинд хувь очихгүй — үлдсэн нь платформд
        const itemPlatform = item.isAi
          ? Math.round((item.price - itemQpay - itemOwner) * 100) / 100
          : Math.round(item.price * PLATFORM_FEE_RATE * 100) / 100;
        const itemPhotographerPool = item.isAi ? 0 : item.price - itemQpay - itemPlatform - itemOwner;

        return {
          buyer_id: null,
          photo_id: item.photoId,
          album_id: albumId,
          photographer_id: item.photographerId,
          type: item.type,
          print_size: item.printSize,
          gross_amount: item.price,
          qpay_fee_amount: itemQpay,
          platform_fee_amount: itemPlatform,
          owner_amount: itemOwner,
          photographer_pool_amount: itemPhotographerPool,
          photographer_earned_amount: 0,
          settled: false,
          qpay_transaction_id: "",
          qpay_invoice_id: invoiceId,
          buyer_name: buyerName,
          buyer_phone: buyerPhone,
          payment_status: "pending",
        };
      });

      const sum = (k: "qpay_fee_amount" | "platform_fee_amount" | "owner_amount" | "photographer_pool_amount") =>
        Math.round(purchaseRows.reduce((s, r) => s + Number(r[k]), 0) * 100) / 100;
      const qpayFee = sum("qpay_fee_amount");
      const platformFee = sum("platform_fee_amount");
      const ownerTotal = sum("owner_amount");
      const photographerPool = sum("photographer_pool_amount");

      const { error: insertErr } = await db.from("purchases").insert(purchaseRows);
      if (insertErr) {
        console.log("DB INSERT ERROR:", insertErr.message);
        throw new Error(`DB insert failed: ${insertErr.message}`);
      }

      return json({
        invoiceId,
        qrImage: invoice.qr_image,
        qrText: invoice.qr_text,
        urls: invoice.urls ?? [],
        grossTotal,
        qpayFee,
        platformFee,
        ownerTotal,
        photographerPool,
      });
    }

    // CHECK PAYMENT
    if (req.method === "GET" && path.startsWith("/check-payment/")) {
      const invoiceId = path.replace("/check-payment/", "").split("?")[0];
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const paid = await verifyPaid(invoiceId);
      let isPaid = false;
      if (paid.isPaid) {
        isPaid = await processPayment(db, invoiceId, paid.paymentId, paid.paidAmount);
      }

      const { data: purchases } = await db
        .from("purchases")
        .select("id, photo_id, type, print_size, gross_amount, payment_status, photographer_id")
        .eq("qpay_invoice_id", invoiceId);

      return json({ isPaid, purchases: purchases ?? [] });
    }

    // SIGNED URLS
    // ── ҮНЭГҮЙ ЦОМОГ: багцын нэхэмжлэх (зөвхөн цомгийн эзэн / админ) ──
    if (req.method === "POST" && path === "/package-invoice") {
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const uid = await userIdFromRequest(db, req);
      if (!uid) return json({ error: "Нэвтэрнэ үү" }, 401);
      const { albumId, packageCode } = await req.json() as { albumId: string; packageCode: string };
      const { data: album } = await db.from("albums").select("id, name, title, owner_id, is_free").eq("id", albumId).maybeSingle();
      if (!album) return json({ error: "Цомог олдсонгүй" }, 404);
      if (album.owner_id !== uid && !(await isAdmin(db, uid))) return json({ error: "Эрх хүрэлцэхгүй" }, 403);
      if (!album.is_free) return json({ error: "Цомог «Үнэгүй хуваалцах» горимд биш байна" }, 400);
      const pkg = (await freePackages(db)).find(p => p.code === packageCode);
      if (!pkg || !(pkg.price > 0)) return json({ error: "Багц олдсонгүй" }, 400);
      const { count } = await db.from("photo_uploads").select("id", { count: "exact", head: true })
        .eq("album_id", albumId).neq("source", "ai_booth");
      if ((count ?? 0) > pkg.photos) {
        return json({ error: `Цомогт ${count} зураг байна — «${pkg.name}» багц ${pkg.photos} хүртэл зурагтай. Илүү том багц сонгоно уу.` }, 400);
      }
      const token = await qpayToken();
      const invoice = await qpayCreateInvoice(token, {
        invoiceCode: QPAY_INVOICE_CODE,
        senderName: "Zuragchin.mn",
        senderPhone: "",
        description: `Zuragchin.mn - ${pkg.name} багц (${pkg.photos} зураг, ${pkg.days} хоног)`,
        amount: pkg.price,
        callbackUrl: `${SUPABASE_URL}/functions/v1/qpay/callback`,
      });
      const { error: insErr } = await db.from("album_package_orders").insert({
        album_id: albumId, package_code: pkg.code, photos: pkg.photos, days: pkg.days, amount: pkg.price,
        qpay_invoice_id: invoice.invoice_id, created_by: uid,
      });
      if (insErr) throw new Error(`DB insert failed: ${insErr.message}`);
      return json({ invoiceId: invoice.invoice_id, qrImage: invoice.qr_image, qrText: invoice.qr_text, urls: invoice.urls ?? [], amount: pkg.price });
    }

    // ── ҮНЭГҮЙ ЦОМОГ: багцын төлбөр шалгах ──
    if (req.method === "GET" && path.startsWith("/check-package/")) {
      const invoiceId = path.replace("/check-package/", "").split("?")[0];
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const paid = await verifyPaid(invoiceId);
      let ok = false;
      if (paid.isPaid) ok = await processPackage(db, invoiceId, paid.paymentId, paid.paidAmount);
      return json({ isPaid: ok });
    }

    // ── ҮНЭГҮЙ ЦОМОГ: зочин эх зургийг шууд татах холбоос ──
    if (req.method === "POST" && path === "/free-download") {
      const { photoId } = await req.json() as { photoId: string };
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: photo } = await db.from("photo_uploads")
        .select("id, album_id, original_url, filename, source").eq("id", photoId).maybeSingle();
      if (!photo) return json({ error: "Зураг олдсонгүй" }, 404);
      if (photo.source === "ai_booth") return json({ error: "AI бүүтийн зураг төлбөртэй" }, 403);
      const { data: album } = await db.from("albums")
        .select("is_free, free_activated, status, expires_at").eq("id", photo.album_id).maybeSingle();
      if (!album?.is_free || !album.free_activated || album.status !== "active") return json({ error: "Үнэгүй татах боломжгүй" }, 403);
      if (album.expires_at && new Date(album.expires_at).getTime() < Date.now()) return json({ error: "Цомгийн хугацаа дууссан байна" }, 403);
      const storagePath = String(photo.original_url ?? "").replace(/^photos-original\//, "");
      const { data: signed } = await db.storage.from("photos-original").createSignedUrl(storagePath, 3600);
      if (!signed?.signedUrl) return json({ error: "Холбоос үүсгэж чадсангүй" }, 500);
      return json({ signedUrl: signed.signedUrl, filename: photo.filename ?? "photo.jpg" });
    }

    if (req.method === "POST" && path === "/signed-urls") {
      const { invoiceId } = await req.json() as { invoiceId: string };
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { data: purchases } = await db
        .from("purchases")
        .select("id, photo_id, type, photo_uploads(original_url, filename)")
        .eq("qpay_invoice_id", invoiceId)
        .eq("payment_status", "paid");

      if (!purchases || purchases.length === 0) {
        return json({ error: "No paid purchases found" }, 404);
      }

      const signedUrls: { purchaseId: string; signedUrl: string; filename: string; type: string }[] = [];

      for (const p of purchases) {
        if (p.type === "download" && p.photo_uploads?.original_url) {
          const storagePath = (p.photo_uploads.original_url as string).replace("photos-original/", "");
          const { data: signed } = await db.storage
            .from("photos-original")
            .createSignedUrl(storagePath, 86400);
          if (signed?.signedUrl) {
            signedUrls.push({
              purchaseId: p.id,
              signedUrl: signed.signedUrl,
              filename: p.photo_uploads.filename ?? "photo.jpg",
              type: "download",
            });
          }
        } else if (p.type === "print") {
          signedUrls.push({ purchaseId: p.id, signedUrl: "", filename: "", type: "print" });
        }
      }

      return json({ signedUrls });
    }

    return json({ error: "Not found", path }, 404);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("QPay function error:", msg);
    return json({ error: msg }, 500);
  }
});

// deno-lint-ignore no-explicit-any
interface FreePackage { code: string; name: string; photos: number; days: number; price: number }
// deno-lint-ignore no-explicit-any
async function freePackages(db: any): Promise<FreePackage[]> {
  const { data } = await db.from("platform_settings").select("value").eq("key", "free_packages").maybeSingle();
  const arr = Array.isArray(data?.value) ? data.value : [];
  // deno-lint-ignore no-explicit-any
  return arr.map((p: any) => ({ code: String(p.code), name: String(p.name ?? p.code), photos: Number(p.photos), days: Number(p.days), price: Number(p.price) }))
    .filter((p: FreePackage) => p.code && p.photos > 0 && p.days > 0 && p.price >= 0);
}

// deno-lint-ignore no-explicit-any
async function userIdFromRequest(db: any, req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  return data?.user?.id ?? null;
}

// deno-lint-ignore no-explicit-any
async function isAdmin(db: any, uid: string): Promise<boolean> {
  const { data: me } = await db.from("users").select("role").eq("id", uid).maybeSingle();
  const roles = Array.isArray(me?.role) ? me.role : [me?.role];
  return roles.includes("admin");
}

/** Багцын төлбөр — цомгийг идэвхжүүлж, платформын орлогыг нэг л удаа бүртгэнэ */
// deno-lint-ignore no-explicit-any
async function processPackage(db: any, invoiceId: string, paymentId: string, paidAmount: number | null): Promise<boolean> {
  const { data: order } = await db.from("album_package_orders").select("amount, status").eq("qpay_invoice_id", invoiceId).maybeSingle();
  if (!order) return false;
  if (order.status !== "paid" && paidAmount !== null && paidAmount + 0.5 < Number(order.amount)) {
    console.log("PACKAGE AMOUNT MISMATCH:", invoiceId, paidAmount, order.amount);
    return false;
  }
  const { data: res, error } = await db.rpc("apply_album_package", { p_invoice_id: invoiceId, p_payment_id: paymentId });
  if (error) { console.log("PACKAGE APPLY ERROR:", error.message); return false; }
  if (res === "applied") {
    const net = Math.round(Number(order.amount) * (1 - QPAY_FEE_RATE) * 100) / 100;
    await db.rpc("increment_platform_wallet", { p_amount: net });
  }
  return res === "applied" || res === "paid";
}

// deno-lint-ignore no-explicit-any
async function settingNumber(db: any, key: string, fallback: number): Promise<number> {
  const { data } = await db.from("platform_settings").select("value").eq("key", key).maybeSingle();
  const v = Number(data?.value);
  return Number.isFinite(v) ? v : fallback;
}

/** Цомог сунгах нэхэмжлэх төлөгдсөн бол хугацааг сунгаж, платформын орлогод бичнэ. Шинэ дуусах огноог буцаана. */
// deno-lint-ignore no-explicit-any
async function processExtension(db: any, invoiceId: string, paymentId: string, paidAmount: number | null): Promise<string | null> {
  const { data: ext } = await db.from("album_extensions").select("amount, status").eq("qpay_invoice_id", invoiceId).maybeSingle();
  if (!ext) return null;
  if (ext.status !== "paid" && paidAmount !== null && paidAmount + 0.5 < Number(ext.amount)) {
    console.log("EXTENSION AMOUNT MISMATCH:", invoiceId, paidAmount, ext.amount);
    return null;
  }
  const wasPending = ext.status === "pending";
  const { data: newExpiry, error } = await db.rpc("apply_album_extension", { p_invoice_id: invoiceId, p_payment_id: paymentId });
  if (error) { console.log("EXTENSION APPLY ERROR:", error.message); return null; }
  if (wasPending) {
    const net = Math.round(Number(ext.amount) * (1 - QPAY_FEE_RATE) * 100) / 100;
    await db.rpc("increment_platform_wallet", { p_amount: net });
  }
  return newExpiry ? String(newExpiry) : null;
}

/** Нэхэмжлэхийг төлөгдсөн болгож, орлогыг нэг л удаа хуваарилна. Төлөгдсөн бол true. */
async function processPayment(
  // deno-lint-ignore no-explicit-any
  db: any, invoiceId: string, qpayTransactionId: string, paidAmount: number | null,
): Promise<boolean> {
  if (!invoiceId) return false;
  const { data: pending } = await db
    .from("purchases")
    .select("gross_amount, payment_status")
    .eq("qpay_invoice_id", invoiceId);
  if (!pending || pending.length === 0) return false;
  if (pending.every((p: { payment_status: string }) => p.payment_status === "paid")) return true;

  // Төлсөн дүн нэхэмжлэхийн дүнгээс бага бол баталгаажуулахгүй
  const expected = pending.reduce((s: number, p: { gross_amount: number }) => s + Number(p.gross_amount), 0);
  if (paidAmount !== null && paidAmount + 0.5 < expected) {
    console.log("PAID AMOUNT MISMATCH:", invoiceId, paidAmount, expected);
    return false;
  }

  // pending → paid: зөвхөн энэ дуудлага шилжүүлсэн мөрүүдэд орлого тооцно (давхар тооцохоос сэргийлнэ)
  const { data: purchases } = await db
    .from("purchases")
    .update({ payment_status: "paid", qpay_transaction_id: qpayTransactionId })
    .eq("qpay_invoice_id", invoiceId)
    .eq("payment_status", "pending")
    .select("id, photographer_id, album_id, photographer_pool_amount, owner_amount, platform_fee_amount, photo_id");

  if (!purchases || purchases.length === 0) return true;

  const photographerCredits: Record<string, number> = {};
  let totalPlatformFee = 0;

  for (const p of purchases) {
    if (p.photographer_id) {
      photographerCredits[p.photographer_id] =
        (photographerCredits[p.photographer_id] ?? 0) + p.photographer_pool_amount;
    }
    totalPlatformFee += p.platform_fee_amount ?? 0;
  }

  const albumIds = [...new Set(purchases.map((p: { album_id: string }) => p.album_id))];
  const { data: albums } = await db.from("albums").select("id, owner_id, name").in("id", albumIds);
  const albumOwnerMap: Record<string, string> = {};
  const albumNameMap: Record<string, string> = {};
  for (const a of albums ?? []) {
    albumOwnerMap[a.id] = a.owner_id;
    albumNameMap[a.id] = a.name;
  }

  const ownerCredits: Record<string, number> = {};
  for (const p of purchases) {
    const ownerId = albumOwnerMap[p.album_id];
    if (ownerId) ownerCredits[ownerId] = (ownerCredits[ownerId] ?? 0) + p.owner_amount;
  }

  for (const [userId, amount] of Object.entries(photographerCredits)) {
    if (amount > 0) {
      await db.rpc("increment_wallet_pending", { p_user_id: userId, p_amount: amount });
      const photoPurchase = purchases.find((p: { photographer_id: string }) => p.photographer_id === userId);
      await db.from("wallet_transactions").insert({
        user_id: userId,
        amount,
        type: "sale",
        photo_id: photoPurchase?.photo_id ?? null,
        description: `Photo sale — ${albumNameMap[photoPurchase?.album_id] ?? "album"}`,
      });
    }
  }

  for (const [userId, amount] of Object.entries(ownerCredits)) {
    if (amount > 0) {
      await db.rpc("increment_wallet_pending", { p_user_id: userId, p_amount: amount });
      const ownerPurchase = purchases.find((p: { album_id: string }) => albumOwnerMap[p.album_id] === userId);
      await db.from("wallet_transactions").insert({
        user_id: userId,
        amount,
        type: "commission",
        description: `Owner commission — ${albumNameMap[ownerPurchase?.album_id] ?? "album"}`,
      });
    }
  }

  if (totalPlatformFee > 0) {
    await db.rpc("increment_platform_wallet", { p_amount: totalPlatformFee });
  }
  return true;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface CartItem {
  photoId: string;
  photographerId: string;
  type: "download" | "print";
  printSize?: string;
  price: number;
}
