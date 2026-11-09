// AI зургаас богино видео үүсгэх — хоёр үйлчилгээ үзүүлэгчтэй (update-84):
//
//  • fal.ai (FAL_KEY secret байвал анхдагч) — queue API: submit → status → result → video.url
//      Загвар: FAL_VIDEO_MODEL (анхдагч google/gemini-omni-flash/v1.2/image-to-video).
//      Operation-ийг "fal|<response_url>" хэлбэрээр хадгална.
//  • Google Veo (Gemini API) — predictLongRunning → operation → video uri.
//      АНХААР: veo-3.1-*-preview загварууд 2026-10-22-нд хаагдсан. FAL_KEY-гүй бол
//      GEMINI_VIDEO_MODEL / ALBUM_VIDEO_MODEL-д ажиллаж буй загвар заавал тохируулна.
//
// startVeo / pollVeo / downloadVeo-ийн интерфейс өөрчлөгдөөгүй тул ai-booth, album-video хоёулаа шууд ажиллана.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const FAL_KEY = Deno.env.get("FAL_KEY") ?? "";
const FAL_VIDEO_MODEL = Deno.env.get("FAL_VIDEO_MODEL") || "google/gemini-omni-flash/v1.2/image-to-video";
const FAL_QUEUE = "https://queue.fal.run";

/** fal.ai ашиглах эсэх (FAL_KEY байвал) */
export function usingFal(): boolean {
  return !!FAL_KEY;
}

/** AI-аас зурагт тохирох хөдөлгөөн асуух заавар */
const MOTION_INSTRUCTION = [
  "You are directing a 6-second photorealistic video made from this still photo.",
  "Choose ONE short, natural, fun motion that fits this exact scene and makes it come alive. Examples:",
  "elves or costumed people dancing happily and kicking their feet; champagne bursting and foam spraying out of the bottle while people cheer;",
  "snow swirling and the people smiling and waving; confetti falling while the couple laughs and hugs; sparklers glittering.",
  "Keep the motion gentle enough that faces stay recognisable. The camera stays mostly steady (a slow push-in is fine).",
  "Do not change, add or remove people. Reply with ONLY the motion description as one or two English sentences (max 45 words).",
].join(" ");

/** Хөдөлгөөний тайлбарт царай, хүн хадгалах нөхцөл нэмж Veo-гийн эцсийн заавар болгоно */
export function motionVideoPrompt(motion: string): string {
  return [
    motion.trim(),
    "Everyone keeps exactly the same face, identity, hairstyle and clothing as in the image; each person appears exactly once; no new people.",
    "Realistic natural movement, photorealistic, sharp, stable, no morphing faces, no text or captions.",
    "Lively ambient sound matching the scene, no speech.",
  ].join(" ");
}

/** «✨ Glam Motion» — Glambot маягийн удаашруулсан кино камер (цомгийн видео ба AI бүүт хоёулаа ашиглана).
 *  action = камерын хөдөлгөөн + эффект (англиар). */
export function glamVideoPrompt(action: string, seconds: number): string {
  return [
    `A ${seconds}-second cinematic slow-motion video that starts from this exact photo,`,
    "filmed like a high-speed robotic 'glam cam' at 120 frames per second played back in smooth slow motion.",
    `Camera and effect: ${action.trim()}`,
    "The people hold their pose with only small, graceful natural movements in slow motion: hair and clothing flowing softly, a gentle smile, a blink.",
    "Rich depth and parallax between foreground, people and background; shallow depth of field; luxurious warm cinematic lighting.",
    "Every person keeps exactly the same face, identity, hairstyle and clothing as in the photo; each person appears exactly once; no new people; no morphing.",
    "Sharp, stable, photorealistic. No text, captions, subtitles or logos.",
    "Elegant cinematic music swell with soft whoosh, no speech.",
  ].join(" ");
}

/** AI бүүтийн Glam видеоны анхдагч камер — ямар ч темплетэд тохирно */
export const BOOTH_GLAM_ACTION =
  "A very slow, smooth dolly push-in toward the people with a slight upward arc. A soft breeze lifts hair and fabric in slow motion; tiny golden sparkles float and glitter in the light.";

export const FALLBACK_MOTION =
  "The people smile, laugh and move joyfully in place; lights twinkle and sparkles drift through the air; slow gentle camera push-in.";

/** Gemini (текст) — зургийг хараад тохирох хөдөлгөөнийг санал болгоно. Алдаа гарвал ерөнхий хөдөлгөөн. */
export async function suggestMotion(apiKey: string, model: string, image: { mimeType: string; data: string }): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: image.mimeType, data: image.data } }, { text: MOTION_INSTRUCTION }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
      }),
    });
    if (!res.ok) throw new Error(`motion ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "").join(" ").replace(/\s+/g, " ").trim();
    return text && text.length > 10 ? text.slice(0, 400) : FALLBACK_MOTION;
  } catch (e) {
    console.error("suggestMotion failed:", e instanceof Error ? e.message : e);
    return FALLBACK_MOTION;
  }
}

// ── update-91: видеоны формат (босоо/хэвтээ) хүний тоогоор ─────────────────────
// 1–2 хүн → босоо 9:16 (утсанд үзэх); 3+ хүн → зургийн хэлбэрээр (хэвтээ зураг бол 16:9).

/** Зургийн өргөн/өндрийг толгой хэсгээс уншина (PNG, JPEG, WebP). Танихгүй бол null. */
export function imageDims(b: Uint8Array): { w: number; h: number } | null {
  try {
    if (b[0] === 0x89 && b[1] === 0x50) { // PNG IHDR
      const dv = new DataView(b.buffer, b.byteOffset);
      return { w: dv.getUint32(16), h: dv.getUint32(20) };
    }
    if (b[0] === 0xff && b[1] === 0xd8) { // JPEG — SOFn маркер хайна
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        const len = (b[i + 2] << 8) | b[i + 3];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
        }
        i += 2 + len;
      }
      return null;
    }
    if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) { // RIFF....WEBP
      const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (fourcc === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      if (fourcc === "VP8 ") return { w: ((b[27] << 8) | b[26]) & 0x3fff, h: ((b[29] << 8) | b[28]) & 0x3fff };
      if (fourcc === "VP8L") {
        const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
        return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
      }
    }
  } catch { /* эвдэрсэн толгой */ }
  return null;
}

/** 1–2 хүн → 9:16; бусад үед (эсвэл тоо мэдэгдэхгүй) зургийн хэлбэрээр */
export function videoAspectFor(people: number | null, dims: { w: number; h: number } | null): "9:16" | "16:9" {
  if (people !== null && people >= 1 && people <= 2) return "9:16";
  if (!dims) return "16:9";
  return dims.h > dims.w * 1.05 ? "9:16" : "16:9";
}

/** Хэвтээ зургаас босоо видео гаргахад хүмүүс таслагдахгүй байх заавар */
export const VERTICAL_FRAMING =
  "Vertical 9:16 phone framing: keep every person fully inside the frame and centered, never crop anyone out.";

/** Зурагт хэдэн хүн байгааг Gemini-ээр тоолно (царай нь тод харагдах). Алдаа гарвал null. */
export async function countPeople(apiKey: string, model: string, image: { mimeType: string; data: string }): Promise<number | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { inlineData: { mimeType: image.mimeType, data: image.data } },
          { text: "How many people are the main subjects of this photo (faces clearly visible, ignore tiny background crowd)? Reply with only one integer." },
        ] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!res.ok) throw new Error(`count ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join(" ");
    const n = parseInt(text.match(/\d+/)?.[0] ?? "", 10);
    return Number.isFinite(n) && n >= 0 && n < 200 ? n : null;
  } catch (e) {
    console.error("countPeople failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export interface VeoStartOptions {
  apiKey: string;
  model: string;
  image: { mimeType: string; data: string };
  /** Сүүлийн кадр (заавал биш) — байвал камер эхнээс сүүлийн кадр руу тойрно */
  lastFrame?: { mimeType: string; data: string } | null;
  prompt?: string;
  durationSeconds?: number;
  aspectRatio?: "9:16" | "16:9";
  resolution?: "720p" | "1080p";
  /** fal.ai дуусмагц POST хийх URL (заавал биш) — polling-оос гадна хурдан дуусгана */
  webhookUrl?: string;
}

export class VeoError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

/** Видео үүсгэлтийг эхлүүлж operation name буцаана. Параметр татгалзвал хялбаршуулж дахин оролдоно. */
export async function startVeo(o: VeoStartOptions): Promise<string> {
  if (FAL_KEY) return await startFal(o);
  // Gemini API-ийн Veo predictLongRunning нь bytesBase64Encoded хэлбэрийг хүлээж авна
  // (inlineData-г «isn't supported» гэж татгалздаг). Аль алиныг нь оролдоно.
  const asBytes = (i: { mimeType: string; data: string }) => ({ bytesBase64Encoded: i.data, mimeType: i.mimeType });
  const asInline = (i: { mimeType: string; data: string }) => ({ inlineData: { mimeType: i.mimeType, data: i.data } });
  const imageForms = [asBytes, asInline];
  const full = {
    aspectRatio: o.aspectRatio ?? "9:16",
    durationSeconds: o.durationSeconds ?? 6,
    resolution: o.resolution ?? "720p",
    personGeneration: "allow_adult",
  };
  const attempts: Record<string, unknown>[] = [full, { aspectRatio: full.aspectRatio, personGeneration: "allow_adult" }, { aspectRatio: full.aspectRatio }];
  let lastErr = "";
  // Сүүлийн кадртай → (татгалзвал) сүүлийн кадргүй
  const frameSets = o.lastFrame ? [true, false] : [false];
  for (const withLast of frameSets) for (const form of imageForms) {
    for (const parameters of attempts) {
      const instance: Record<string, unknown> = { prompt: o.prompt ?? motionVideoPrompt(FALLBACK_MOTION), image: form(o.image) };
      if (withLast && o.lastFrame) instance.lastFrame = form(o.lastFrame);
      const res = await fetch(`${API_BASE}/models/${o.model}:predictLongRunning`, {
        method: "POST",
        headers: { "x-goog-api-key": o.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ instances: [instance], parameters }),
      });
      const text = await res.text();
      if (res.ok) {
        const data = JSON.parse(text);
        if (typeof data?.name === "string" && data.name) return data.name;
        throw new VeoError(`Veo: operation name missing: ${text.slice(0, 300)}`);
      }
      lastErr = `Veo start ${res.status}: ${text.slice(0, 500)}`;
      // Зөвхөн хүсэлтийн хэлбэрийн алдаа (400) үед өөр хэлбэрээр дахин оролдоно
      if (res.status !== 400) throw new VeoError(lastErr, res.status);
      // Зургийн хэлбэр буруу бол параметр солих нь утгагүй — дараагийн хэлбэр рүү
      if (/inlineData|bytesBase64Encoded|image/i.test(text) && /support|unknown|invalid/i.test(text)) break;
    }
  }
  throw new VeoError(lastErr, 400);
}

export type VeoPoll =
  | { done: false }
  | { done: true; videoUri: string }
  | { done: true; error: string };

export async function pollVeo(apiKey: string, operationName: string): Promise<VeoPoll> {
  if (operationName.startsWith("fal|")) return await pollFal(operationName.slice(4));
  const res = await fetch(`${API_BASE}/${operationName}`, { headers: { "x-goog-api-key": apiKey } });
  const text = await res.text();
  if (!res.ok) throw new VeoError(`Veo poll ${res.status}: ${text.slice(0, 300)}`, res.status);
  const data = JSON.parse(text);
  if (!data?.done) return { done: false };
  if (data.error) return { done: true, error: JSON.stringify(data.error).slice(0, 500) };
  const resp = data.response?.generateVideoResponse ?? data.response ?? {};
  const uri = resp?.generatedSamples?.[0]?.video?.uri ?? resp?.generatedVideos?.[0]?.video?.uri ?? "";
  if (!uri) {
    // Аюулгүй байдлын шүүлтүүрт орсон эсвэл хоосон хариу
    const reason = JSON.stringify(resp?.raiMediaFilteredReasons ?? resp).slice(0, 500);
    return { done: true, error: `Veo: no video (${reason})` };
  }
  return { done: true, videoUri: uri };
}

export async function downloadVeo(apiKey: string, uri: string): Promise<Uint8Array> {
  // Google-ийн файл түлхүүр шаарддаг; fal.ai-ийн CDN линк нийтийн
  const isGoogle = uri.includes("generativelanguage.googleapis.com");
  const res = await fetch(uri, { headers: isGoogle ? { "x-goog-api-key": apiKey } : {}, redirect: "follow" });
  if (!res.ok) throw new VeoError(`Video download ${res.status}`, res.status);
  return new Uint8Array(await res.arrayBuffer());
}

// ── fal.ai ───────────────────────────────────────────────────────────────────

/** Загвар бүрийн оролтын хэлбэр өөр — Kling: duration "5"/"10", aspect-гүй; бусад: integer секунд */
function falInput(model: string, o: VeoStartOptions, imageDataUri: string, minimal: boolean): Record<string, unknown> {
  const prompt = o.prompt ?? motionVideoPrompt(FALLBACK_MOTION);
  const secs = o.durationSeconds ?? 6;
  if (minimal) return { prompt, image_url: imageDataUri };
  if (/kling/i.test(model)) {
    return {
      prompt,
      image_url: imageDataUri,
      duration: secs > 7 ? "10" : "5",
      negative_prompt: "morphing faces, extra people, distorted hands, blur, text, watermark, low quality",
    };
  }
  return {
    prompt,
    image_url: imageDataUri,
    aspect_ratio: o.aspectRatio ?? "9:16",
    resolution: o.resolution ?? "720p",
    duration: Math.max(3, Math.min(15, Math.round(secs))),
  };
}

async function startFal(o: VeoStartOptions): Promise<string> {
  // Endpoint ID нь "owner/app/..." хэлбэртэй; Veo-гийн нэр ирвэл FAL_VIDEO_MODEL-ийг ашиглана
  const model = o.model.includes("/") ? o.model : FAL_VIDEO_MODEL;
  const dataUri = `data:${o.image.mimeType};base64,${o.image.data}`;
  const qs = o.webhookUrl ? `?fal_webhook=${encodeURIComponent(o.webhookUrl)}` : "";
  let lastErr = "";
  for (const minimal of [false, true]) {
    const res = await fetch(`${FAL_QUEUE}/${model}${qs}`, {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(falInput(model, o, dataUri, minimal)),
    });
    const text = await res.text();
    if (res.ok) {
      const data = JSON.parse(text);
      const id = String(data?.request_id ?? "");
      if (!id) throw new VeoError(`fal: request_id missing: ${text.slice(0, 300)}`);
      // response_url байхгүй бол owner/app-аас бүтээнэ (queue URL зөвхөн эхний 2 хэсгийг ашигладаг)
      const app = model.split("/").slice(0, 2).join("/");
      const responseUrl = String(data?.response_url || `${FAL_QUEUE}/${app}/requests/${id}`);
      return `fal|${responseUrl}`;
    }
    lastErr = `fal start ${res.status}: ${text.slice(0, 500)}`;
    // 422 = параметр буруу → хамгийн бага оролтоор дахин; бусад алдааг шууд шиднэ
    if (res.status !== 422) throw new VeoError(lastErr, res.status);
  }
  throw new VeoError(lastErr, 422);
}

async function pollFal(responseUrl: string): Promise<VeoPoll> {
  const auth = { Authorization: `Key ${FAL_KEY}` };
  const st = await fetch(`${responseUrl}/status`, { headers: auth });
  const stText = await st.text();
  if (!st.ok) throw new VeoError(`fal status ${st.status}: ${stText.slice(0, 300)}`, st.status);
  const status = JSON.parse(stText);
  if (status?.status !== "COMPLETED") return { done: false };
  if (status?.error) return { done: true, error: `fal: ${String(status.error).slice(0, 500)}` };

  const res = await fetch(responseUrl, { headers: auth });
  const text = await res.text();
  // Загварын алдаа (аюулгүй байдал, 422, 500) энд ирнэ — дахин оролдох шаардлагатай
  if (!res.ok) return { done: true, error: `fal result ${res.status}: ${text.slice(0, 500)}` };
  const data = JSON.parse(text);
  const url = data?.video?.url ?? data?.videos?.[0]?.url ?? "";
  if (!url) return { done: true, error: `fal: no video (${text.slice(0, 300)})` };
  return { done: true, videoUri: String(url) };
}
