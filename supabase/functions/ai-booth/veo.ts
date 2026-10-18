// Google Veo (Gemini API) — AI зургаас «камер тойрох» видео үүсгэх.
// predictLongRunning → operation name → GET operation (done) → video uri → татаж авах.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * «Bullet time» — цаг зогссон мөч. Эхний кадр = урдаас (AI зураг), сүүлийн кадр = хажуу-араас харсан ижил мөч.
 * Veo хоёр кадрын хооронд камерыг тойруулна — хүнийг давхардуулахгүй, шинэ хүн зохиохгүй.
 */
export const ORBIT_PROMPT = [
  "Bullet time arc shot. Time is completely frozen like a paused photograph:",
  "the people do not move at all — no walking, no turning, no blinking, no talking, no gestures.",
  "Champagne spray, liquid drops, confetti, hair and clothes hang frozen in mid-air.",
  "Only the camera moves: a smooth, steady cinematic orbit around the frozen people,",
  "travelling from the front view of the first frame around their side to the view of the last frame, always keeping them centred.",
  "Each person exists exactly once — never duplicate a person, never add new people.",
  "Keep faces, identity, clothing, lighting and the scene exactly the same. Photorealistic, sharp, no morphing.",
  "Soft cinematic whoosh and ambient music, no speech.",
].join(" ");

/** Хажуу-арын кадрыг Gemini зургийн загвараар гаргах заавар */
export const SIDE_VIEW_PROMPT = [
  "Recreate this exact photo at the very same frozen instant, but seen from a different camera position:",
  "the camera has orbited about 120 degrees around the main people to their right side, showing them in a three-quarter rear / side profile view.",
  "Same people (each exactly once), same faces, hairstyles, clothing, pose, same frozen champagne spray and confetti, same venue and lighting,",
  "now seen from the new angle with the background correctly changing for that viewpoint.",
  "Photorealistic, same camera lens and colour grade. Do not add or duplicate people. No text.",
].join(" ");

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
    durationSeconds: o.durationSeconds ?? 8,
    resolution: o.resolution ?? "720p",
    personGeneration: "allow_adult",
  };
  const attempts: Record<string, unknown>[] = [full, { aspectRatio: full.aspectRatio, personGeneration: "allow_adult" }, { aspectRatio: full.aspectRatio }];
  let lastErr = "";
  // Сүүлийн кадртай → (татгалзвал) сүүлийн кадргүй
  const frameSets = o.lastFrame ? [true, false] : [false];
  for (const withLast of frameSets) for (const form of imageForms) {
    for (const parameters of attempts) {
      const instance: Record<string, unknown> = { prompt: o.prompt ?? ORBIT_PROMPT, image: form(o.image) };
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
