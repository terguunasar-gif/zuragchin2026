// AI бүүт — Edge Function
//
// Зочид нэвтрэхгүй тул бүх үйлдэл энд токеноор шалгагдаж, service role-оор явагдана.
//
//   GET  /booth/:boothToken          бүүтийн мэдээлэл + темплетүүд
//   POST /start                      job + QPay нэхэмжлэх үүсгэх
//   GET  /status/:jobId?key=…        төлбөр/төлөв шалгах
//   POST /qpay-callback?job=…        QPay-ийн callback
//   POST /generate                   зураг илгээж AI-аар үүсгэх
//   POST /finalize                   лого давхарласан эцсийн зургийг хадгалах
//   GET  /result/:resultToken        үр дүнгийн линк (зөвхөн тэр нэг зураг)
//
// Deploy:  supabase functions deploy ai-booth --no-verify-jwt
// Secrets: GEMINI_API_KEY (заавал), GEMINI_IMAGE_MODEL (default: gemini-3.1-flash-image)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildPreviewPrompt, buildPrompt, clampPeople, imageSizeFor, MAX_PEOPLE } from "./prompt.ts";
import { GeminiError, generateImage, InlineImage } from "./gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-3.1-flash-image";

const QPAY_BASE = "https://merchant.qpay.mn/v2";
const QPAY_USERNAME = Deno.env.get("QPAY_USERNAME") ?? "";
const QPAY_PASSWORD = Deno.env.get("QPAY_PASSWORD") ?? "";
const QPAY_INVOICE_CODE = Deno.env.get("QPAY_INVOICE_CODE") ?? "";

const BUCKET = "ai-booth";
const MAX_ATTEMPTS = 4;            // нэг төлбөрт AI-г дээд тал нь хэдэн удаа дуудах
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_FINAL_BYTES = 12 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;

const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Types ────────────────────────────────────────────────────────────────────
interface Booth {
  album_id: string;
  enabled: boolean;
  booth_token: string;
  price_mnt: number;
  owner_share: number;
  logo_url: string;
  logo_position: string;
  logo_size: number;
  overlay_text: string;
  text_position: string;
  text_color: string;
  template_ids: string[];
  add_to_album: boolean;
  closes_at: string | null;
}

interface Job {
  id: string;
  album_id: string;
  template_id: string | null;
  access_key: string;
  result_token: string;
  status: string;
  amount_mnt: number;
  owner_share: number;
  qpay_invoice_id: string;
  people_count: number | null;
  input_path: string;
  raw_path: string;
  final_path: string;
  attempts: number;
  error: string;
  add_to_album: boolean;
  is_kiosk: boolean;
  created_at: string;
  expires_at: string;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ── Router ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/functions\/v1\/ai-booth/, "").replace(/^\/ai-booth/, "") || "/";

    if (req.method === "GET" && path.startsWith("/booth/")) {
      return json(await getBooth(decodeURIComponent(path.slice("/booth/".length))));
    }
    if (req.method === "POST" && path === "/start") {
      return json(await startJob(await readJson(req)));
    }
    if (req.method === "GET" && path.startsWith("/status/")) {
      const jobId = path.slice("/status/".length);
      return json(await getStatus(jobId, url.searchParams.get("key") ?? ""));
    }
    if (req.method === "POST" && path === "/qpay-callback") {
      await qpayCallback(url.searchParams.get("job") ?? "", await req.json().catch(() => ({})));
      return json({ ok: true });
    }
    if (req.method === "POST" && path === "/generate") {
      return json(await generate(await readJson(req)));
    }
    if (req.method === "POST" && path === "/admin/preview") {
      return json(await adminPreview(req, await readJson(req)));
    }
    if (req.method === "POST" && path === "/finalize") {
      return json(await finalize(await readJson(req)));
    }
    if (req.method === "GET" && path.startsWith("/result/")) {
      return json(await getResult(decodeURIComponent(path.slice("/result/".length))));
    }
    return json({ error: "Not found", path }, 404);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("ai-booth error:", msg);
    return json({ error: "Серверийн алдаа гарлаа. Дахин оролдоно уу." }, 500);
  }
});

// ── 1. Booth info ────────────────────────────────────────────────────────────
async function loadOpenBooth(boothToken: string) {
  if (!/^[a-f0-9]{16,64}$/i.test(boothToken)) throw new HttpError(404, "Бүүт олдсонгүй");
  const { data: booth } = await db
    .from("album_ai_booths").select("*").eq("booth_token", boothToken).maybeSingle<Booth>();
  if (!booth) throw new HttpError(404, "Бүүт олдсонгүй");

  const { data: album } = await db.from("albums").select("*").eq("id", booth.album_id).maybeSingle();
  if (!album) throw new HttpError(404, "Арга хэмжээ олдсонгүй");

  const closed = !booth.enabled ||
    album.status !== "active" ||
    (booth.closes_at !== null && new Date(booth.closes_at).getTime() < Date.now());
  return { booth, album, closed };
}

async function getBooth(boothToken: string) {
  const { booth, album, closed } = await loadOpenBooth(boothToken);

  let q = db.from("ai_templates")
    .select("id, slug, name, description, category, preview_url, aspect_ratio, max_people, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (booth.template_ids && booth.template_ids.length > 0) q = q.in("id", booth.template_ids);
  const { data: templates } = await q;

  return {
    closed,
    album: {
      id: album.id,
      name: album.title || album.name,
      event_date: album.event_date,
      // Цомгийн preview-д тавих усан тэмдэг (одоо байгаа зургуудтай ижил)
      watermark_type: album.watermark_type ?? "text",
      watermark_value: album.watermark_value ?? "",
      watermark_position: album.watermark_position ?? "bottom-right",
    },
    booth: {
      price_mnt: booth.price_mnt,
      logo_url: booth.logo_url,
      logo_position: booth.logo_position,
      logo_size: booth.logo_size,
      overlay_text: booth.overlay_text,
      text_position: booth.text_position,
      text_color: booth.text_color,
      add_to_album: booth.add_to_album,
      max_people: MAX_PEOPLE,
    },
    templates: templates ?? [],
  };
}

// ── 2. Start: job + QPay invoice ─────────────────────────────────────────────
async function startJob(body: Record<string, unknown>) {
  const boothToken = str(body.boothToken);
  const templateId = str(body.templateId);
  const isKiosk = body.kiosk === true;

  const { booth, album, closed } = await loadOpenBooth(boothToken);
  if (closed) throw new HttpError(403, "Энэ бүүт одоогоор хаалттай байна");

  const { data: tpl } = await db.from("ai_templates")
    .select("id, name, is_active").eq("id", templateId).maybeSingle();
  if (!tpl || !tpl.is_active) throw new HttpError(400, "Темплет олдсонгүй");
  if (booth.template_ids.length > 0 && !booth.template_ids.includes(tpl.id)) {
    throw new HttpError(400, "Энэ темплет энэ бүүтэд байхгүй");
  }

  // Хугацаа нь дууссан селфи/зургуудыг устгана (хариуг удаашруулахгүй)
  cleanupExpired().catch((e) => console.error("cleanup failed:", e));

  const { data: job, error } = await db.from("ai_jobs").insert({
    album_id: album.id,
    template_id: tpl.id,
    status: booth.price_mnt > 0 ? "pending_payment" : "paid",
    amount_mnt: booth.price_mnt,
    owner_share: booth.owner_share,
    is_kiosk: isKiosk,
    paid_at: booth.price_mnt > 0 ? null : new Date().toISOString(),
  }).select("*").single<Job>();
  if (error || !job) throw new Error(`job insert failed: ${error?.message}`);

  if (booth.price_mnt === 0) {
    return { jobId: job.id, key: job.access_key, status: job.status, amount: 0 };
  }

  const token = await qpayToken();
  const invoice = await qpayCreateInvoice(token, {
    amount: booth.price_mnt,
    description: `Zuragchin.mn AI зураг — ${String(album.title || album.name).slice(0, 40)}`,
    callbackUrl: `${SUPABASE_URL}/functions/v1/ai-booth/qpay-callback?job=${job.id}`,
  });

  await db.from("ai_jobs").update({ qpay_invoice_id: invoice.invoice_id, updated_at: now() })
    .eq("id", job.id);

  return {
    jobId: job.id,
    key: job.access_key,
    status: job.status,
    amount: booth.price_mnt,
    qrImage: invoice.qr_image ?? "",
    qrText: invoice.qr_text ?? "",
    urls: invoice.urls ?? [],
  };
}

// ── 3. Status ────────────────────────────────────────────────────────────────
async function getStatus(jobId: string, key: string) {
  let job = await loadJob(jobId, key);

  if (job.status === "pending_payment" && job.qpay_invoice_id) {
    const paid = await checkQpayPaid(job.qpay_invoice_id);
    if (paid.isPaid) {
      await markPaid(job.id, paid.paymentId);
      job = await loadJob(jobId, key);
    }
  }

  const out: Record<string, unknown> = {
    status: job.status,
    amount: job.amount_mnt,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - job.attempts),
    error: job.status === "failed" ? friendlyError(job.error) : "",
  };
  // Хуудас дахин ачаалагдсан ч лого давхарлах алхмаа үргэлжлүүлэх боломжтой
  if (job.status === "generated" && job.raw_path) {
    out.rawUrl = await signedUrl(job.raw_path, 3600);
  }
  if (job.status === "done") out.resultToken = job.result_token;
  return out;
}

// ── 4. QPay callback ─────────────────────────────────────────────────────────
async function qpayCallback(jobId: string, body: Record<string, unknown>) {
  // Callback-ын агуулгад итгэхгүй — QPay-ээс өөрсдөө дахин шалгана
  let invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : "";
  if (isUuid(jobId)) {
    const { data } = await db.from("ai_jobs").select("qpay_invoice_id").eq("id", jobId).maybeSingle();
    if (data?.qpay_invoice_id) invoiceId = data.qpay_invoice_id;
  }
  if (!invoiceId) return;
  const { data: job } = await db.from("ai_jobs").select("id, status")
    .eq("qpay_invoice_id", invoiceId).maybeSingle();
  if (!job || job.status !== "pending_payment") return;
  const paid = await checkQpayPaid(invoiceId);
  if (paid.isPaid) await markPaid(job.id, paid.paymentId);
}

/** pending_payment → paid шилжилтийг нэг л удаа хийж, орлогыг хуваарилна. */
async function markPaid(jobId: string, paymentId: string) {
  const { data: rows } = await db.from("ai_jobs")
    .update({ status: "paid", paid_at: now(), qpay_payment_id: paymentId, updated_at: now() })
    .eq("id", jobId).eq("status", "pending_payment")
    .select("id, album_id, amount_mnt, owner_share");
  const job = rows?.[0];
  if (!job) return; // аль хэдийн боловсруулсан

  try {
    const ownerAmount = Math.round(job.amount_mnt * Number(job.owner_share ?? 0));
    const platformAmount = job.amount_mnt - ownerAmount;
    if (ownerAmount > 0) {
      const { data: album } = await db.from("albums").select("owner_id").eq("id", job.album_id).maybeSingle();
      if (album?.owner_id) {
        await db.rpc("increment_wallet_pending", { p_user_id: album.owner_id, p_amount: ownerAmount });
      }
    }
    if (platformAmount > 0) {
      await db.rpc("increment_platform_wallet", { p_amount: platformAmount });
    }
  } catch (e) {
    console.error("wallet credit failed (job paid anyway):", e);
  }
}

// ── 5. Generate ──────────────────────────────────────────────────────────────
async function generate(body: Record<string, unknown>) {
  const job = await loadJob(str(body.jobId), str(body.key));
  const peopleRaw = typeof body.peopleCount === "number" ? body.peopleCount : null;
  if (peopleRaw !== null && peopleRaw > MAX_PEOPLE) {
    throw new HttpError(400, `Дээд тал нь ${MAX_PEOPLE} хүн байна`);
  }
  const people = clampPeople(peopleRaw);

  if (job.status === "pending_payment") throw new HttpError(402, "Төлбөр хараахан төлөгдөөгүй байна");
  if (job.status === "processing") throw new HttpError(409, "Зураг үүсч байна, түр хүлээнэ үү");
  if (job.status === "generated" || job.status === "done") {
    throw new HttpError(409, "Энэ төлбөрөөр зураг аль хэдийн үүссэн");
  }
  if (job.attempts >= MAX_ATTEMPTS) throw new HttpError(429, "Оролдлогын тоо дууссан. Ажилтанд хандана уу.");

  const input = decodeImage(body.image, MAX_INPUT_BYTES, "Зураг");

  // paid/failed → processing (зэрэг 2 хүсэлт ирэхээс хамгаална)
  const { data: locked } = await db.from("ai_jobs")
    .update({
      status: "processing",
      attempts: job.attempts + 1,
      people_count: people || null,
      add_to_album: body.addToAlbum === true,
      error: "",
      updated_at: now(),
    })
    .eq("id", job.id).in("status", ["paid", "failed"]).eq("attempts", job.attempts)
    .select("id");
  if (!locked || locked.length === 0) throw new HttpError(409, "Зураг үүсч байна, түр хүлээнэ үү");

  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY тохируулаагүй байна");

    const inputPath = `${job.album_id}/${job.id}/input.${extFor(input.mimeType)}`;
    await upload(inputPath, input.bytes, input.mimeType);

    const { data: tpl } = await db.from("ai_templates").select("*").eq("id", job.template_id).maybeSingle();
    if (!tpl) throw new Error("template missing");
    const { data: booth } = await db.from("album_ai_booths").select("*").eq("album_id", job.album_id)
      .maybeSingle<Booth>();

    const images: InlineImage[] = [{ mimeType: input.mimeType, data: input.base64 }];
    let hasStyleRef = false;
    if (tpl.style_ref_url) {
      const ref = await fetchAsInline(tpl.style_ref_url).catch(() => null);
      if (ref) {
        images.push(ref);
        hasStyleRef = true;
      }
    }

    const prompt = buildPrompt({
      scenePrompt: tpl.scene_prompt,
      peopleCount: people,
      compositionOverrides: tpl.composition_overrides,
      hasStyleRef,
      logoPosition: booth?.logo_url ? booth.logo_position : null,
      textPosition: booth?.overlay_text ? booth.text_position : null,
    });

    // Түр зуурын алдаанд нэг удаа дахин оролдоно
    let result;
    try {
      result = await generateImage({
        apiKey: GEMINI_API_KEY,
        model: GEMINI_MODEL,
        prompt,
        images,
        aspectRatio: tpl.aspect_ratio || "3:4",
        imageSize: imageSizeFor(people),
      });
    } catch (e) {
      if (e instanceof GeminiError && !e.retryable) throw e;
      result = await generateImage({
        apiKey: GEMINI_API_KEY,
        model: GEMINI_MODEL,
        prompt,
        images,
        aspectRatio: tpl.aspect_ratio || "3:4",
        imageSize: imageSizeFor(people),
      });
    }

    const rawBytes = base64ToBytes(result.image.data);
    const rawPath = `${job.album_id}/${job.id}/raw.${extFor(result.image.mimeType)}`;
    await upload(rawPath, rawBytes, result.image.mimeType);

    await db.from("ai_jobs").update({
      status: "generated",
      input_path: inputPath,
      raw_path: rawPath,
      updated_at: now(),
    }).eq("id", job.id);

    return { status: "generated", rawUrl: await signedUrl(rawPath, 3600) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate failed:", msg);
    await db.from("ai_jobs").update({ status: "failed", error: msg.slice(0, 1000), updated_at: now() })
      .eq("id", job.id);
    return {
      status: "failed",
      error: friendlyError(msg),
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - (job.attempts + 1)),
    };
  }
}

// ── 6. Finalize ──────────────────────────────────────────────────────────────
async function finalize(body: Record<string, unknown>) {
  const job = await loadJob(str(body.jobId), str(body.key));
  if (job.status === "done") return { status: "done", resultToken: job.result_token };
  if (job.status !== "generated") throw new HttpError(409, "Зураг хараахан бэлэн болоогүй байна");

  const finalImg = decodeImage(body.final, MAX_FINAL_BYTES, "Эцсийн зураг");
  const finalPath = `${job.album_id}/${job.id}/final.jpg`;
  await upload(finalPath, finalImg.bytes, "image/jpeg");

  let photoUploadId: string | null = null;
  const { data: booth } = await db.from("album_ai_booths").select("add_to_album").eq("album_id", job.album_id)
    .maybeSingle();

  // Зохион байгуулагч зөвшөөрсөн БА зочин өөрөө зөвшөөрсөн үед л цомогт нэмнэ
  if (booth?.add_to_album && job.add_to_album && body.preview) {
    try {
      const preview = decodeImage(body.preview, MAX_PREVIEW_BYTES, "Preview");
      const { data: album } = await db.from("albums").select("owner_id").eq("id", job.album_id).single();
      if (!album) throw new Error("album missing");
      const base = `ai-booth/${job.album_id}/${job.id}`;
      const o = await db.storage.from("photos-original")
        .upload(`${base}.jpg`, finalImg.bytes, { contentType: "image/jpeg", upsert: true });
      if (o.error) throw o.error;
      const p = await db.storage.from("photos-preview")
        .upload(`${base}_preview.jpg`, preview.bytes, { contentType: "image/jpeg", upsert: true });
      if (p.error) throw p.error;
      const { data: { publicUrl } } = db.storage.from("photos-preview").getPublicUrl(`${base}_preview.jpg`);
      const { data: photo, error } = await db.from("photo_uploads").insert({
        album_id: job.album_id,
        photographer_id: album.owner_id,
        original_url: `photos-original/${base}.jpg`,
        preview_url: publicUrl,
        print_prices: {},
        filename: `AI-${job.id.slice(0, 8)}.jpg`,
        source: "ai_booth",
      }).select("id").single();
      if (error) throw error;
      photoUploadId = photo.id;
    } catch (e) {
      // Цомогт нэмэгдээгүй ч зочин өөрийн зургаа авах ёстой
      console.error("add to album failed:", e);
    }
  }

  await db.from("ai_jobs").update({
    status: "done",
    final_path: finalPath,
    photo_upload_id: photoUploadId,
    updated_at: now(),
  }).eq("id", job.id);

  return { status: "done", resultToken: job.result_token, addedToAlbum: !!photoUploadId };
}

// ── 7. Result ────────────────────────────────────────────────────────────────
async function getResult(resultToken: string) {
  if (!/^[a-f0-9]{16,64}$/i.test(resultToken)) throw new HttpError(404, "Зураг олдсонгүй");
  const { data: job } = await db.from("ai_jobs")
    .select("id, album_id, template_id, status, final_path, expires_at, created_at")
    .eq("result_token", resultToken).maybeSingle();
  if (!job || job.status !== "done" || !job.final_path) throw new HttpError(404, "Зураг олдсонгүй");
  if (new Date(job.expires_at).getTime() < Date.now()) throw new HttpError(410, "Зургийн хугацаа дууссан");

  const { data: album } = await db.from("albums").select("title, name").eq("id", job.album_id).maybeSingle();
  const { data: tpl } = await db.from("ai_templates").select("name").eq("id", job.template_id).maybeSingle();

  return {
    imageUrl: await signedUrl(job.final_path, 24 * 3600),
    albumName: album?.title || album?.name || "",
    templateName: tpl?.name ?? "",
    createdAt: job.created_at,
    expiresAt: job.expires_at,
  };
}

// ── 8. Cleanup: 30 хоногийн дараа зочны зургийг устгах ───────────────────────
async function cleanupExpired() {
  const { data: jobs } = await db.from("ai_jobs")
    .select("id, album_id, input_path, raw_path, final_path, status")
    .lt("expires_at", now())
    .neq("status", "expired")
    .limit(25);
  for (const j of jobs ?? []) {
    const paths = [j.input_path, j.raw_path, j.final_path].filter((p: string) => !!p);
    if (paths.length > 0) await db.storage.from(BUCKET).remove(paths);
    await db.from("ai_jobs").update({
      status: "expired",
      input_path: "",
      raw_path: "",
      final_path: "",
      updated_at: now(),
    }).eq("id", j.id);
  }
}

// ── 9. Admin: темплетийн жишээ зургийг AI-аар үүсгэх ─────────────────────────
async function requireAdmin(req: Request): Promise<string> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "Нэвтэрнэ үү");
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) throw new HttpError(401, "Нэвтэрнэ үү");
  const { data: u } = await db.from("users").select("role").eq("id", data.user.id).maybeSingle();
  const roles: string[] = Array.isArray(u?.role) ? u!.role : [String(u?.role ?? "")];
  if (!roles.includes("admin")) throw new HttpError(403, "Зөвхөн админ");
  return data.user.id;
}

async function adminPreview(req: Request, body: Record<string, unknown>) {
  await requireAdmin(req);
  if (!GEMINI_API_KEY) throw new HttpError(500, "GEMINI_API_KEY тохируулаагүй байна");
  const templateId = str(body.templateId);
  if (!isUuid(templateId)) throw new HttpError(400, "Темплет буруу");
  const { data: tpl } = await db.from("ai_templates").select("*").eq("id", templateId).maybeSingle();
  if (!tpl) throw new HttpError(404, "Темплет олдсонгүй");

  const people = typeof body.peopleCount === "number" ? body.peopleCount : 2;
  const prompt = buildPreviewPrompt({
    scenePrompt: tpl.scene_prompt,
    peopleCount: people,
    compositionOverrides: tpl.composition_overrides,
  });
  const images: InlineImage[] = [];
  if (tpl.style_ref_url) {
    const ref = await fetchAsInline(tpl.style_ref_url).catch(() => null);
    if (ref) images.push(ref);
  }

  let result;
  try {
    result = await generateImage({
      apiKey: GEMINI_API_KEY,
      model: GEMINI_MODEL,
      prompt: images.length
        ? `${prompt}\nImage 1 is a scene and style reference only.`
        : prompt,
      images,
      aspectRatio: tpl.aspect_ratio || "3:4",
      imageSize: "1K",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("preview failed:", msg);
    throw new HttpError(502, friendlyError(msg) || "Зураг үүсгэж чадсангүй");
  }

  const bytes = base64ToBytes(result.image.data);
  const path = `templates/${tpl.slug}-preview-${Date.now()}.${extFor(result.image.mimeType)}`;
  const { error: upErr } = await db.storage.from("ai-booth-assets")
    .upload(path, bytes, { contentType: result.image.mimeType, upsert: true });
  if (upErr) throw new Error(`preview upload failed: ${upErr.message}`);
  const { data: { publicUrl } } = db.storage.from("ai-booth-assets").getPublicUrl(path);

  // Хуучин жишээ зургийг устгана (зөвхөн манай templates/ хавтсанд байгаа бол)
  const oldUrl: string = tpl.preview_url ?? "";
  const marker = "/ai-booth-assets/";
  if (oldUrl.includes(marker + "templates/")) {
    const oldPath = oldUrl.slice(oldUrl.indexOf(marker) + marker.length).split("?")[0];
    await db.storage.from("ai-booth-assets").remove([oldPath]).catch(() => undefined);
  }

  await db.from("ai_templates").update({ preview_url: publicUrl, updated_at: now() }).eq("id", tpl.id);
  return { previewUrl: publicUrl };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function loadJob(jobId: string, key: string): Promise<Job> {
  if (!isUuid(jobId) || !key) throw new HttpError(404, "Захиалга олдсонгүй");
  const { data: job } = await db.from("ai_jobs").select("*").eq("id", jobId).maybeSingle<Job>();
  if (!job || !timingSafeEqual(job.access_key, key)) throw new HttpError(404, "Захиалга олдсонгүй");
  return job;
}

function decodeImage(value: unknown, maxBytes: number, label: string) {
  if (typeof value !== "string" || value.length < 100) throw new HttpError(400, `${label} хоосон байна`);
  const m = value.match(/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/s);
  const mimeType = m ? m[1] : "image/jpeg";
  const base64 = (m ? m[2] : value).replace(/\s/g, "");
  if (base64.length * 0.75 > maxBytes) throw new HttpError(413, `${label} хэт том байна`);
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    throw new HttpError(400, `${label} буруу форматтай байна`);
  }
  if (!looksLikeImage(bytes)) throw new HttpError(400, `${label} зураг биш байна`);
  return { mimeType, base64, bytes };
}

function looksLikeImage(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const jpeg = b[0] === 0xff && b[1] === 0xd8;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return jpeg || png || webp;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function fetchAsInline(url: string): Promise<InlineImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ref fetch ${res.status}`);
  const mimeType = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { mimeType, data: bytesToBase64(bytes) };
}

async function upload(path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

async function signedUrl(path: string, seconds: number): Promise<string> {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(`signed url failed: ${error?.message}`);
  return data.signedUrl;
}

function extFor(mime: string) {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

function friendlyError(raw: string): string {
  if (!raw) return "";
  if (/safety|blocked|prohibited|SAFETY|IMAGE_SAFETY/i.test(raw)) {
    return "AI энэ зургийг боловсруулахаас татгалзлаа. Өөр байрлалаар дахин дарна уу.";
  }
  if (/429|quota|rate/i.test(raw)) return "AI сервер завгүй байна. Хэдэн секундийн дараа дахин оролдоно уу.";
  return "Зураг үүсгэхэд алдаа гарлаа. Дахин оролдоно уу — нэмэлт төлбөргүй.";
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function now() {
  return new Date().toISOString();
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new HttpError(400, "Буруу хүсэлт");
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── QPay ─────────────────────────────────────────────────────────────────────
let cachedToken: { value: string; expires: number } | null = null;

async function qpayToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;
  const res = await fetch(`${QPAY_BASE}/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${QPAY_USERNAME}:${QPAY_PASSWORD}`)}` },
  });
  if (!res.ok) throw new Error(`QPay token failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  // QPay токен ~24 цаг хүчинтэй; аюулгүйн үүднээс 30 минут кэшлэнэ
  cachedToken = { value: data.access_token, expires: Date.now() + 30 * 60 * 1000 };
  return data.access_token;
}

async function qpayCreateInvoice(token: string, p: { amount: number; description: string; callbackUrl: string }) {
  const res = await fetch(`${QPAY_BASE}/invoice`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      invoice_code: QPAY_INVOICE_CODE,
      sender_invoice_no: crypto.randomUUID().slice(0, 16),
      invoice_receiver_code: "terminal",
      sender_branch_code: "BRANCH1",
      invoice_description: p.description,
      sender_staff_code: "aibooth",
      amount: p.amount,
      callback_url: p.callbackUrl,
    }),
  });
  if (!res.ok) throw new Error(`QPay invoice failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function checkQpayPaid(invoiceId: string): Promise<{ isPaid: boolean; paymentId: string }> {
  try {
    const token = await qpayToken();
    const res = await fetch(`${QPAY_BASE}/payment/check`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        object_type: "INVOICE",
        object_id: invoiceId,
        offset: { page_number: 1, page_limit: 100 },
      }),
    });
    if (!res.ok) return { isPaid: false, paymentId: "" };
    const data = await res.json();
    const row = (data.rows ?? []).find((r: { payment_status?: string }) =>
      !r.payment_status || r.payment_status === "PAID"
    );
    return { isPaid: !!row, paymentId: row?.payment_id ?? "" };
  } catch (e) {
    console.error("QPay check failed:", e);
    return { isPaid: false, paymentId: "" };
  }
}
