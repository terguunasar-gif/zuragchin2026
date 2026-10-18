// Google Veo (Gemini API) — AI зургаас «камер тойрох» видео үүсгэх.
// predictLongRunning → operation name → GET operation (done) → video uri → татаж авах.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Хүмүүс хөдөлгөөнгүй (bullet time), зөвхөн камер бүтэн 360° тойрно. */
export const ORBIT_PROMPT = [
  "Bullet-time freeze-frame shot.",
  "Everyone in the image is completely frozen and motionless, like statues: no blinking, no breathing,",
  "no facial expression change, no body movement; hair, clothes, confetti and liquids are frozen in mid-air.",
  "Only the camera moves: one smooth, steady, full 360-degree cinematic orbit around the people at constant speed,",
  "starting in front of them, travelling around their sides and back, and returning to the front by the end of the clip.",
  "The camera keeps the people centred and at the same distance the whole time.",
  "Keep every person's face, identity, skin tone, body shape, clothing and the whole scene exactly as in the image.",
  "Photorealistic, sharp, stable, no morphing, no warping faces, no extra people, no text, no captions.",
  "Soft elegant cinematic ambient music, no speech.",
].join(" ");

export interface VeoStartOptions {
  apiKey: string;
  model: string;
  image: { mimeType: string; data: string };
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
  const imageForms = [
    { bytesBase64Encoded: o.image.data, mimeType: o.image.mimeType },
    { inlineData: { mimeType: o.image.mimeType, data: o.image.data } },
  ];
  const full = {
    aspectRatio: o.aspectRatio ?? "9:16",
    durationSeconds: o.durationSeconds ?? 8,
    resolution: o.resolution ?? "720p",
    personGeneration: "allow_adult",
  };
  const attempts: Record<string, unknown>[] = [full, { aspectRatio: full.aspectRatio, personGeneration: "allow_adult" }, { aspectRatio: full.aspectRatio }];
  let lastErr = "";
  for (const image of imageForms) {
    for (const parameters of attempts) {
      const instance = { prompt: o.prompt ?? ORBIT_PROMPT, image };
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
