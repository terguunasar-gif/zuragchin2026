// Цомгийн AI видео — Edge Function (update-66)
//
// Цомгийн эзэн цомгийнхоо зургийг сонгоод видео загвар сонгоно → QPay → Google Veo Fast (720p, 8 сек).
// Эхний ~2 секунд зураг хөдөлгөөнгүй, дараа нь загварын үйлдэл. Бэлэн видео «album-ai-videos» (public) санд
// хадгалагдаж цомгийн «🎬 AI видео» хавтас, дэлгэцийн горимд гарна.
//
//   GET  /templates                  идэвхтэй загварууд + үнэ
//   POST /start        (эзэн)        {albumId, photoId, templateId, aspectRatio} → нэхэмжлэх
//   GET  /status/:id   (эзэн)        төлбөр шалгах + видеог ахиулах
//   POST /retry        (эзэн)        бүтэлгүйтсэн видеог дахин (үнэгүй)
//   POST /delete       (эзэн)        видеог устгах
//   POST /advance                    {albumId} — цомог үзэж буй хэн ч боловсруулж буй видеог ахиулна
//   POST /qpay-callback?video=…      QPay
//
// Deploy:  Dashboard → Edge Functions → album-video (Verify JWT OFF)
// Secrets: GEMINI_API_KEY (ai-booth-тэй ижил), QPAY_* (ai-booth-тэй ижил)
//          ALBUM_VIDEO_MODEL (default: veo-3.1-fast-generate-preview), ALBUM_VIDEO_SECONDS (8)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { downloadVeo, pollVeo, startVeo } from "../ai-booth/veo.ts";
import { generateImage } from "../ai-booth/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const VIDEO_MODEL = Deno.env.get("ALBUM_VIDEO_MODEL") || "veo-3.1-fast-generate-preview";
const IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-3.1-flash-image";
const VIDEO_SECONDS = Number(Deno.env.get("ALBUM_VIDEO_SECONDS") || 8);
const AUTO_ATTEMPTS = 3;   // автоматаар дахин оролдох
const MAX_ATTEMPTS = 6;    // эзэн «Дахин» дарж болох нийт хязгаар

const QPAY_BASE = (Deno.env.get("QPAY_BASE_URL") || "https://merchant.qpay.mn/v2").replace(/\/+$/, "");
const QPAY_USERNAME = Deno.env.get("QPAY_USERNAME") ?? "";
const QPAY_PASSWORD = Deno.env.get("QPAY_PASSWORD") ?? "";
const QPAY_INVOICE_CODE = Deno.env.get("QPAY_INVOICE_CODE") ?? "";

const BUCKET = "album-ai-videos";
const DEFAULT_PRICE = 10000;
const DEFAULT_OWNER_SHARE = 0.1;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

interface Video {
  id: string;
  album_id: string;
  photo_id: string | null;
  template_id: string | null;
  template_name: string;
  created_by: string;
  status: string;
  amount_mnt: number;
  owner_share: number;
  qpay_invoice_id: string;
  aspect_ratio: "16:9" | "9:16";
  video_op: string;
  video_attempts: number;
  video_url: string;
  poster_url: string;
  error: string;
  created_at: string;
  updated_at: string;
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
    const path = url.pathname.replace(/^\/functions\/v1\/album-video/, "").replace(/^\/album-video/, "") || "/";

    if (req.method === "GET" && path === "/templates") return json(await listTemplates());
    if (req.method === "POST" && path === "/start") return json(await start(req, await readJson(req)));
    if (req.method === "GET" && path.startsWith("/status/")) return json(await status(req, path.slice("/status/".length)));
    if (req.method === "POST" && path === "/retry") return json(await retry(req, await readJson(req)));
    if (req.method === "POST" && path === "/delete") return json(await remove(req, await readJson(req)));
    if (req.method === "POST" && path === "/admin/preview") return json(await adminPreview(req, await readJson(req)));
    if (req.method === "POST" && path === "/advance") return json(await advanceAlbum(await readJson(req)));
    if (req.method === "POST" && path === "/qpay-callback") {
      await qpayCallback(url.searchParams.get("video") ?? "", await req.json().catch(() => ({})));
      return json({ ok: true });
    }
    return json({ error: "Not found", path }, 404);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("album-video error:", err instanceof Error ? err.message : err);
    return json({ error: "Серверийн алдаа гарлаа. Дахин оролдоно уу." }, 500);
  }
});

// ── Тохиргоо, загвар ─────────────────────────────────────────────────────────
async function settings() {
  const { data } = await db.from("platform_settings").select("key, value")
    .in("key", ["album_video_enabled", "album_video_price", "album_video_owner_share"]);
  const map = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const price = Number(map.get("album_video_price"));
  const share = Number(map.get("album_video_owner_share"));
  const enabledRaw = map.get("album_video_enabled");
  return {
    enabled: enabledRaw === undefined ? true : enabledRaw === true || enabledRaw === "true",
    price: Number.isFinite(price) && price >= 0 ? Math.round(price) : DEFAULT_PRICE,
    ownerShare: Number.isFinite(share) && share >= 0 && share <= 1 ? share : DEFAULT_OWNER_SHARE,
  };
}

async function listTemplates() {
  const s = await settings();
  const { data, error } = await db.from("ai_video_templates")
    .select("id, slug, name, description, emoji, sample_video_url, preview_url, tags, sort_order")
    .eq("is_active", true).order("sort_order", { ascending: true });
  if (error) throw new Error(`templates: ${error.message}`);
  return { enabled: s.enabled, price: s.price, seconds: VIDEO_SECONDS, templates: data ?? [] };
}

// ── Нэвтрэлт: цомгийн эзэн эсвэл админ ───────────────────────────────────────
async function currentUser(req: Request): Promise<{ id: string; admin: boolean }> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "Нэвтэрнэ үү");
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) throw new HttpError(401, "Нэвтэрнэ үү");
  const { data: u } = await db.from("users").select("role").eq("id", data.user.id).maybeSingle();
  const roles: string[] = Array.isArray(u?.role) ? u!.role : [String(u?.role ?? "")];
  return { id: data.user.id, admin: roles.includes("admin") };
}

async function requireAlbumOwner(req: Request, albumId: string) {
  const user = await currentUser(req);
  if (!isUuid(albumId)) throw new HttpError(404, "Цомог олдсонгүй");
  const { data: album } = await db.from("albums").select("id, owner_id, status, title, name").eq("id", albumId).maybeSingle();
  if (!album) throw new HttpError(404, "Цомог олдсонгүй");
  if (album.owner_id !== user.id && !user.admin) throw new HttpError(403, "Зөвхөн цомгийн эзэн видео үүсгэнэ");
  return { user, album };
}

async function loadOwnedVideo(req: Request, id: string): Promise<Video> {
  if (!isUuid(id)) throw new HttpError(404, "Видео олдсонгүй");
  const { data: v } = await db.from("album_ai_videos").select("*").eq("id", id).maybeSingle<Video>();
  if (!v || v.status === "deleted") throw new HttpError(404, "Видео олдсонгүй");
  await requireAlbumOwner(req, v.album_id);
  return v;
}

// ── Эхлүүлэх: мөр + QPay нэхэмжлэх ──────────────────────────────────────────
async function start(req: Request, body: Record<string, unknown>) {
  const albumId = str(body.albumId);
  const { user, album } = await requireAlbumOwner(req, albumId);
  if (album.status !== "active") throw new HttpError(409, "Цомог идэвхгүй байна");
  const s = await settings();
  if (!s.enabled) throw new HttpError(403, "AI видео одоогоор хаалттай байна");
  if (!GEMINI_API_KEY) throw new HttpError(500, "GEMINI_API_KEY тохируулаагүй байна");

  const photoId = str(body.photoId);
  const templateId = str(body.templateId);
  if (!isUuid(photoId) || !isUuid(templateId)) throw new HttpError(400, "Зураг эсвэл загвар буруу");
  const { data: photo } = await db.from("photo_uploads").select("id, album_id").eq("id", photoId).maybeSingle();
  if (!photo || photo.album_id !== albumId) throw new HttpError(404, "Зураг олдсонгүй");
  const { data: tpl } = await db.from("ai_video_templates").select("id, name, is_active").eq("id", templateId).maybeSingle();
  if (!tpl || !tpl.is_active) throw new HttpError(404, "Загвар олдсонгүй");

  const aspect = body.aspectRatio === "9:16" ? "9:16" : "16:9";
  // Админ туршилт/жишээ видеог төлбөргүй үүсгэж болно
  const price = user.admin && body.free === true ? 0 : s.price;

  const { data: v, error } = await db.from("album_ai_videos").insert({
    album_id: albumId,
    photo_id: photoId,
    template_id: templateId,
    template_name: tpl.name,
    created_by: user.id,
    status: price > 0 ? "pending_payment" : "paid",
    amount_mnt: price,
    owner_share: s.ownerShare,
    aspect_ratio: aspect,
    paid_at: price > 0 ? null : now(),
  }).select("*").single<Video>();
  if (error || !v) throw new Error(`insert failed: ${error?.message}`);

  if (price === 0) {
    await beginVideo(v);
    return { videoId: v.id, status: "processing", amount: 0 };
  }

  let invoice;
  try {
    const token = await qpayToken();
    invoice = await qpayCreateInvoice(token, {
      amount: price,
      description: `Zuragchin.mn AI видео — ${String(album.title || album.name || "").slice(0, 40)}`,
      callbackUrl: `${SUPABASE_URL}/functions/v1/album-video/qpay-callback?video=${v.id}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("QPay invoice error:", msg);
    await db.from("album_ai_videos").update({ status: "expired", error: msg.slice(0, 1000), updated_at: now() }).eq("id", v.id);
    throw new HttpError(502, `QPay нэхэмжлэх үүсгэж чадсангүй: ${msg.slice(0, 200)}`);
  }
  await db.from("album_ai_videos").update({ qpay_invoice_id: invoice.invoice_id, updated_at: now() }).eq("id", v.id);
  return {
    videoId: v.id,
    status: "pending_payment",
    amount: price,
    qrImage: invoice.qr_image ?? "",
    qrText: invoice.qr_text ?? "",
    urls: invoice.urls ?? [],
  };
}

// ── Төлөв ────────────────────────────────────────────────────────────────────
async function status(req: Request, id: string) {
  let v = await loadOwnedVideo(req, id);
  if (v.status === "pending_payment" && v.qpay_invoice_id) {
    const paid = await checkQpayPaid(v.qpay_invoice_id);
    if (paid.isPaid) {
      await markPaid(v.id, paid.paymentId);
      v = (await reload(v.id)) ?? v;
    }
  }
  if (v.status === "paid") {
    // Callback төлбөрийг тэмдэглээд видеог эхлүүлж амжаагүй
    if (await claimStart(v)) v = await beginVideo(v);
  }
  if (v.status === "processing") v = await advance(v);
  return publicState(v);
}

function publicState(v: Video) {
  return {
    id: v.id,
    status: v.status,
    amount: v.amount_mnt,
    videoUrl: v.status === "done" ? v.video_url : "",
    posterUrl: v.poster_url,
    templateName: v.template_name,
    canRetry: v.status === "failed" && (v.video_attempts ?? 0) < MAX_ATTEMPTS,
    error: v.status === "failed" ? friendlyError(v.error) : "",
  };
}

async function reload(id: string): Promise<Video | null> {
  const { data } = await db.from("album_ai_videos").select("*").eq("id", id).maybeSingle<Video>();
  return data ?? null;
}

// ── Видео: эхлүүлэх / ахиулах ────────────────────────────────────────────────
function videoPrompt(action: string): string {
  return [
    `An ${VIDEO_SECONDS}-second video that starts from this exact photo.`,
    "For the first 2 seconds the image stays completely frozen, exactly like the still photograph — nobody moves, the camera does not move.",
    `Then the action begins: ${action.trim()}`,
    "Keep every person's face, identity and hairstyle recognisable throughout; do not add other people unless the action asks for them.",
    "Smooth, natural motion, sharp and stable, no text, captions, subtitles or logos.",
    "Fun sound effects and music that match the action, no speech.",
  ].join(" ");
}

/** Эх зургийг ~1280px болгож авна (Storage-ийн хөрвүүлэлт), бүтэхгүй бол эх файлыг */
async function loadSourceImage(photoId: string): Promise<{ mimeType: string; bytes: Uint8Array; previewUrl: string }> {
  const { data: photo } = await db.from("photo_uploads").select("original_url, preview_url").eq("id", photoId).maybeSingle();
  if (!photo) throw new Error("photo missing");
  const previewUrl = String(photo.preview_url ?? "");
  const raw = String(photo.original_url ?? "");
  const known = ["photos-original", "ai-booth", "photos-preview"];
  const first = raw.split("/")[0];
  const bucket = known.includes(first) ? first : "photos-original";
  const path = known.includes(first) ? raw.slice(first.length + 1) : raw;

  if (path) {
    try {
      const { data } = await db.storage.from(bucket).createSignedUrl(path, 300, {
        transform: { width: 1280, height: 1280, resize: "contain", quality: 85 },
      });
      if (data?.signedUrl) {
        const res = await fetch(data.signedUrl, { headers: { Accept: "image/jpeg,image/png,image/*" } });
        const type = (res.headers.get("content-type") ?? "").split(";")[0];
        if (res.ok && /^image\/(jpeg|png|webp)$/.test(type)) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.length > 1000) return { mimeType: type, bytes, previewUrl };
        }
      }
    } catch (e) {
      console.warn("transform failed, using original:", e instanceof Error ? e.message : e);
    }
    const { data: blob, error } = await db.storage.from(bucket).download(path);
    if (!error && blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length > MAX_SOURCE_BYTES) throw new Error("Эх зураг хэт том байна (15MB-аас их)");
      return { mimeType: sniffMime(bytes), bytes, previewUrl };
    }
  }
  throw new Error("source image not found");
}

async function beginVideo(v: Video): Promise<Video> {
  const attempts = (v.video_attempts ?? 0) + 1;
  try {
    if (!v.photo_id) throw new Error("Зураг устгагдсан байна");
    const { data: tpl } = await db.from("ai_video_templates").select("prompt").eq("id", v.template_id ?? "").maybeSingle();
    if (!tpl?.prompt) throw new Error("Загвар устгагдсан байна");
    const src = await loadSourceImage(v.photo_id);

    // Постер: цомгийн тамгатай preview (тамгагүй эх зургийг олон нийтийн санд хадгалахгүй)
    const posterUrl = v.poster_url || src.previewUrl;

    const op = await startVeo({
      apiKey: GEMINI_API_KEY,
      model: VIDEO_MODEL,
      image: { mimeType: src.mimeType, data: bytesToBase64(src.bytes) },
      prompt: videoPrompt(tpl.prompt),
      durationSeconds: VIDEO_SECONDS,
      aspectRatio: v.aspect_ratio,
      resolution: "720p",
    });
    const patch = { status: "processing", video_op: op, video_attempts: attempts, poster_url: posterUrl, error: "", updated_at: now() };
    await db.from("album_ai_videos").update(patch).eq("id", v.id);
    return { ...v, ...patch };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("veo start failed:", msg);
    const failed = attempts % AUTO_ATTEMPTS === 0 || attempts >= MAX_ATTEMPTS;
    const patch = { status: failed ? "failed" : "processing", video_op: "", video_attempts: attempts, error: msg.slice(0, 1000), updated_at: now() };
    await db.from("album_ai_videos").update(patch).eq("id", v.id);
    return { ...v, ...patch };
  }
}

async function advance(v: Video): Promise<Video> {
  if (v.status !== "processing") return v;
  if (!v.video_op) {
    // Эхлүүлэлт алдаатай байсан — түр хүлээгээд дахин
    if (Date.now() - new Date(v.updated_at).getTime() < 15000) return v;
    if (!(await claimStart(v))) return v;
    return await beginVideo(v);
  }
  let poll;
  try {
    poll = await pollVeo(GEMINI_API_KEY, v.video_op);
  } catch (e) {
    console.error("veo poll failed:", e instanceof Error ? e.message : e);
    return v;
  }
  if (!poll.done) return v;
  if ("error" in poll) {
    console.error("veo failed:", poll.error);
    const attempts = v.video_attempts ?? 0;
    const failed = attempts % AUTO_ATTEMPTS === 0 || attempts >= MAX_ATTEMPTS;
    const patch = { status: failed ? "failed" : "processing", video_op: "", error: poll.error.slice(0, 1000), updated_at: now() };
    const { data: changed } = await db.from("album_ai_videos").update(patch)
      .eq("id", v.id).eq("video_op", v.video_op).select("id");
    const next = { ...v, ...patch };
    // Өөр хүсэлт аль хэдийн боловсруулсан бол давхар эхлүүлэхгүй
    if (failed || !changed?.length || !(await claimStart(next, true))) return next;
    return await beginVideo(next);
  }
  const videoPath = `${v.album_id}/${v.id}.mp4`;
  try {
    const bytes = await downloadVeo(GEMINI_API_KEY, poll.videoUri);
    const { error } = await db.storage.from(BUCKET).upload(videoPath, bytes, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`upload: ${error.message}`);
  } catch (e) {
    // Google видеог 2 хоног хадгалдаг — дараагийн шалгалтаар дахин татна
    const msg = e instanceof Error ? e.message : String(e);
    console.error("video save failed:", msg);
    await db.from("album_ai_videos").update({ error: msg.slice(0, 1000), updated_at: now() }).eq("id", v.id);
    return v;
  }
  const videoUrl = db.storage.from(BUCKET).getPublicUrl(videoPath).data.publicUrl;
  const patch = { status: "done", video_url: videoUrl, video_op: "", error: "", updated_at: now() };
  await db.from("album_ai_videos").update(patch).eq("id", v.id).eq("status", "processing");
  return { ...v, ...patch };
}

/** Зэрэг ирсэн хүсэлтүүд видеог давхар эхлүүлэхээс сэргийлнэ */
async function claimStart(v: Video, force = false): Promise<boolean> {
  const cutoff = new Date(Date.now() - 15000).toISOString();
  let q = db.from("album_ai_videos").update({ updated_at: new Date(Date.now() + 90000).toISOString() })
    .eq("id", v.id).eq("status", v.status).eq("video_op", "").eq("video_attempts", v.video_attempts ?? 0);
  if (!force) q = q.lt("updated_at", cutoff);
  const { data } = await q.select("id");
  return !!data && data.length > 0;
}

/** Цомог нээгдэх бүрт тухайн цомгийн боловсруулж буй видеог ахиулна (эзэн хуудсаа хаасан ч дуусна) */
async function advanceAlbum(body: Record<string, unknown>) {
  const albumId = str(body.albumId);
  if (!isUuid(albumId)) return { done: 0 };
  const { data } = await db.from("album_ai_videos").select("*")
    .eq("album_id", albumId).in("status", ["paid", "processing"])
    .order("created_at", { ascending: true }).limit(3);
  let done = 0;
  for (const row of (data ?? []) as Video[]) {
    let v = row;
    // Төлөгдсөн гэж тэмдэглэгдсэн ч эхлээгүй
    if (v.status === "paid") {
      if (Date.now() - new Date(v.updated_at).getTime() < 20000) continue;
      if (await claimStart(v)) v = await beginVideo(v);
      continue;
    }
    v = await advance(v);
    if (v.status === "done") done++;
  }
  return { done };
}

async function retry(req: Request, body: Record<string, unknown>) {
  const v = await loadOwnedVideo(req, str(body.videoId));
  if (v.status !== "failed") return publicState(v);
  if ((v.video_attempts ?? 0) >= MAX_ATTEMPTS) {
    throw new HttpError(429, "Олон удаа оролдсон ч бүтсэнгүй. Zuragchin.mn-тэй холбогдож төлбөрөө буцаалгана уу.");
  }
  const { data } = await db.from("album_ai_videos").update({ status: "processing", updated_at: now() })
    .eq("id", v.id).eq("status", "failed").select("*");
  const row = (data?.[0] as Video | undefined);
  if (!row) return publicState((await reload(v.id)) ?? v);
  return publicState(await beginVideo(row));
}

async function remove(req: Request, body: Record<string, unknown>) {
  const v = await loadOwnedVideo(req, str(body.videoId));
  const paths = [`${v.album_id}/${v.id}.mp4`];
  const marker = `/${BUCKET}/`;
  if (v.poster_url.includes(marker)) paths.push(v.poster_url.slice(v.poster_url.indexOf(marker) + marker.length).split("?")[0]);
  await db.storage.from(BUCKET).remove(paths).catch(() => undefined);
  await db.from("album_ai_videos").update({ status: "deleted", video_url: "", poster_url: "", video_op: "", updated_at: now() }).eq("id", v.id);
  return { ok: true };
}

// ── Админ: загварын жишээ зургийг AI-аар үүсгэх ─────────────────────────────
async function adminPreview(req: Request, body: Record<string, unknown>) {
  const user = await currentUser(req);
  if (!user.admin) throw new HttpError(403, "Зөвхөн админ");
  if (!GEMINI_API_KEY) throw new HttpError(500, "GEMINI_API_KEY тохируулаагүй байна");
  const id = str(body.templateId);
  if (!isUuid(id)) throw new HttpError(400, "Загвар буруу");
  const { data: tpl } = await db.from("ai_video_templates").select("id, slug, prompt, preview_url").eq("id", id).maybeSingle();
  if (!tpl) throw new HttpError(404, "Загвар олдсонгүй");

  const prompt = [
    "Create one photorealistic, vibrant, cinematic still image that shows the most exciting moment of this short fun video idea:",
    tpl.prompt,
    "Show two or three cheerful adult Mongolian people (around 25–40 years old) at a festive indoor event, clearly enjoying the moment.",
    "Dynamic, eye-catching composition for a thumbnail, rich colours, sharp focus, professional event photography look.",
    "No text, no letters, no captions, no logos, no watermarks. No children.",
  ].join(" ");

  let result;
  try {
    result = await generateImage({ apiKey: GEMINI_API_KEY, model: IMAGE_MODEL, prompt, images: [], aspectRatio: "16:9", imageSize: "1K" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("video template preview failed:", msg);
    throw new HttpError(502, msg.slice(0, 300));
  }
  const bin = atob(result.image.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = result.image.mimeType === "image/png" ? "png" : result.image.mimeType === "image/webp" ? "webp" : "jpg";
  const path = `samples/preview-${tpl.slug}-${Date.now()}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: result.image.mimeType, upsert: true });
  if (error) throw new Error(`preview upload: ${error.message}`);
  const previewUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  // Хуучин AI жишээ зургийг устгана
  const old = String(tpl.preview_url ?? "");
  const marker = `/${BUCKET}/samples/preview-`;
  if (old.includes(marker)) {
    await db.storage.from(BUCKET).remove([old.slice(old.indexOf(`/${BUCKET}/`) + BUCKET.length + 2).split("?")[0]]).catch(() => undefined);
  }
  await db.from("ai_video_templates").update({ preview_url: previewUrl, updated_at: now() }).eq("id", tpl.id);
  return { previewUrl };
}

// ── QPay ─────────────────────────────────────────────────────────────────────
async function qpayCallback(videoId: string, body: Record<string, unknown>) {
  let invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : "";
  if (isUuid(videoId)) {
    const { data } = await db.from("album_ai_videos").select("qpay_invoice_id").eq("id", videoId).maybeSingle();
    if (data?.qpay_invoice_id) invoiceId = data.qpay_invoice_id;
  }
  if (!invoiceId) return;
  const { data: row } = await db.from("album_ai_videos").select("id, status").eq("qpay_invoice_id", invoiceId).maybeSingle();
  if (!row || row.status !== "pending_payment") return;
  const paid = await checkQpayPaid(invoiceId);
  if (!paid.isPaid) return;
  await markPaid(row.id, paid.paymentId);
  // Төлбөр орсон даруйд видеог эхлүүлнэ (эзэн хуудсаа хаасан ч)
  const v = await reload(row.id);
  if (v && v.status === "paid" && (await claimStart(v))) await beginVideo(v);
}

/** pending_payment → paid шилжилтийг нэг удаа хийж, орлогыг хуваарилна */
async function markPaid(id: string, paymentId: string) {
  const { data: rows } = await db.from("album_ai_videos")
    .update({ status: "paid", paid_at: now(), qpay_payment_id: paymentId, updated_at: new Date(Date.now() - 60000).toISOString() })
    .eq("id", id).eq("status", "pending_payment")
    .select("id, album_id, amount_mnt, owner_share");
  const v = rows?.[0];
  if (!v) return;
  try {
    const ownerAmount = Math.round(v.amount_mnt * Number(v.owner_share ?? 0));
    const platformAmount = v.amount_mnt - ownerAmount;
    if (ownerAmount > 0) {
      const { data: album } = await db.from("albums").select("owner_id").eq("id", v.album_id).maybeSingle();
      if (album?.owner_id) await db.rpc("increment_wallet_pending", { p_user_id: album.owner_id, p_amount: ownerAmount });
    }
    if (platformAmount > 0) await db.rpc("increment_platform_wallet", { p_amount: platformAmount });
  } catch (e) {
    console.error("wallet credit failed (paid anyway):", e);
  }
}

let cachedToken: { value: string; expires: number } | null = null;
async function qpayToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;
  const res = await fetch(`${QPAY_BASE}/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${QPAY_USERNAME}:${QPAY_PASSWORD}`)}` },
  });
  if (!res.ok) throw new Error(`QPay token failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
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
      sender_staff_code: "albumvideo",
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
      body: JSON.stringify({ object_type: "INVOICE", object_id: invoiceId, offset: { page_number: 1, page_limit: 100 } }),
    });
    if (!res.ok) return { isPaid: false, paymentId: "" };
    const data = await res.json();
    const row = (data.rows ?? []).find((r: { payment_status?: string }) => !r.payment_status || r.payment_status === "PAID");
    return { isPaid: !!row, paymentId: row?.payment_id ?? "" };
  } catch (e) {
    console.error("QPay check failed:", e);
    return { isPaid: false, paymentId: "" };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function friendlyError(raw: string): string {
  if (!raw) return "AI видеог бүтээж чадсангүй.";
  if (/safety|blocked|prohibited|rai|filtered/i.test(raw)) {
    return "AI энэ зураг эсвэл загварыг аюулгүй байдлын шалтгаанаар татгалзлаа. Өөр зураг эсвэл загвар сонгоно уу.";
  }
  if (/\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i.test(raw)) return "AI сервер завгүй байна. Хэсэг хугацааны дараа дахин оролдоно уу.";
  return "AI видеог бүтээж чадсангүй. Нэмэлт төлбөргүйгээр дахин оролдоно уу.";
}

function sniffMime(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b.length > 11 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "image/jpeg";
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
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
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
