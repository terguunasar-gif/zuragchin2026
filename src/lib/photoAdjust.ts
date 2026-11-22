/** Угаалгахын өмнөх гэрэл/өнгөний засвар. Бүх утга −100…+100, 0 = өөрчлөлтгүй. */
export interface PhotoAdjust {
  exposure?: number;    // Гэрэл
  contrast?: number;    // Тодрол (контраст)
  highlights?: number;  // Гэрэлтэй хэсэг
  shadows?: number;     // Сүүдэр
  saturation?: number;  // Өнгөний ханалт
  temperature?: number; // Дулаан (+) / Хүйтэн (−)
}

export const ADJUST_FIELDS: { key: keyof PhotoAdjust; label: string; left: string; right: string }[] = [
  { key: 'exposure', label: 'Гэрэл', left: 'Бараан', right: 'Гэгээлэг' },
  { key: 'contrast', label: 'Тодрол (контраст)', left: 'Зөөлөн', right: 'Тод' },
  { key: 'highlights', label: 'Гэрэлтэй хэсэг', left: 'Бууруулах', right: 'Нэмэх' },
  { key: 'shadows', label: 'Сүүдэр', left: 'Гүнзгий', right: 'Нээх' },
  { key: 'saturation', label: 'Өнгөний ханалт', left: 'Бүдэг', right: 'Тод өнгө' },
  { key: 'temperature', label: 'Өнгөний дулаан', left: 'Хүйтэн (цэнхэр)', right: 'Дулаан (шар)' },
];

export function isNeutral(a?: PhotoAdjust | null): boolean {
  return !a || ADJUST_FIELDS.every(f => !Number(a[f.key]));
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Canvas-ийн пикселүүдэд засварыг шууд хэрэгжүүлнэ (урьдчилан харах, хэвлэх хоёуланд ижил) */
export function applyAdjustToCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, a: PhotoAdjust) {
  if (isNeutral(a)) return;
  const exp = Math.pow(2, (Number(a.exposure) || 0) / 100);          // ±1 stop
  const con = 1 + (Number(a.contrast) || 0) / 100 * 0.6;             // 0.4 … 1.6
  const hi = (Number(a.highlights) || 0) / 100 * 70;
  const sh = (Number(a.shadows) || 0) / 100 * 70;
  const sat = 1 + (Number(a.saturation) || 0) / 100;                 // 0 … 2
  const tmp = (Number(a.temperature) || 0) / 100 * 30;

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * exp, g = d[i + 1] * exp, b = d[i + 2] * exp;
    if (hi || sh) {
      const L = Math.min(1, (0.299 * r + 0.587 * g + 0.114 * b) / 255);
      const delta = sh * (1 - L) * (1 - L) + hi * L * L;
      r += delta; g += delta; b += delta;
    }
    if (con !== 1) { r = (r - 128) * con + 128; g = (g - 128) * con + 128; b = (b - 128) * con + 128; }
    if (sat !== 1) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    }
    if (tmp) { r += tmp; b -= tmp; }
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
  }
  ctx.putImageData(img, 0, 0);
}

export function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Зураг ачаалж чадсангүй'));
    im.src = src;
  });
}

/** Бүтэн хэмжээгээр засварыг хэрэгжүүлж JPEG буцаана */
export async function applyAdjustToBlob(blob: Blob, a: PhotoAdjust): Promise<Blob> {
  if (isNeutral(a)) return blob;
  const url = URL.createObjectURL(blob);
  try {
    const im = await loadImg(url);
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(im, 0, 0);
    applyAdjustToCanvas(ctx, c.width, c.height, a);
    return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.95));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Хэвлэх тайралт (цаасны харьцаанд тааруулах) ─────────────────────────────
// Засварын JSON-д хамт хадгалагдана: cropZoom 100–400 (%), cropX/cropY −100…100 (чөлөөт зайн хувь),
// cropOrient 0=зургийнхаар 1=босоо 2=хэвтээ, cropFit 1 = тайрахгүй (цагаан хүрээтэй бүтэн зураг)
export interface PrintCrop {
  cropZoom?: number;
  cropX?: number;
  cropY?: number;
  cropOrient?: number;
  cropFit?: number;
  /** Татах зургийн харьцаа ×1000 (667 = 2:3, 1778 = 16:9). 0 = эх харьцаа */
  cropAspect?: number;
}
export const CROP_KEYS = ['cropZoom', 'cropX', 'cropY', 'cropOrient', 'cropFit', 'cropAspect'] as const;

/** Засварт тайралт эсвэл гэрэл/өнгөний өөрчлөлт байгаа эсэх */
export function hasEdit(a?: (PhotoAdjust & PrintCrop) | null): boolean {
  if (!a) return false;
  if (!isNeutral(a)) return true;
  return (Number(a.cropZoom) || 100) !== 100 || !!Number(a.cropX) || !!Number(a.cropY)
    || !!Number(a.cropOrient) || !!Number(a.cropFit) || !!Number(a.cropAspect);
}

/** Зорилтот харьцаа: хэвлэх хэмжээ бол цаасных, үгүй бол сонгосон харьцаа эсвэл эх зургийнх */
export function targetRatio(size: string, W: number, H: number, c: PrintCrop): number {
  if (PRINT_SIZE_CM[size]) return paperRatio(size, W, H, Number(c.cropOrient) || 0);
  const asp = Number(c.cropAspect) || 0;
  return asp > 0 ? asp / 1000 : W / H;
}

/** Хэвлэх хэмжээ (см) — богино тал × урт тал */
export const PRINT_SIZE_CM: Record<string, [number, number]> = {
  '10x15': [10, 15], '13x18': [13, 18], '15x21': [15, 21], '20x30': [20, 30], '21x30': [21, 30], '30x40': [30, 40], '40x60': [40, 60], A4: [21, 29.7],
};

/** Цаасны өргөн/өндрийн харьцаа (чиглэлийг тооцож) */
export function paperRatio(size: string, imgW: number, imgH: number, orient = 0): number {
  const [s, l] = PRINT_SIZE_CM[size] ?? PRINT_SIZE_CM['10x15'];
  const landscape = orient === 2 || (orient !== 1 && imgW > imgH);
  return landscape ? l / s : s / l;
}

/** Эх зургаас авах тэгш өнцөгт (fill горим) */
export function cropRect(W: number, H: number, R: number, c: PrintCrop) {
  let cw: number, ch: number;
  if (W / H > R) { ch = H; cw = H * R; } else { cw = W; ch = W / R; }
  const z = Math.min(4, Math.max(1, (Number(c.cropZoom) || 100) / 100));
  cw /= z; ch /= z;
  const fx = W - cw, fy = H - ch;
  const ox = Math.max(-100, Math.min(100, Number(c.cropX) || 0)) / 100;
  const oy = Math.max(-100, Math.min(100, Number(c.cropY) || 0)) / 100;
  return { sx: fx / 2 + ox * fx / 2, sy: fy / 2 + oy * fy / 2, sw: cw, sh: ch };
}

/** Canvas/зургийг цаасны харьцаанд оруулж шинэ canvas буцаана */
export function renderPaper(src: CanvasImageSource, W: number, H: number, size: string, c: PrintCrop, maxOut = 0): HTMLCanvasElement {
  const R = targetRatio(size, W, H, c);
  const out = document.createElement('canvas');
  const ctx = out.getContext('2d')!;
  if (Number(c.cropFit) === 1 && PRINT_SIZE_CM[size]) {
    // Тайрахгүй: бүтэн зураг + цагаан хүрээ
    let ow: number, oh: number;
    if (W / H > R) { ow = W; oh = W / R; } else { oh = H; ow = H * R; }
    const k = maxOut ? Math.min(1, maxOut / Math.max(ow, oh)) : 1;
    out.width = Math.round(ow * k); out.height = Math.round(oh * k);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, Math.round((ow - W) / 2 * k), Math.round((oh - H) / 2 * k), Math.round(W * k), Math.round(H * k));
    return out;
  }
  const r = cropRect(W, H, R, c);
  const k = maxOut ? Math.min(1, maxOut / Math.max(r.sw, r.sh)) : 1;
  out.width = Math.round(r.sw * k); out.height = Math.round(r.sh * k);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, out.width, out.height);
  return out;
}

/** Хэвлэхэд: засвар → цаасны харьцаанд тайрах → JPEG */
export async function preparePrintBlob(blob: Blob, size: string, a: PhotoAdjust & PrintCrop): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const im = await loadImg(url);
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(im, 0, 0);
    applyAdjustToCanvas(ctx, c.width, c.height, a);
    const paper = renderPaper(c, c.width, c.height, size, a);
    return await new Promise<Blob>((res, rej) => paper.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.95));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Цомгийн эзний зураг дээр хийсэн засвар (photo_uploads.adjust)-ыг эх зурагт хэрэгжүүлнэ.
 * Худалдан авагчийн засвар үүний дараа (засагдсан зураг дээр) хэрэгжинэ — урьдчилан харахтай адил.
 */
export async function applyBaseEdit(blob: Blob, base?: (PhotoAdjust & PrintCrop) | null): Promise<Blob> {
  if (!hasEdit(base)) return blob;
  return await preparePrintBlob(blob, 'original', base!);
}
