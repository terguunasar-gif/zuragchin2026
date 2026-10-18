// Google Veo (Gemini API) — AI зургаас тохирох хөдөлгөөнтэй богино видео үүсгэх.
// predictLongRunning → operation name → GET operation (done) → video uri → татаж авах.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

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
}

export class VeoError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

/** Видео үүсгэлтийг эхлүүлж operation name буцаана. Параметр татгалзвал хялбаршуулж дахин оролдоно. */
export async function startVeo(o: VeoStartOptions): Promise<string> {
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
  const res = await fetch(uri, { headers: { "x-goog-api-key": apiKey }, redirect: "follow" });
  if (!res.ok) throw new VeoError(`Veo download ${res.status}`, res.status);
  return new Uint8Array(await res.arrayBuffer());
}
