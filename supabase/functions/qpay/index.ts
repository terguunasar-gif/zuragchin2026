import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const QPAY_BASE = "https://merchant-sandbox.qpay.mn/v2";
const QPAY_USERNAME = Deno.env.get("VITE_QPAY_USERNAME") ?? "";
const QPAY_PASSWORD = Deno.env.get("VITE_QPAY_PASSWORD") ?? "";
const QPAY_INVOICE_CODE = Deno.env.get("VITE_QPAY_INVOICE_CODE") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Fee rates
const QPAY_FEE_RATE = 0.01;
const PLATFORM_FEE_RATE = 0.03;
const OWNER_COMMISSION_RATE = 0.10;

// ── QPay helpers ──────────────────────────────────────────────────────────────

async function qpayToken(): Promise<string> {
  const creds = btoa(`${QPAY_USERNAME}:${QPAY_PASSWORD}`);
  const res = await fetch(`${QPAY_BASE}/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}` },
  });
  if (!res.ok) throw new Error(`QPay auth failed: ${res.status}`);
  const data = await res.json();
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
  const res = await fetch(`${QPAY_BASE}/invoice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      invoice_code: params.invoiceCode,
      sender_invoice_no: crypto.randomUUID().slice(0, 16),
      invoice_receiver_code: "terminal",
      sender_branch_code: "BRANCH1",
      invoice_description: params.description,
      sender_staff_code: "online",
      amount: params.amount,
      callback_url: params.callbackUrl,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`QPay invoice creation failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function qpayCheckPayment(token: string, invoiceId: string) {
  const res = await fetch(`${QPAY_BASE}/payment/check/${invoiceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`QPay check failed: ${res.status}`);
  return res.json();
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/qpay/, "");

    // ── POST /create-invoice ──────────────────────────────────────────────────
    if (req.method === "POST" && path === "/create-invoice") {
      const body = await req.json();
      const { cartItems, buyerName, buyerPhone, albumId } = body as {
        cartItems: CartItem[];
        buyerName: string;
        buyerPhone: string;
        albumId: string;
      };

      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Fetch album for owner_commission
      const { data: album } = await db
        .from("albums")
        .select("id, owner_id, owner_commission")
        .eq("id", albumId)
        .maybeSingle();

      if (!album) {
        return json({ error: "Album not found" }, 404);
      }

      const ownerCommission: number = album.owner_commission ?? OWNER_COMMISSION_RATE;

      // Calculate totals
      const grossTotal = cartItems.reduce((s, i) => s + i.price, 0);
      const qpayFee = Math.round(grossTotal * QPAY_FEE_RATE * 100) / 100;
      const platformFee = Math.round(grossTotal * PLATFORM_FEE_RATE * 100) / 100;
      const ownerTotal = Math.round(grossTotal * ownerCommission * 100) / 100;
      const photographerPool = grossTotal - qpayFee - platformFee - ownerTotal;

      // Get QPay token
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

      // Insert pending purchases (one row per cart item)
      const purchaseRows = cartItems.map((item) => {
        const itemQpay = Math.round(item.price * QPAY_FEE_RATE * 100) / 100;
        const itemPlatform = Math.round(item.price * PLATFORM_FEE_RATE * 100) / 100;
        const itemOwner = Math.round(item.price * ownerCommission * 100) / 100;
        const itemPhotographerPool = item.price - itemQpay - itemPlatform - itemOwner;

        return {
          buyer_id: null,
          photo_id: item.photoId,
          album_id: albumId,
          photographer_id: item.photographerId,
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
      if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

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

    // ── GET /check-payment/:invoiceId ─────────────────────────────────────────
    if (req.method === "GET" && path.startsWith("/check-payment/")) {
      const invoiceId = path.replace("/check-payment/", "").split("?")[0];
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      let isPaid = false;
      let qpayTransactionId = "";

      try {
        const token = await qpayToken();
        const result = await qpayCheckPayment(token, invoiceId);
        // QPay returns count > 0 when paid
        isPaid = (result.count ?? 0) > 0;
        if (isPaid && result.rows?.[0]) {
          qpayTransactionId = result.rows[0].payment_id ?? "";
        }
      } catch {
        // If QPay check fails, fall back to DB status
      }

      if (isPaid) {
        // Update all purchases for this invoice to paid and credit wallets
        const { data: purchases } = await db
          .from("purchases")
          .select("id, photographer_id, album_id, photographer_pool_amount, owner_amount")
          .eq("qpay_invoice_id", invoiceId)
          .eq("payment_status", "pending");

        if (purchases && purchases.length > 0) {
          // Mark paid
          await db
            .from("purchases")
            .update({ payment_status: "paid", qpay_transaction_id: qpayTransactionId })
            .eq("qpay_invoice_id", invoiceId);

          // Aggregate credits per photographer
          const photographerCredits: Record<string, number> = {};
          let totalPlatformFee = 0;

          for (const p of purchases) {
            photographerCredits[p.photographer_id] =
              (photographerCredits[p.photographer_id] ?? 0) + p.photographer_pool_amount;
            totalPlatformFee += p.platform_fee_amount ?? 0;
          }

          // Get album owners
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

          // Credit photographer pending wallets + wallet_transactions
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

          // Credit owner pending wallets + wallet_transactions
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

          // Credit platform wallet
          if (totalPlatformFee > 0) {
            await db.rpc("increment_platform_wallet", { p_amount: totalPlatformFee });
          }
        }
      }

      // Return current status from DB
      const { data: purchases } = await db
        .from("purchases")
        .select("id, photo_id, type, print_size, gross_amount, payment_status, photographer_id")
        .eq("qpay_invoice_id", invoiceId);

      return json({
        isPaid,
        purchases: purchases ?? [],
      });
    }

    // ── POST /signed-urls ─────────────────────────────────────────────────────
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
            .createSignedUrl(storagePath, 86400); // 24h
          if (signed?.signedUrl) {
            signedUrls.push({
              purchaseId: p.id,
              signedUrl: signed.signedUrl,
              filename: p.photo_uploads.filename ?? "photo.jpg",
              type: "download",
            });
          }
        } else if (p.type === "print") {
          signedUrls.push({
            purchaseId: p.id,
            signedUrl: "",
            filename: "",
            type: "print",
          });
        }
      }

      return json({ signedUrls });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("QPay function error:", msg);
    return json({ error: msg }, 500);
  }
});

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
