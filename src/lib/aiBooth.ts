// AI бүүтийн клиент: Edge Function дуудлага + лого/бичиг давхарлах.
import { applyWatermark } from './watermark';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-booth`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const headers = {
  Authorization: `Bearer ${ANON_KEY}`,
  apikey: ANON_KEY,
  'Content-Type': 'application/json',
};

export const MAX_PEOPLE = 4;

export const POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
] as const;
export type Position = typeof POSITIONS[number];

export const POSITION_LABELS: Record<string, string> = {
  'top-left': 'Дээд зүүн', 'top-center': 'Дээд төв', 'top-right': 'Дээд баруун',
  'middle-left': 'Дунд зүүн', 'center': 'Төв', 'middle-right': 'Дунд баруун',
  'bottom-left': 'Доод зүүн', 'bottom-center': 'Доод төв', 'bottom-right': 'Доод баруун',
};

export interface BoothTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  preview_url: string;
  aspect_ratio: string;
  max_people: number;
}

export interface BoothOverlay {
  logo_url: string;
  logo_position: string;
  logo_size: number;
  overlay_text: string;
  text_position: string;
  text_color: string;
}

export interface BoothInfo {
  closed: boolean;
  album: {
    id: string;
    name: string;
    event_date: string;
    watermark_type: string;
    watermark_value: string;
    watermark_position: string;
  };
  booth: BoothOverlay & { price_mnt: number; add_to_album: boolean; max_people: number };
  templates: BoothTemplate[];
}

export interface StartResult {
  jobId: string;
  key: string;
  status: string;
  amount: number;
  qrImage?: string;
  qrText?: string;
  urls?: { name: string; description: string; link: string; logo?: string }[];
}

export interface JobStatus {
  status: 'pending_payment' | 'paid' | 'processing' | 'generated' | 'done' | 'failed' | 'expired';
  amount?: number;
  attemptsLeft?: number;
  error?: string;
  rawUrl?: string;
  resultToken?: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FN_URL}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && typeof data === 'object' && 'error' in data && data.error && !('status' in data))) {
    throw new Error((data as { error?: string }).error || `Алдаа (${res.status})`);
  }
  return data as T;
}

export const boothApi = {
  info: (boothToken: string) => call<BoothInfo>(`/booth/${encodeURIComponent(boothToken)}`),
  start: (boothToken: string, templateId: string, kiosk: boolean) =>
    call<StartResult>('/start', { method: 'POST', body: JSON.stringify({ boothToken, templateId, kiosk }) }),
  status: (jobId: string, key: string) =>
    call<JobStatus>(`/status/${jobId}?key=${encodeURIComponent(key)}`),
  generate: (p: { jobId: string; key: string; image: string; peopleCount: number | null; addToAlbum: boolean }) =>
    call<JobStatus>('/generate', { method: 'POST', body: JSON.stringify(p) }),
  finalize: (p: { jobId: string; key: string; final: string; preview?: string }) =>
    call<{ status: string; resultToken: string; addedToAlbum?: boolean }>('/finalize', {
      method: 'POST', body: JSON.stringify(p),
    }),
  result: (resultToken: string) =>
    call<{ imageUrl: string; albumName: string; templateName: string; createdAt: string; expiresAt: string }>(
      `/result/${encodeURIComponent(resultToken)}`,
    ),
};

// ── Зураг боловсруулалт ─────────────────────────────────────────────────────

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Зураг ачаалж чадсангүй'));
    img.src = src;
  });
}

export function canvasToDataUrl(canvas: HTMLCanvasElement, quality = 0.9): string {
  return canvas.toDataURL('image/jpeg', quality);
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality),
  );
}

/** Урт талыг maxSide хүртэл багасгаж шинэ canvas буцаана. */
export function scaleCanvas(src: HTMLCanvasElement | HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function anchor(position: string, W: number, H: number, w: number, h: number, pad: number) {
  const cx = (W - w) / 2;
  const cy = (H - h) / 2;
  switch (position) {
    case 'top-left': return { x: pad, y: pad };
    case 'top-center': return { x: cx, y: pad };
    case 'top-right': return { x: W - w - pad, y: pad };
    case 'middle-left': return { x: pad, y: cy };
    case 'center':
    case 'middle-center': return { x: cx, y: cy };
    case 'middle-right': return { x: W - w - pad, y: cy };
    case 'bottom-left': return { x: pad, y: H - h - pad };
    case 'bottom-center': return { x: cx, y: H - h - pad };
    case 'bottom-right':
    default: return { x: W - w - pad, y: H - h - pad };
  }
}

/**
 * AI-ийн түүхий зураг дээр зохион байгуулагчийн лого, арга хэмжээний нэрийг давхарлана.
 * AI бичиг/логог гажуудуулдаг тул энэ алхмыг кодоор хийнэ.
 */
export async function composeFinal(rawUrl: string, overlay: BoothOverlay): Promise<HTMLCanvasElement> {
  const raw = await loadImage(rawUrl);
  const canvas = document.createElement('canvas');
  canvas.width = raw.naturalWidth;
  canvas.height = raw.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(raw, 0, 0);
  const W = canvas.width;
  const H = canvas.height;
  const pad = Math.round(Math.min(W, H) * 0.04);

  if (overlay.logo_url) {
    try {
      const logo = await loadImage(overlay.logo_url);
      const lw = Math.round(W * (overlay.logo_size || 22) / 100);
      const lh = Math.round(logo.naturalHeight * (lw / logo.naturalWidth));
      const { x, y } = anchor(overlay.logo_position, W, H, lw, lh, pad);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = Math.round(W * 0.01);
      ctx.drawImage(logo, x, y, lw, lh);
      ctx.restore();
    } catch (err) {
      console.warn('Logo overlay failed:', err);
    }
  }

  const text = overlay.overlay_text?.trim();
  if (text) {
    let fontSize = Math.round(W * 0.05);
    ctx.save();
    const setFont = () => { ctx.font = `700 ${fontSize}px "Inter", "Segoe UI", Arial, sans-serif`; };
    setFont();
    // Хэт урт бол багтаана
    while (ctx.measureText(text).width > W - pad * 2 && fontSize > 12) {
      fontSize -= 2;
      setFont();
    }
    const tw = ctx.measureText(text).width;
    const th = fontSize;
    const { x, y } = anchor(overlay.text_position, W, H, tw, th * 1.2, pad);
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, fontSize / 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = fontSize / 4;
    ctx.strokeText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = overlay.text_color || '#ffffff';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  return canvas;
}

/** Цомгийн preview-д зориулсан жижиг, усан тэмдэгтэй хувилбар. */
export async function makeAlbumPreview(
  finalCanvas: HTMLCanvasElement,
  watermark: { type: string; value: string; position: string },
): Promise<string> {
  const small = scaleCanvas(finalCanvas, 1200);
  const blob = await canvasToBlob(small, 0.9);
  const file = new File([blob], 'preview.jpg', { type: 'image/jpeg' });
  // Цомгийн бусад зурагтай ижил хамгаалалт: зураг лого эсвэл давтагдах бичиг
  const useImage = watermark.type === 'image' && !!watermark.value;
  const marked = await applyWatermark(file, {
    type: useImage ? 'image' : 'text',
    value: useImage ? watermark.value : (watermark.type === 'text' && watermark.value) || 'zuragchin.mn',
    position: 'center',
    opacity: 0.35,
  });
  return await blobToDataUrl(marked);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Утсан дээр "Хадгалах": боломжтой бол Share sheet (iPhone → Save Image), үгүй бол татах. */
export async function saveImageToDevice(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/jpeg' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

// Төлбөр төлөгдсөн job-ийг хуудас дахин ачаалагдахад сэргээх
const JOB_KEY = 'aibooth.job';
export interface StoredJob { boothToken: string; jobId: string; key: string; templateId: string }

export function rememberJob(job: StoredJob) {
  try { sessionStorage.setItem(JOB_KEY, JSON.stringify(job)); } catch { /* ignore */ }
}
export function recallJob(boothToken: string): StoredJob | null {
  try {
    const raw = sessionStorage.getItem(JOB_KEY);
    if (!raw) return null;
    const job = JSON.parse(raw) as StoredJob;
    return job.boothToken === boothToken ? job : null;
  } catch { return null; }
}
export function forgetJob() {
  try { sessionStorage.removeItem(JOB_KEY); } catch { /* ignore */ }
}
