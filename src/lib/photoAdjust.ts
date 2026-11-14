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
