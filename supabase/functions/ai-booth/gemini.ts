// Google Gemini (Nano Banana 2) зураг үүсгэх дуудлага.
// Үндсэндээ шинэ Interactions API ашиглана; 404 бол generateContent руу автоматаар шилжинэ.

export interface InlineImage {
  mimeType: string;
  data: string; // base64 (data: угтваргүй)
}

export interface GenerateOptions {
  apiKey: string;
  model: string;
  prompt: string;
  images: InlineImage[];
  aspectRatio: string;
  imageSize: "1K" | "2K" | "4K";
  timeoutMs?: number;
}

export interface GenerateResult {
  image: InlineImage;
  text: string;
}

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiError extends Error {
  constructor(message: string, public status = 0, public retryable = true) {
    super(message);
  }
}

export async function generateImage(opts: GenerateOptions): Promise<GenerateResult> {
  const style = (Deno.env.get("GEMINI_API_STYLE") ?? "interactions").toLowerCase();
  if (style === "generatecontent") return await viaGenerateContent(opts);
  try {
    return await viaInteractions(opts);
  } catch (e) {
    if (e instanceof GeminiError && (e.status === 404 || e.status === 405)) {
      return await viaGenerateContent(opts);
    }
    throw e;
  }
}

async function viaInteractions(opts: GenerateOptions): Promise<GenerateResult> {
  const body = {
    model: opts.model,
    input: [
      { type: "text", text: opts.prompt },
      ...opts.images.map((img) => ({ type: "image", mime_type: img.mimeType, data: img.data })),
    ],
    response_format: {
      type: "image",
      mime_type: "image/jpeg",
      aspect_ratio: opts.aspectRatio,
      image_size: opts.imageSize,
    },
  };
  const json = await post(`${API_BASE}/interactions`, opts, body);
  return toResult(json);
}

async function viaGenerateContent(opts: GenerateOptions): Promise<GenerateResult> {
  const body = {
    contents: [{
      role: "user",
      parts: [
        { text: opts.prompt },
        ...opts.images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data } })),
      ],
    }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: opts.aspectRatio, imageSize: opts.imageSize },
    },
  };
  const url = `${API_BASE}/models/${encodeURIComponent(opts.model)}:generateContent`;
  const json = await post(url, opts, body);
  return toResult(json);
}

async function post(url: string, opts: GenerateOptions, body: unknown): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": opts.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new GeminiError(`Gemini холболтын алдаа: ${e instanceof Error ? e.message : e}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) {
    // 400 (буруу хүсэлт / аюулгүй байдлын татгалзал) дахин оролдоход засрахгүй
    const retryable = res.status === 429 || res.status >= 500;
    throw new GeminiError(`Gemini ${res.status}: ${text.slice(0, 500)}`, res.status, retryable);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini хариу JSON биш байна");
  }
}

function toResult(json: unknown): GenerateResult {
  const image = extractImage(json);
  const text = extractText(json);
  if (!image) {
    throw new GeminiError(
      `Gemini зураг буцаасангүй${text ? `: ${text.slice(0, 300)}` : ""}`,
      200,
      true,
    );
  }
  return { image, text };
}

/**
 * Хариуны бүтэц API хувилбараас хамаарч өөр байдаг (output_image, outputImage,
 * candidates[].content.parts[].inlineData ...). Тиймээс base64 зураг агуулсан
 * объектыг рекурсив хайж олно.
 */
export function extractImage(node: unknown, depth = 0): InlineImage | null {
  if (depth > 12 || node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractImage(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const mime = (obj.mimeType ?? obj.mime_type) as unknown;
  const data = obj.data as unknown;
  if (
    typeof data === "string" && data.length > 200 &&
    (typeof mime !== "string" || mime.startsWith("image/"))
  ) {
    return { mimeType: typeof mime === "string" ? mime : "image/png", data };
  }
  // Түгээмэл түлхүүрүүдийг эхэлж шалгана
  for (const key of ["output_image", "outputImage", "inlineData", "inline_data", "image"]) {
    if (key in obj) {
      const found = extractImage(obj[key], depth + 1);
      if (found) return found;
    }
  }
  for (const value of Object.values(obj)) {
    const found = extractImage(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function extractText(node: unknown, depth = 0, out: string[] = []): string {
  if (depth > 12 || node === null || typeof node !== "object") return out.join(" ");
  if (Array.isArray(node)) {
    node.forEach((n) => extractText(n, depth + 1, out));
  } else {
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if ((k === "text" || k === "output_text" || k === "outputText" || k === "finishReason") && typeof v === "string") {
        out.push(v);
      } else if (typeof v === "object") {
        extractText(v, depth + 1, out);
      }
    }
  }
  return out.join(" ").trim();
}
