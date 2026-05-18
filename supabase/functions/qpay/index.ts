import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const QPAY_BASE = "https://merchant.qpay.mn/v2";
const QPAY_USERNAME = Deno.env.get("QPAY_USERNAME") ?? "";
const QPAY_PASSWORD = Deno.env.get("QPAY_PASSWORD") ?? "";
const QPAY_INVOICE_CODE = Deno.env.get("QPAY_INVOICE_CODE") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const QPAY_FEE_RATE = 0.01;
const PLATFORM_FEE_RATE = 0.03;
const OWNER_COMMISSION_RATE = 0.10;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/functions\/v1\/qpay/, "").replace(/^\/qpay/, "");

    console.log("REQUEST PATH:", path, "METHOD:", req.method);

    // CALLBACK
    if (req.method === "POST" && path === "/callback") {
      const body = await req.json().catch(() => ({}));
      const invoiceId: string = body.invoice_id ?? "";
      if (!invoiceId) return json({ ok: true });
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await processPayment(db, invoiceId, "");
      return json({ ok: true });
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
        .select("id, owner_id, owner_commission")
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

      const ownerCommission: number = album.owner_commission ?? OWNER_COMMISSION_RATE;
      const grossTotal = cartItems.reduce((s, i) => s + i.price, 0);
      const qpayFee = Math.round(grossTotal * QPAY_FEE_RATE * 100) / 100;
      const platformFee = Math.round(grossTotal * PLATFORM_FEE_RATE * 100) / 100;
      const ownerTotal = Math.round(grossTotal * ownerCommission * 100) / 100;
      const photographerPool = grossTotal - qpayFee - platformFee - ownerTotal;

      console.log("QPAY_INVOICE_CODE:", QPAY_INVOICE_CODE);

      const token = await qpayToken();
      const callbackUrl = `${SUPABASE_URL}/functions/v1/qpay/callback`;

      const invoice = await qpayCreateInvoice(token, {
        invoiceCode: QPAY_INVOICE_CODE,
        senderName: buyerName,
        senderPhone: buyerPhone,
        description: `Zuragchin.mn - ${cartItems.length} photo${cartItems.length !== 1 ? "s" : ""}`,
        amount: grossTotal,
        callbackUrl,
      });

      const invoiceId: string = invoice.invoice_id;

      const purchaseRows = cartItems.map((item) => {
        const itemQpay = Math.round(item.price * QPAY_FEE_RATE * 100) / 100;
        const itemPlatform = Math.round(item.price * PLATFORM_FEE_RATE * 100) / 100;
        const itemOwner = Math.round(item.price * ownerCommission * 100) / 100;
        const itemPhotographerPool = item.price - itemQpay - itemPlatform - itemOwner;

        return {
          buyer_id: null,
          photo_id: item.photoId,
          album_id: albumId,
          photographer_id: item.photographerId ?? album.owner_id,
          type: item.type,
          print_size: item.printSize ?? "",
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

      let isPaid = false;
      let qpayTransactionId = "";

      try {
        const token = await qpayToken();
        const result = await qpayCheckPayment(token, invoiceId);
        isPaid = (result.count ?? 0) > 0;
        if (isPaid && result.rows?.[0]) {
          qpayTransactionId = result.rows[0].payment_id ?? "";
        }
      } catch (e) {
        console.log("CHECK PAYMENT ERROR:", e);
      }

      if (isPaid) {
        await processPayment(db, invoiceId, qpayTransactionId);
      }

      const { data: purchases } = await db
        .from("purchases")
        .select("id, photo_id, type, print_size, gross_amount, payment_status, photographer_id")
        .eq("qpay_invoice_id", invoiceId);

      return json({ isPaid, purchases: purchases ?? [] });
    }

    // SIGNED URLS
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

async function processPayment(db: ReturnType<typeof createClient>, invoiceId: string, qpayTransactionId: string) {
  const { data: purchases } = await db
    .from("purchases")
    .select("id, photographer_id, album_id, photographer_pool_amount, owner_amount, platform_fee_amount, photo_id")
    .eq("qpay_invoice_id", invoiceId)
    .eq("payment_status", "pending");

  if (!purchases || purchases.length === 0) return;

  await db
    .from("purchases")
    .update({ payment_status: "paid", qpay_transaction_id: qpayTransactionId })
    .eq("qpay_invoice_id", invoiceId);

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
