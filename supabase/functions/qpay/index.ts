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
// SMS үйлчилгээ (заавал биш). Жишээ: SMS_API_URL = https://api.example.mn/send?key={key}&from={from}&to={to}&text={text}
const SMS_API_URL = Deno.env.get("SMS_API_URL") ?? "";
const SMS_API_KEY = Deno.env.get("SMS_API_KEY") ?? "";
const SMS_FROM = Deno.env.get("SMS_FROM") ?? "";
const PLATFORM_FEE_RATE = 0.03;
const OWNER_COMMISSION_RATE = 0.10;
const AI_ALBUM_PRICE_DEFAULT = 3000;
const DOWNLOAD_DAYS_DEFAULT = 14;
const SITE_URL = (Deno.env.get("SITE_URL") || "https://zuragchin.mn").replace(/\/+$/, "");

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
        await processListing(db, invoiceId, paid.paymentId, paid.paidAmount);
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
      // Татах хугацаа (14 хоног) дууссан худалдан авалтын хуулбаруудыг устгана
      let purchaseCopies = 0;
      {
        const { data: oldCopies } = await db.from("purchases").select("id")
          .not("file_stamped_at", "is", null).lt("download_expires_at", new Date().toISOString()).limit(1000);
        const ids = (oldCopies ?? []).map((r: { id: string }) => r.id);
        purchaseCopies = ids.length;
        if (!dryRun && ids.length > 0) {
          for (let i = 0; i < ids.length; i += 100) {
            const chunk = ids.slice(i, i + 100);
            await db.storage.from("purchases").remove(chunk.map((id: string) => `${id}.jpg`));
            await db.from("purchases").update({ file_stamped_at: null }).in("id", chunk);
          }
        }
      }
      return json({ dryRun: !!dryRun, purgeAfterDays: purgeDays, albums: report, purchaseCopies });
    }

    // CREATE INVOICE
    if (req.method === "POST" && path === "/create-invoice") {
      const body = await req.json();
      // Нэвтэрсэн худалдан авагч бол захиалгыг түүний бүртгэлд холбоно (нэвтрээгүй бол null)
      let buyerUserId: string | null = null;
      try {
        const dbAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const uid = await userIdFromRequest(dbAuth, req);
        if (uid) {
          const { data: u } = await dbAuth.from("users").select("id").eq("id", uid).maybeSingle();
          if (u) buyerUserId = uid;
        }
      } catch { /* нэвтрээгүй */ }
      const { cartItems, buyerName, buyerPhone, albumId, licenseAccepted } = body as {
        cartItems: CartItem[];
        buyerName: string;
        buyerPhone: string;
        albumId: string;
        licenseAccepted?: boolean;
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
      let { data: photos, error: photoErr } = await db
        .from("photo_uploads")
        .select("id, album_id, photographer_id, print_prices, source, download_price")
        .in("id", photoIds)
        .eq("album_id", albumId);
      if (photoErr) {
        // update-40-ийн SQL ажиллаагүй үед (download_price багана байхгүй)
        ({ data: photos, error: photoErr } = await db
          .from("photo_uploads")
          .select("id, album_id, photographer_id, print_prices, source")
          .in("id", photoIds)
          .eq("album_id", albumId));
      }
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
          // Зураг тус бүрийн үнэ (зурагчин тавьсан) → цомгийн анхдагч үнэ
          // deno-lint-ignore no-explicit-any
          const own = album.is_free ? null : (photo as any).download_price;
          price = isAi ? aiAlbumPrice : (own !== null && own !== undefined ? Number(own) : downloadPrice);
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
      if (pricedItems.some(i => i.type === "download") && licenseAccepted !== true) {
        return json({ error: "Хувийн хэрэглээний нөхцөлийг зөвшөөрнө үү" }, 400);
      }
      const licenseAt = licenseAccepted === true ? new Date().toISOString() : null;


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
          buyer_id: buyerUserId,
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
          ...(item.type === "download" && licenseAt ? { license_accepted_at: licenseAt } : {}),
        };
      });

      const sum = (k: "qpay_fee_amount" | "platform_fee_amount" | "owner_amount" | "photographer_pool_amount") =>
        Math.round(purchaseRows.reduce((s, r) => s + Number(r[k]), 0) * 100) / 100;
      const qpayFee = sum("qpay_fee_amount");
      const platformFee = sum("platform_fee_amount");
      const ownerTotal = sum("owner_amount");
      const photographerPool = sum("photographer_pool_amount");

      let { error: insertErr } = await db.from("purchases").insert(purchaseRows);
      if (insertErr && /license_accepted_at/.test(insertErr.message)) {
        // update-40-ийн SQL ажиллаагүй үед
        // deno-lint-ignore no-unused-vars
        ({ error: insertErr } = await db.from("purchases").insert(purchaseRows.map(({ license_accepted_at, ...r }: any) => r)));
      }
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

    // ── НҮҮР ХУУДСАНД НИЙТЛЭХ: нэхэмжлэх (зөвхөн цомгийн эзэн / админ) ──
    if (req.method === "POST" && path === "/listing-invoice") {
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const uid = await userIdFromRequest(db, req);
      if (!uid) return json({ error: "Нэвтэрнэ үү" }, 401);
      const { albumId, packageCode } = await req.json() as { albumId: string; packageCode: string };
      const { data: album } = await db.from("albums")
        .select("id, name, owner_id, is_free, status, share_link, expires_at, listing_hidden").eq("id", albumId).maybeSingle();
      if (!album) return json({ error: "Цомог олдсонгүй" }, 404);
      if (album.owner_id !== uid && !(await isAdmin(db, uid))) return json({ error: "Эрх хүрэлцэхгүй" }, 403);
      if (album.is_free) return json({ error: "Зөвхөн «Худалдах» горимын цомгийг нийтэлнэ" }, 400);
      if (album.status !== "active" || !album.share_link) return json({ error: "Цомог идэвхтэй биш байна" }, 400);
      if (album.listing_hidden) return json({ error: "Энэ цомгийн нийтлэлийг админ хаасан байна" }, 403);
      if (album.expires_at && new Date(album.expires_at).getTime() < Date.now()) return json({ error: "Цомгийн хугацаа дууссан байна. Эхлээд сунгана уу." }, 400);
      const { count } = await db.from("photo_uploads").select("id", { count: "exact", head: true })
        .eq("album_id", albumId).neq("source", "ai_booth");
      if (!count) return json({ error: "Цомогт зураг алга. Эхлээд зураг оруулна уу." }, 400);
      const pkg = (await listingPackages(db)).find(p => p.code === packageCode);
      if (!pkg || !(pkg.price > 0)) return json({ error: "Багц олдсонгүй" }, 400);
      const token = await qpayToken();
      const invoice = await qpayCreateInvoice(token, {
        invoiceCode: QPAY_INVOICE_CODE,
        senderName: "Zuragchin.mn",
        senderPhone: "",
        description: `Zuragchin.mn - нүүр хуудсанд нийтлэх (${pkg.days} хоног)`,
        amount: pkg.price,
        callbackUrl: `${SUPABASE_URL}/functions/v1/qpay/callback`,
      });
      const { error: insErr } = await db.from("album_listing_orders").insert({
        album_id: albumId, package_code: pkg.code, days: pkg.days, amount: pkg.price,
        qpay_invoice_id: invoice.invoice_id, created_by: uid,
      });
      if (insErr) throw new Error(`DB insert failed: ${insErr.message}`);
      return json({ invoiceId: invoice.invoice_id, qrImage: invoice.qr_image, qrText: invoice.qr_text, urls: invoice.urls ?? [], amount: pkg.price });
    }

    // ── НҮҮР ХУУДСАНД НИЙТЛЭХ: төлбөр шалгах ──
    if (req.method === "GET" && path.startsWith("/check-listing/")) {
      const invoiceId = path.replace("/check-listing/", "").split("?")[0];
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const paid = await verifyPaid(invoiceId);
      let ok = false;
      if (paid.isPaid) ok = await processListing(db, invoiceId, paid.paymentId, paid.paidAmount);
      return json({ isPaid: ok });
    }

    // ── УГААЛГАХ ЗАХИАЛГА ХЭВЛЭХ: эх зургийн холбоос + төлөв «Угаасан» + худалдан авагчид SMS ──
    if (req.method === "POST" && path === "/print-job") {
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const uid = await userIdFromRequest(db, req);
      if (!uid) return json({ error: "Нэвтэрнэ үү" }, 401);
      const { purchaseId } = await req.json() as { purchaseId: string };
      // deno-lint-ignore no-explicit-any
      let p: any = null;
      const full = await db.from("purchases")
        .select("id, type, payment_status, photographer_id, album_id, print_size, print_status, buyer_phone, sms_sent_at, photo_id")
        .eq("id", purchaseId).maybeSingle();
      if (full.error) {
        const basic = await db.from("purchases")
          .select("id, type, payment_status, photographer_id, album_id, print_size, print_status, buyer_phone, photo_id")
          .eq("id", purchaseId).maybeSingle();
        p = basic.data ? { ...basic.data, sms_sent_at: "n/a" } : null;
      } else p = full.data;
      if (!p) return json({ error: "Захиалга олдсонгүй" }, 404);
      if (p.type !== "print" || p.payment_status !== "paid") return json({ error: "Зөвхөн төлөгдсөн угаалгах захиалга" }, 400);
      const { data: album } = await db.from("albums").select("owner_id, contact_info, watermark_type, watermark_value").eq("id", p.album_id).maybeSingle();
      if (p.photographer_id !== uid && album?.owner_id !== uid && !(await isAdmin(db, uid))) return json({ error: "Эрх хүрэлцэхгүй" }, 403);

      const { data: photo } = await db.from("photo_uploads").select("original_url, filename").eq("id", p.photo_id).maybeSingle();
      const storagePath = String(photo?.original_url ?? "").replace(/^photos-original\//, "");
      const { data: signed } = await db.storage.from("photos-original").createSignedUrl(storagePath, 3600);
      if (!signed?.signedUrl) return json({ error: "Эх зураг олдсонгүй" }, 404);

      if (p.print_status === "pending") {
        await db.from("purchases").update({ print_status: "printed", print_status_updated_at: new Date().toISOString() }).eq("id", p.id);
      }

      // Хэвлэсэн хүний утас: зурагчны профайл → цомгийн холбоо барих
      const { data: prof } = await db.from("photographer_profiles").select("phone").eq("user_id", uid).maybeSingle();
      const contactPhone = String(prof?.phone || album?.contact_info?.phone || "").trim();
      const smsText = `Zuragchin.mn: Tanii ugaalgah zurag beltgegdlee. ${contactPhone ? contactPhone + " dugaartai zuragchnaas" : "Zuragchnaas"} zurgaa avna uu.`;
      const buyerPhone = String(p.buyer_phone ?? "").replace(/\D/g, "");
      let sms: "sent" | "already" | "not_configured" | "failed" | "no_phone" = "not_configured";
      if (!/^\d{8}$/.test(buyerPhone)) sms = "no_phone";
      else if (p.sms_sent_at && p.sms_sent_at !== "n/a") sms = "already";
      else if (SMS_API_URL) {
        try {
          const url = SMS_API_URL
            .replace("{key}", encodeURIComponent(SMS_API_KEY))
            .replace("{from}", encodeURIComponent(SMS_FROM))
            .replace("{to}", encodeURIComponent(buyerPhone))
            .replace("{text}", encodeURIComponent(smsText));
          const r = await fetch(url);
          const body = await r.text();
          console.log("SMS:", r.status, body.slice(0, 200));
          sms = r.ok ? "sent" : "failed";
          if (sms === "sent" && p.sms_sent_at !== "n/a") await db.from("purchases").update({ sms_sent_at: new Date().toISOString() }).eq("id", p.id);
        } catch (e) {
          console.log("SMS ERROR:", e instanceof Error ? e.message : e);
          sms = "failed";
        }
      }
      return json({ signedUrl: signed.signedUrl, filename: photo?.filename ?? "photo.jpg", size: p.print_size, sms, smsText, buyerPhone, brand: album?.watermark_type === "layers" ? (album?.watermark_value ?? "") : "" });
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

    // ── Худалдан авсан зургийн татах холбоосууд (төлсний дараа 14 хоног) ──
    if (req.method === "POST" && path === "/signed-urls") {
      const { invoiceId } = await req.json() as { invoiceId: string };
      if (!invoiceId) return json({ error: "invoiceId дутуу" }, 400);
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      let res = await db
        .from("purchases")
        .select("id, photo_id, type, download_expires_at, photo_uploads(original_url, filename)")
        .eq("qpay_invoice_id", invoiceId)
        .eq("payment_status", "paid");
      if (res.error) {
        // update-40-ийн SQL ажиллаагүй үед
        res = await db.from("purchases")
          .select("id, photo_id, type, photo_uploads(original_url, filename)")
          .eq("qpay_invoice_id", invoiceId).eq("payment_status", "paid");
      }
      // deno-lint-ignore no-explicit-any
      const purchases = res.data as any[] | null;
      if (!purchases || purchases.length === 0) {
        return json({ error: "No paid purchases found" }, 404);
      }

      const signedUrls: { purchaseId: string; signedUrl: string; filename: string; type: string; expiresAt: string | null; expired: boolean }[] = [];
      for (const p of purchases) {
        if (p.type === "download" && p.photo_uploads?.original_url) {
          const expiresAt: string | null = p.download_expires_at ?? null;
          const expired = !!expiresAt && new Date(expiresAt).getTime() < Date.now();
          signedUrls.push({
            purchaseId: p.id,
            // Захиалгын ID суулгасан файлыг энэ функц өөрөө өгнө (доорх /file)
            signedUrl: expired ? "" : `${SUPABASE_URL}/functions/v1/qpay/file/${p.id}?inv=${encodeURIComponent(invoiceId)}`,
            filename: p.photo_uploads.filename ?? "photo.jpg",
            type: "download",
            expiresAt,
            expired,
          });
        } else if (p.type === "print") {
          signedUrls.push({ purchaseId: p.id, signedUrl: "", filename: "", type: "print", expiresAt: null, expired: false });
        }
      }
      return json({ signedUrls });
    }

    // ── Худалдан авсан нэг зургийн файл: захиалгын ID суулгасан хуулбар руу чиглүүлнэ ──
    if (req.method === "GET" && path.startsWith("/file/")) {
      const purchaseId = path.replace("/file/", "").split("?")[0];
      const inv = url.searchParams.get("inv") ?? "";
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      // deno-lint-ignore no-explicit-any
      const { data: p } = await db.from("purchases")
        .select("id, type, payment_status, qpay_invoice_id, download_expires_at, file_stamped_at, download_count, buyer_phone, created_at, photo_id, album_id, photographer_id")
        .eq("id", purchaseId).maybeSingle() as { data: any };
      if (!p || !inv || p.qpay_invoice_id !== inv) return json({ error: "Захиалга олдсонгүй" }, 404);
      if (p.type !== "download" || p.payment_status !== "paid") return json({ error: "Татах эрхгүй" }, 403);
      if (p.download_expires_at && new Date(p.download_expires_at).getTime() < Date.now()) {
        return json({ error: "Татах хугацаа дууссан. Зураг устгагдсан." }, 410);
      }

      const copyPath = `${p.id}.jpg`;
      if (!p.file_stamped_at) {
        const { data: photo } = await db.from("photo_uploads").select("original_url, filename").eq("id", p.photo_id).maybeSingle();
        const storagePath = String(photo?.original_url ?? "").replace(/^photos-original\//, "");
        const { data: blob, error: dlErr } = await db.storage.from("photos-original").download(storagePath);
        if (dlErr || !blob) return json({ error: "Эх зураг олдсонгүй" }, 404);
        const bytes = new Uint8Array(await blob.arrayBuffer());

        const { data: ph } = await db.from("photographer_profiles").select("display_name").eq("user_id", p.photographer_id).maybeSingle();
        const { data: pu } = ph?.display_name ? { data: null } : await db.from("users").select("name").eq("id", p.photographer_id).maybeSingle();
        const author = String(ph?.display_name || pu?.name || "Zuragchin.mn photographer");
        const stamped = stampJpeg(bytes, {
          orderCode: orderCode(p.id),
          purchaseId: p.id,
          author,
          buyer: maskPhone(String(p.buyer_phone ?? "")),
          date: String(p.created_at ?? "").slice(0, 10),
        });
        const { error: upErr } = await db.storage.from("purchases").upload(copyPath, stamped, {
          contentType: blob.type || "image/jpeg", upsert: true,
        });
        if (upErr) {
          // Хуулбар хадгалж чадаагүй ч зочныг хүлээлгэхгүй — шууд өгнө
          console.log("STAMP UPLOAD ERROR:", upErr.message);
          return new Response(stamped, { status: 200, headers: { ...corsHeaders, "Content-Type": blob.type || "image/jpeg", "Cache-Control": "private, no-store" } });
        }
        await db.from("purchases").update({ file_stamped_at: new Date().toISOString() }).eq("id", p.id);
      }
      await db.from("purchases").update({ download_count: Number(p.download_count ?? 0) + 1 }).eq("id", p.id);
      const { data: signed } = await db.storage.from("purchases").createSignedUrl(copyPath, 600);
      if (!signed?.signedUrl) return json({ error: "Холбоос үүсгэж чадсангүй" }, 500);
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: signed.signedUrl, "Cache-Control": "no-store" } });
    }

    // ── ҮНИЙН САНАЛ: зочин илгээнэ ──
    if (req.method === "POST" && path === "/offer-submit") {
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const body = await req.json().catch(() => ({}));
      const photoId = String(body.photoId ?? "");
      const amount = Math.round(Number(body.amount));
      const buyerName = String(body.buyerName ?? "").trim().slice(0, 80);
      const buyerPhone = String(body.buyerPhone ?? "").replace(/\D/g, "");
      const message = String(body.message ?? "").trim().slice(0, 300);
      if (!buyerName || !/^\d{8}$/.test(buyerPhone)) return json({ error: "Нэр, 8 оронтой утасны дугаараа зөв оруулна уу" }, 400);
      if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Саналын дүнгээ оруулна уу" }, 400);

      // deno-lint-ignore no-explicit-any
      const { data: photo } = await db.from("photo_uploads").select("id, album_id, photographer_id, source, download_price").eq("id", photoId).maybeSingle() as { data: any };
      if (!photo) return json({ error: "Зураг олдсонгүй" }, 404);
      if (photo.source === "ai_booth") return json({ error: "AI бүүтийн зурагт санал илгээх боломжгүй" }, 400);
      // deno-lint-ignore no-explicit-any
      const { data: album } = await db.from("albums").select("id, name, title, owner_id, is_free, download_price, status, expires_at, accept_offers, offer_auto_accept_ratio").eq("id", photo.album_id).maybeSingle() as { data: any };
      if (!album || album.status !== "active" || album.is_free) return json({ error: "Энэ цомогт санал илгээх боломжгүй" }, 400);
      if (album.expires_at && new Date(album.expires_at).getTime() < Date.now()) return json({ error: "Цомгийн хугацаа дууссан байна" }, 400);
      if (album.accept_offers === false) return json({ error: "Зурагчин энэ цомогт үнийн санал хүлээн авахгүй байна" }, 400);

      const listPrice = Number(photo.download_price ?? album.download_price ?? 0);
      if (!(listPrice > 0)) return json({ error: "Энэ зураг үнэгүй байна" }, 400);
      if (amount >= listPrice) return json({ error: "Санал зургийн үнээс бага байх ёстой — үнээрээ шууд худалдаж авна уу" }, 400);
      const minRatio = await settingNumber(db, "offer_min_ratio", 0.5);
      const minAmount = Math.ceil(listPrice * minRatio);
      if (amount < minAmount) return json({ error: `Санал хамгийн багадаа ${minAmount.toLocaleString("en-US")}₮ байна` }, 400);

      // Спамаас хамгаалах: нэг утаснаас нэг зурагт 24 цагт 1, нийт 24 цагт 10 санал
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const { count: samePhoto } = await db.from("price_offers").select("id", { count: "exact", head: true })
        .eq("buyer_phone", buyerPhone).eq("photo_id", photoId).gte("created_at", dayAgo);
      if ((samePhoto ?? 0) > 0) return json({ error: "Энэ зурагт 24 цагт нэг л санал илгээнэ" }, 429);
      const { count: allPhoto } = await db.from("price_offers").select("id", { count: "exact", head: true })
        .eq("buyer_phone", buyerPhone).gte("created_at", dayAgo);
      if ((allPhoto ?? 0) >= 10) return json({ error: "Өнөөдөр хэт олон санал илгээсэн байна. Маргааш дахин оролдоно уу." }, 429);

      let buyerId: string | null = null;
      try { buyerId = await userIdFromRequest(db, req); } catch { /* нэвтрээгүй */ }
      if (buyerId) {
        const { data: u } = await db.from("users").select("id").eq("id", buyerId).maybeSingle();
        if (!u) buyerId = null;
      }

      const respondHours = await settingNumber(db, "offer_response_hours", 48);
      const payHours = await settingNumber(db, "offer_pay_hours", 24);
      const autoRatio = Number(album.offer_auto_accept_ratio ?? 0);
      const auto = autoRatio > 0 && amount >= listPrice * autoRatio;
      const now = Date.now();
      const { data: offer, error: insErr } = await db.from("price_offers").insert({
        photo_id: photoId, album_id: album.id,
        photographer_id: photo.photographer_id ?? album.owner_id,
        buyer_id: buyerId, buyer_name: buyerName, buyer_phone: buyerPhone, message,
        list_price: listPrice, offer_amount: amount,
        status: auto ? "accepted" : "pending",
        auto_accepted: auto,
        final_amount: auto ? amount : null,
        respond_by: new Date(now + respondHours * 3600000).toISOString(),
        pay_by: auto ? new Date(now + payHours * 3600000).toISOString() : null,
        responded_at: auto ? new Date(now).toISOString() : null,
      }).select("id, token, status").single();
      if (insErr || !offer) return json({ error: "Санал хадгалж чадсангүй: " + (insErr?.message ?? "") }, 500);

      if (!auto) {
        // Зурагчинд SMS (тохируулсан бол)
        const { data: prof } = await db.from("photographer_profiles").select("phone").eq("user_id", photo.photographer_id ?? album.owner_id).maybeSingle();
        const phone = String(prof?.phone ?? "").replace(/\D/g, "");
        if (/^\d{8}$/.test(phone)) {
          await sendSms(phone, `Zuragchin.mn: Tanii zurgand ${amount}T unii sanal irlee. ${SITE_URL}/dashboard/offers`);
        }
      }
      return json({ token: offer.token, status: offer.status, autoAccepted: auto });
    }

    // ── ҮНИЙН САНАЛ: зочин саналынхаа төлөвийг харна ──
    if (req.method === "GET" && path.startsWith("/offer/")) {
      const token = path.replace("/offer/", "").split("?")[0];
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      // deno-lint-ignore no-explicit-any
      const o = await offerByToken(db, token) as any;
      if (!o) return json({ error: "Санал олдсонгүй" }, 404);
      const { data: photo } = await db.from("photo_uploads").select("preview_url, filename").eq("id", o.photo_id).maybeSingle();
      const { data: album } = await db.from("albums").select("name, title, share_link").eq("id", o.album_id).maybeSingle();
      return json({
        status: o.status, listPrice: Number(o.list_price), offerAmount: Number(o.offer_amount),
        counterAmount: o.counter_amount !== null ? Number(o.counter_amount) : null,
        finalAmount: o.final_amount !== null ? Number(o.final_amount) : null,
        respondBy: o.respond_by, payBy: o.pay_by, invoiceId: o.status === "paid" ? o.qpay_invoice_id : null,
        buyerName: o.buyer_name, previewUrl: photo?.preview_url ?? "", filename: photo?.filename ?? "",
        albumName: album?.title || album?.name || "", albumLink: String(album?.share_link ?? "").replace(/^\/album\//, ""),
      });
    }

    // ── ҮНИЙН САНАЛ: зурагчин / цомгийн эзэн хариулна ──
    if (req.method === "POST" && path === "/offer-respond") {
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const uid = await userIdFromRequest(db, req);
      if (!uid) return json({ error: "Нэвтэрнэ үү" }, 401);
      const { offerId, action, counterAmount } = await req.json() as { offerId: string; action: "accept" | "reject" | "counter"; counterAmount?: number };
      // deno-lint-ignore no-explicit-any
      const o = await expireOffer(db, (await db.from("price_offers").select("*").eq("id", offerId).maybeSingle()).data) as any;
      if (!o) return json({ error: "Санал олдсонгүй" }, 404);
      const { data: album } = await db.from("albums").select("owner_id").eq("id", o.album_id).maybeSingle();
      if (o.photographer_id !== uid && album?.owner_id !== uid && !(await isAdmin(db, uid))) return json({ error: "Эрх хүрэлцэхгүй" }, 403);
      if (o.status !== "pending") return json({ error: "Энэ саналд аль хэдийн хариулсан эсвэл хугацаа дууссан" }, 400);

      const payHours = await settingNumber(db, "offer_pay_hours", 24);
      const respondHours = await settingNumber(db, "offer_response_hours", 48);
      const now = Date.now();
      // deno-lint-ignore no-explicit-any
      let patch: Record<string, any>;
      let sms = "";
      const link = `${SITE_URL}/offer/${o.token}`;
      if (action === "accept") {
        patch = { status: "accepted", final_amount: o.offer_amount, pay_by: new Date(now + payHours * 3600000).toISOString() };
        sms = `Zuragchin.mn: Tanii ${Number(o.offer_amount)}T sanaliig zuragchin zuvshuurlee. ${payHours} tsagiin dotor tulnu uu: ${link}`;
      } else if (action === "reject") {
        patch = { status: "rejected" };
        sms = `Zuragchin.mn: Uuchlaarai, tanii unii sanaliig zuragchin huleen avsangui. ${link}`;
      } else if (action === "counter") {
        const c = Math.round(Number(counterAmount));
        if (!(c > Number(o.offer_amount)) || !(c < Number(o.list_price))) {
          return json({ error: "Эсрэг санал зочны саналаас их, зургийн үнээс бага байна" }, 400);
        }
        patch = { status: "countered", counter_amount: c, respond_by: new Date(now + respondHours * 3600000).toISOString() };
        sms = `Zuragchin.mn: Zuragchin ${c}T une sanal bolgoloo. Zuvshuuruh bol: ${link}`;
      } else return json({ error: "Буруу үйлдэл" }, 400);

      const { error: upErr } = await db.from("price_offers")
        .update({ ...patch, responded_at: new Date(now).toISOString() })
        .eq("id", o.id).eq("status", "pending");
      if (upErr) return json({ error: upErr.message }, 500);
      const smsResult = await sendSms(String(o.buyer_phone ?? ""), sms);
      return json({ ok: true, status: patch.status, sms: smsResult, link });
    }

    // ── ҮНИЙН САНАЛ: зочин зурагчны эсрэг саналыг зөвшөөрөх / татгалзах ──
    if (req.method === "POST" && path === "/offer-buyer-respond") {
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { token, action } = await req.json() as { token: string; action: "accept" | "decline" };
      // deno-lint-ignore no-explicit-any
      const o = await offerByToken(db, token) as any;
      if (!o) return json({ error: "Санал олдсонгүй" }, 404);
      if (o.status !== "countered") return json({ error: "Хариулах боломжгүй төлөв" }, 400);
      const payHours = await settingNumber(db, "offer_pay_hours", 24);
      const patch = action === "accept"
        ? { status: "accepted", final_amount: o.counter_amount, pay_by: new Date(Date.now() + payHours * 3600000).toISOString() }
        : { status: "cancelled" };
      await db.from("price_offers").update(patch).eq("id", o.id).eq("status", "countered");
      return json({ ok: true, status: patch.status });
    }

    // ── ҮНИЙН САНАЛ: зөвшөөрөгдсөн үнээр QPay нэхэмжлэх ──
    if (req.method === "POST" && path === "/offer-invoice") {
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { token, licenseAccepted } = await req.json() as { token: string; licenseAccepted?: boolean };
      if (licenseAccepted !== true) return json({ error: "Хувийн хэрэглээний нөхцөлийг зөвшөөрнө үү" }, 400);
      // deno-lint-ignore no-explicit-any
      const o = await offerByToken(db, token) as any;
      if (!o) return json({ error: "Санал олдсонгүй" }, 404);
      if (o.status !== "accepted") return json({ error: o.status === "paid" ? "Аль хэдийн төлөгдсөн" : "Санал зөвшөөрөгдөөгүй эсвэл хугацаа дууссан" }, 400);
      const amount = Number(o.final_amount ?? 0);
      if (!(amount > 0)) return json({ error: "Дүн буруу" }, 400);
      // deno-lint-ignore no-explicit-any
      const { data: album } = await db.from("albums").select("id, owner_id, owner_commission, status, expires_at").eq("id", o.album_id).maybeSingle() as { data: any };
      if (!album || album.status !== "active") return json({ error: "Цомог идэвхгүй байна" }, 400);
      if (album.expires_at && new Date(album.expires_at).getTime() < Date.now()) return json({ error: "Цомгийн хугацаа дууссан байна" }, 400);

      // Өмнө үүссэн нэхэмжлэх: төлөгдсөн бол баталгаажуулна, үгүй бол QPay дээр цуцлаад шинээр үүсгэнэ
      if (o.qpay_invoice_id) {
        const prev = await verifyPaid(o.qpay_invoice_id).catch(() => ({ isPaid: false, paymentId: "", paidAmount: null }));
        if (prev.isPaid) {
          await processPayment(db, o.qpay_invoice_id, prev.paymentId, prev.paidAmount);
          return json({ alreadyPaid: true, invoiceId: o.qpay_invoice_id });
        }
        await qpayCancelInvoice(o.qpay_invoice_id);
        await db.from("purchases").delete().eq("qpay_invoice_id", o.qpay_invoice_id).eq("payment_status", "pending");
      }
      const qpay = await qpayToken();
      const invoice = await qpayCreateInvoice(qpay, {
        invoiceCode: QPAY_INVOICE_CODE,
        senderName: o.buyer_name, senderPhone: o.buyer_phone,
        description: "Zuragchin.mn - 1 photo (offer)",
        amount, callbackUrl: `${SUPABASE_URL}/functions/v1/qpay/callback`,
      });
      const ownerCommission: number = album.owner_commission ?? OWNER_COMMISSION_RATE;
      const itemQpay = Math.round(amount * QPAY_FEE_RATE * 100) / 100;
      const itemOwner = Math.round(amount * ownerCommission * 100) / 100;
      const itemPlatform = Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
      const { error: insErr } = await db.from("purchases").insert({
        buyer_id: o.buyer_id, photo_id: o.photo_id, album_id: o.album_id,
        photographer_id: o.photographer_id ?? album.owner_id,
        type: "download", print_size: "", gross_amount: amount,
        qpay_fee_amount: itemQpay, platform_fee_amount: itemPlatform, owner_amount: itemOwner,
        photographer_pool_amount: amount - itemQpay - itemPlatform - itemOwner,
        photographer_earned_amount: 0, settled: false, qpay_transaction_id: "",
        qpay_invoice_id: invoice.invoice_id, buyer_name: o.buyer_name, buyer_phone: o.buyer_phone,
        payment_status: "pending", license_accepted_at: new Date().toISOString(), offer_id: o.id,
      });
      if (insErr) return json({ error: "Захиалга хадгалж чадсангүй: " + insErr.message }, 500);
      await db.from("price_offers").update({ qpay_invoice_id: invoice.invoice_id }).eq("id", o.id);
      return json({ invoiceId: invoice.invoice_id, qrImage: invoice.qr_image, qrText: invoice.qr_text, urls: invoice.urls ?? [], amount });
    }

    // ── Зурагчин: сошиалаас олсон зургийн захиалгын ID-г шалгах ──
    if (req.method === "POST" && path === "/trace-purchase") {
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const uid = await userIdFromRequest(db, req);
      if (!uid) return json({ error: "Нэвтэрнэ үү" }, 401);
      const { purchaseId, orderCode: code } = await req.json() as { purchaseId?: string; orderCode?: string };
      // deno-lint-ignore no-explicit-any
      let p: any = null;
      if (purchaseId && /^[0-9a-f-]{36}$/i.test(purchaseId)) {
        p = (await db.from("purchases").select("id, created_at, buyer_name, buyer_phone, photographer_id, album_id, photo_id, gross_amount, license_accepted_at, download_count").eq("id", purchaseId).maybeSingle()).data;
      }
      if (!p) return json({ error: "Энэ кодоор худалдан авалт олдсонгүй" + (code ? ` (${code})` : "") }, 404);
      const { data: album } = await db.from("albums").select("owner_id, name, title").eq("id", p.album_id).maybeSingle();
      const admin = await isAdmin(db, uid);
      if (p.photographer_id !== uid && album?.owner_id !== uid && !admin) return json({ error: "Энэ зураг таных биш байна" }, 403);
      const { data: photo } = await db.from("photo_uploads").select("filename, preview_url").eq("id", p.photo_id).maybeSingle();
      return json({
        orderCode: orderCode(p.id), purchasedAt: p.created_at, buyerName: p.buyer_name,
        buyerPhone: admin ? p.buyer_phone : maskPhone(String(p.buyer_phone ?? "")),
        amount: Number(p.gross_amount), licenseAcceptedAt: p.license_accepted_at ?? null, downloadCount: p.download_count ?? 0,
        albumName: album?.title || album?.name || "", filename: photo?.filename ?? "", previewUrl: photo?.preview_url ?? "",
      });
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

interface ListingPackage { code: string; name: string; days: number; price: number }
// deno-lint-ignore no-explicit-any
async function listingPackages(db: any): Promise<ListingPackage[]> {
  const { data } = await db.from("platform_settings").select("value").eq("key", "listing_packages").maybeSingle();
  const arr = Array.isArray(data?.value) ? data.value : [];
  // deno-lint-ignore no-explicit-any
  return arr.map((p: any) => ({ code: String(p.code), name: String(p.name ?? p.code), days: Number(p.days), price: Number(p.price) }))
    .filter((p: ListingPackage) => p.code && p.days > 0 && p.price > 0);
}

/** Нийтлэлийн төлбөр — хугацааг сунгаж, платформын орлогыг нэг л удаа бүртгэнэ */
// deno-lint-ignore no-explicit-any
async function processListing(db: any, invoiceId: string, paymentId: string, paidAmount: number | null): Promise<boolean> {
  const { data: order } = await db.from("album_listing_orders").select("amount, status").eq("qpay_invoice_id", invoiceId).maybeSingle();
  if (!order) return false;
  if (order.status !== "paid" && paidAmount !== null && paidAmount + 0.5 < Number(order.amount)) {
    console.log("LISTING AMOUNT MISMATCH:", invoiceId, paidAmount, order.amount);
    return false;
  }
  const { data: res, error } = await db.rpc("apply_album_listing", { p_invoice_id: invoiceId, p_payment_id: paymentId });
  if (error) { console.log("LISTING APPLY ERROR:", error.message); return false; }
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

  // Татах хугацаа: төлбөр баталгаажсанаас хойш N хоног (анхдагч 14). Нэг л удаа тавигдана.
  try {
    const days = await settingNumber(db, "purchase_download_days", DOWNLOAD_DAYS_DEFAULT);
    await db.from("purchases")
      .update({ download_expires_at: new Date(Date.now() + days * 86400000).toISOString() })
      .eq("qpay_invoice_id", invoiceId).eq("type", "download").is("download_expires_at", null);
    await db.from("price_offers").update({ status: "paid" })
      .eq("qpay_invoice_id", invoiceId).in("status", ["accepted", "cancelled"]);
  } catch (e) {
    console.log("DOWNLOAD EXPIRY/OFFER UPDATE SKIPPED:", e instanceof Error ? e.message : e);
  }

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

// ── Үнийн саналын туслахууд ─────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function offerByToken(db: any, token: string) {
  if (!/^[0-9a-f]{32,80}$/i.test(String(token ?? ""))) return null;
  const { data } = await db.from("price_offers").select("*").eq("token", token).maybeSingle();
  return await expireOffer(db, data);
}

/** Хугацаа нь дууссан саналыг «cancelled» болгоно (cron хэрэггүй — уншихад шалгана) */
// deno-lint-ignore no-explicit-any
async function expireOffer(db: any, o: any) {
  if (!o) return null;
  const now = Date.now();
  const late = ((o.status === "pending" || o.status === "countered") && o.respond_by && new Date(o.respond_by).getTime() < now)
    || (o.status === "accepted" && o.pay_by && new Date(o.pay_by).getTime() < now);
  if (late) {
    await db.from("price_offers").update({ status: "cancelled" }).eq("id", o.id).eq("status", o.status);
    return { ...o, status: "cancelled" };
  }
  return o;
}

async function qpayCancelInvoice(invoiceId: string) {
  try {
    const token = await qpayToken();
    const res = await fetch(`${QPAY_BASE}/invoice/${encodeURIComponent(invoiceId)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    console.log("INVOICE CANCEL:", invoiceId, res.status);
  } catch (e) {
    console.log("INVOICE CANCEL ERROR:", e instanceof Error ? e.message : e);
  }
}

/** SMS илгээх (SMS_API_URL тохируулсан бол). Үр дүнг буцаана, алдаа шидэхгүй. */
async function sendSms(phoneRaw: string, text: string): Promise<"sent" | "failed" | "not_configured" | "no_phone"> {
  const phone = String(phoneRaw ?? "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(phone)) return "no_phone";
  if (!SMS_API_URL) return "not_configured";
  try {
    const u = SMS_API_URL
      .replace("{key}", encodeURIComponent(SMS_API_KEY))
      .replace("{from}", encodeURIComponent(SMS_FROM))
      .replace("{to}", encodeURIComponent(phone))
      .replace("{text}", encodeURIComponent(text));
    const r = await fetch(u);
    console.log("SMS:", r.status, (await r.text()).slice(0, 200));
    return r.ok ? "sent" : "failed";
  } catch (e) {
    console.log("SMS ERROR:", e instanceof Error ? e.message : e);
    return "failed";
  }
}

// ── Худалдан авсан файлд захиалгын ID суулгах ──────────────────────────────
function orderCode(purchaseId: string): string {
  return "ZM-" + purchaseId.replace(/-/g, "").slice(0, 10).toUpperCase();
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length >= 8 ? `${d.slice(0, 2)}****${d.slice(-2)}` : "";
}

function xmlEscape(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";

/**
 * JPEG файлд зохиогчийн эрх, захиалгын ID-тай XMP + тайлбар (COM) сегмент суулгана.
 * Зургийн пикселд хүрэхгүй (чанар өөрчлөгдөхгүй). JPEG биш бол өөрчлөхгүй буцаана.
 */
function stampJpeg(bytes: Uint8Array, info: { orderCode: string; purchaseId: string; author: string; buyer: string; date: string }): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const enc = new TextEncoder();
  const terms = "Хувийн хэрэглээний лиценз. Дахин худалдах, арилжааны зорилгоор ашиглах, файлаар түгээхийг хориглоно. / Personal use only. Resale or commercial use prohibited.";
  const rights = `© ${info.author} — Zuragchin.mn`;
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:zm="https://zuragchin.mn/ns/1.0/">` +
    `<dc:creator><rdf:Seq><rdf:li>${xmlEscape(info.author)}</rdf:li></rdf:Seq></dc:creator>` +
    `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(rights)}</rdf:li></rdf:Alt></dc:rights>` +
    `<xmpRights:Marked>True</xmpRights:Marked>` +
    `<xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(terms)}</rdf:li></rdf:Alt></xmpRights:UsageTerms>` +
    `<zm:Order>${info.orderCode}</zm:Order><zm:Purchase>${info.purchaseId}</zm:Purchase>` +
    `<zm:Buyer>${xmlEscape(info.buyer)}</zm:Buyer><zm:Date>${xmlEscape(info.date)}</zm:Date>` +
    `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const comment = `Zuragchin.mn ${info.orderCode} purchase:${info.purchaseId} ${rights}. Personal use only.`;

  const segment = (marker: number, payload: Uint8Array) => {
    const len = payload.length + 2;
    const out = new Uint8Array(len + 2);
    out[0] = 0xff; out[1] = marker; out[2] = (len >> 8) & 0xff; out[3] = len & 0xff;
    out.set(payload, 4);
    return out;
  };
  const xmpPayload = enc.encode(XMP_HEADER + xmp);
  if (xmpPayload.length > 65000) return bytes;
  const xmpSeg = segment(0xe1, xmpPayload);
  const comSeg = segment(0xfe, enc.encode(comment));

  // SOI-ийн дараах APPn/COM сегментүүдийг алгасаж, хуучин XMP-г хасна
  const keep: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  const xmpSig = enc.encode(XMP_HEADER);
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (!isApp && marker !== 0xfe) break;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2 || i + 2 + len > bytes.length) return bytes; // эвдэрсэн бол хөндөхгүй
    const seg = bytes.subarray(i, i + 2 + len);
    const isXmp = marker === 0xe1 && xmpSig.every((b, k) => seg[4 + k] === b);
    if (!isXmp) keep.push(seg);
    i += 2 + len;
  }
  keep.push(xmpSeg, comSeg, bytes.subarray(i));
  const total = keep.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of keep) { out.set(a, o); o += a.length; }
  return out;
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
