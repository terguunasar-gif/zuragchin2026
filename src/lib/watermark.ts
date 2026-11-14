export type WatermarkPosition =
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  | 'top-center' | 'middle-left' | 'middle-right' | 'bottom-center';

interface WatermarkLayer {
  id: string;
  type: 'text' | 'image' | 'tiled-text';
  text: string;
  fontSize: number;
  opacity: number;
  color: string;
  imagePreview: string;
  position: WatermarkPosition;
  imageSize: number;
  /** Сонгосон байршлаас шилжүүлэх (зургийн өргөн/өндрийн %, + баруун/доош) */
  offsetX?: number;
  offsetY?: number;
}

/** Шилжилтийг ±20%-иар хязгаарлаж, зургаас гаргахгүй байрлуулна */
function shift(x: number, y: number, elemW: number, elemH: number, w: number, h: number, ox?: number, oy?: number, baseline = false) {
  const cx = Math.max(-20, Math.min(20, Number(ox) || 0));
  const cy = Math.max(-20, Math.min(20, Number(oy) || 0));
  if (!cx && !cy) return { x, y };
  const nx = Math.max(0, Math.min(w - elemW, x + (w * cx) / 100));
  const top = baseline ? y - elemH : y;
  const ny = Math.max(0, Math.min(h - elemH, top + (h * cy) / 100));
  return { x: nx, y: baseline ? ny + elemH : ny };
}

interface WatermarkOptions {
  /** 'none' — үнэгүй хуваалцах цомог: тамгагүй, зөвхөн жижигрүүлсэн preview */
  type: 'text' | 'image' | 'layers' | 'none';
  value: string;
  position: WatermarkPosition;
  opacity?: number;
  imageSize?: number;
  /** Preview-ийн хамгийн их өргөн/өндөр (px) */
  maxSize?: number;
  /** Брэнд горим (үнэгүй цомог): зөвхөн булангийн лого/текст, давтагдах хамгаалалтын тамгагүй */
  brandOnly?: boolean;
  /** brandOnly үед ч эзний санаатай нэмсэн «Битүү тамга»-г тавина (үнэгүй цомог) */
  keepTiled?: boolean;
  /** JPEG чанар (0–1) */
  quality?: number;
  /** Худалдах цомгийн preview: өтгөн тамга, голоор дайрсан том бичиг, торон зураас — AI-аар арилгахад хэцүү */
  protect?: boolean;
  /** update-87: жижиг «Zuragchin.mn» тэмдэг (сурталчилгаа). Анхдагч: асаалттай.
   *  Цомог үүсгэгчийн лого/текстэй давхцахгүй буланд автоматаар байрлана. */
  siteBadge?: boolean;
}

type Rect = { x: number; y: number; w: number; h: number };

const DEFAULT_TILED_TEXT = 'zuragchin.mn';

export async function applyWatermark(
  sourceFile: File,
  opts: WatermarkOptions,
): Promise<Blob> {
  const img = await loadImage(sourceFile);
  const canvas = document.createElement('canvas');
  const scale = opts.maxSize ? Math.min(1, opts.maxSize / Math.max(img.naturalWidth, img.naturalHeight)) : 1;
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // Цомог үүсгэгчийн лого/текстийн эзэлсэн хэсэг — сайтын тэмдгийг эдгээртэй давхцуулахгүй
  const occupied: Rect[] = [];

  if (opts.type === 'none') {
    // тамгагүй
  } else if (opts.type === 'layers') {
    let hasTiled = false;
    try {
      const layers: WatermarkLayer[] = JSON.parse(opts.value);
      hasTiled = layers.some(l => l.type === 'tiled-text' && !!l.text);
      for (const layer of layers) {
        if (layer.type === 'tiled-text' && opts.brandOnly && !opts.keepTiled) {
          continue;
        } else if (layer.type === 'tiled-text' && layer.text) {
          // Бүх зургийг бүрхэх давтагдах текст тамга
          await applyTextWatermarkTiled(
            ctx, canvas.width, canvas.height,
            layer.text, opts.protect ? Math.max(layer.opacity, 0.32) : layer.opacity, layer.fontSize, layer.color, !!opts.protect,
          );
        } else if (layer.type === 'text' && layer.text) {
          // Булангийн байршилд нэг удаа харуулах текст
          occupied.push(applyTextWatermarkPositioned(
            ctx, canvas.width, canvas.height,
            layer.text, layer.opacity, layer.fontSize, layer.color, layer.position, layer.offsetX, layer.offsetY,
          ));
        } else if (layer.type === 'image' && layer.imagePreview) {
          // Булангийн байршилд лого
          const r = await applyImageWatermarkPositioned(
            ctx, canvas.width, canvas.height,
            layer.imagePreview, layer.opacity, layer.imageSize ?? 20, layer.position, layer.offsetX, layer.offsetY,
          );
          if (r) occupied.push(r);
        }
      }
    } catch (err) {
      console.error('Layers parse error:', err);
    }
    // Цомогт давтагдах тамга тохируулаагүй ч зургийг хамгаалахын тулд
    // бүх зургийг бүрхэх нарийн "zuragchin.mn" тамгыг заавал нэмнэ.
    if (!hasTiled && !opts.brandOnly) {
      await applyTextWatermarkTiled(ctx, canvas.width, canvas.height, DEFAULT_TILED_TEXT, opts.protect ? 0.32 : 0.3, undefined, '#ffffff', !!opts.protect);
    }
  } else if (opts.type === 'text' && opts.value) {
    await applyTextWatermarkTiled(ctx, canvas.width, canvas.height, opts.value, opts.opacity ?? 0.35, undefined, '#ffffff', !!opts.protect);
  } else if (opts.type === 'image' && opts.value) {
    await applyImageWatermarkTiled(ctx, canvas.width, canvas.height, opts.value, opts.opacity ?? 0.35, opts.imageSize ?? 20);
  }

  if (opts.protect && opts.type !== 'none' && !opts.brandOnly) applyProtection(ctx, canvas.width, canvas.height);
  if (opts.siteBadge !== false) applySiteBadge(ctx, canvas.width, canvas.height, occupied);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      opts.quality ?? 0.88,
    );
  });
}

// ── Булангийн байршилд нэг текст ─────────────────────────────────────────────
function applyTextWatermarkPositioned(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  opacity: number,
  fontSizePx: number,
  color: string,
  position: WatermarkPosition,
  offsetX?: number,
  offsetY?: number,
): Rect {
  const fontSize = Math.max(12, Math.round(w * (fontSizePx / 1000)));
  const padding  = Math.round(w * 0.02);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font        = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle   = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth   = Math.max(1, fontSize / 14);

  const metrics = ctx.measureText(text);
  const tw = metrics.width;
  const th = fontSize;

  const base = getPositionXY(position, w, h, tw, th, padding);
  const { x, y } = shift(base.x, base.y, tw, th, w, h, offsetX, offsetY, true);

  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
  // fillText-ийн y нь суурь шугам — дээд ирмэг нь ойролцоогоор y - th
  return { x, y: y - th, w: tw, h: th * 1.25 };
}

// ── Булангийн байршилд лого зураг ────────────────────────────────────────────
async function applyImageWatermarkPositioned(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  url: string,
  opacity: number,
  imageSizePct: number,
  position: WatermarkPosition,
  offsetX?: number,
  offsetY?: number,
): Promise<Rect | null> {
  try {
    const wmImg = await loadImageFromUrl(url);
    const wmW   = Math.round(w * (imageSizePct / 100));
    const scale = wmW / wmImg.naturalWidth;
    const wmH   = Math.round(wmImg.naturalHeight * scale);
    const padding = Math.round(w * 0.02);

    // getPositionXY нь текстийн суурь шугамаар (доод ирмэг) тооцдог; drawImage дээд ирмэгээр зурдаг тул
    // wmH-ийг хасна. Үгүй бол доод булангийн лого зургаас гарч таслагдаж байсан (update-87 засвар).
    const pos = getPositionXY(position, w, h, wmW, wmH, padding);
    const { x, y } = shift(pos.x, pos.y - wmH, wmW, wmH, w, h, offsetX, offsetY);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(wmImg, x, y, wmW, wmH);
    ctx.restore();
    return { x, y, w: wmW, h: wmH };
  } catch (err) {
    console.error('Positioned image watermark failed:', err);
    return null;
  }
}

// ── update-87: жижиг «Zuragchin.mn» тэмдэг ───────────────────────────────────
// Диафрагмын лого (BrandMark.tsx-тэй ижил) + «Zuragchin.mn». Хагас тунгалаг бараан суурьтай жижиг пилл.
const APERTURE_BLADES: [string, string][] = [
  ['M50.00 30.80L80.68 13.09A48 48 0 0 1 97.31 58.11L66.63 40.40Z', '#fbbf24'],
  ['M66.63 40.40L97.31 58.11A48 48 0 0 1 66.63 95.03L66.63 59.60Z', '#f59e0b'],
  ['M66.63 59.60L66.63 95.03A48 48 0 0 1 19.32 86.91L50.00 69.20Z', '#f59e0b'],
  ['M50.00 69.20L19.32 86.91A48 48 0 0 1 2.69 41.89L33.37 59.60Z', '#d97706'],
  ['M33.37 59.60L2.69 41.89A48 48 0 0 1 33.37 4.97L33.37 40.40Z', '#b45309'],
  ['M33.37 40.40L33.37 4.97A48 48 0 0 1 80.68 13.09L50.00 30.80Z', '#d97706'],
];
const APERTURE_HOLE = 'M50.00 30.80L66.63 40.40L66.63 59.60L50.00 69.20L33.37 59.60L33.37 40.40Z';

function drawAperture(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  for (const [d, fill] of APERTURE_BLADES) { ctx.fillStyle = fill; ctx.fill(new Path2D(d)); }
  ctx.fillStyle = '#0c0a09';
  ctx.fill(new Path2D(APERTURE_HOLE));
  ctx.restore();
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Сайтын тэмдгийн хэмжээ, байрлалыг тооцоолно (тест хийхэд ч ашиглана) */
export function siteBadgeRect(w: number, h: number, occupied: Rect[], textWidth: (fontPx: number) => number): Rect {
  // Хэмжээ: богино талын ~3.2% (1600px preview-д ≈ 34–51px өндөр) — анзаарагдахуйц ч саад болохгүй
  const bh = Math.max(14, Math.round(Math.min(w, h) * 0.032));
  const font = Math.round(bh * 0.52);
  const bw = Math.round(bh * 0.25 + bh * 0.72 + bh * 0.22 + textWidth(font) + bh * 0.38);
  const pad = Math.round(Math.min(w, h) * 0.018);
  const corners: Rect[] = [
    { x: w - bw - pad, y: h - bh - pad, w: bw, h: bh }, // баруун доор
    { x: pad,          y: h - bh - pad, w: bw, h: bh }, // зүүн доор
    { x: w - bw - pad, y: pad,          w: bw, h: bh }, // баруун дээр
    { x: pad,          y: pad,          w: bw, h: bh }, // зүүн дээр
  ];
  // Зай авч шалгана — хүрэлцэх төдий ойр байхаас ч зайлсхийнэ
  const gap = pad;
  const grown = occupied.map(r => ({ x: r.x - gap, y: r.y - gap, w: r.w + gap * 2, h: r.h + gap * 2 }));
  let best = corners[0];
  let bestOverlap = Infinity;
  for (const c of corners) {
    const ov = grown.reduce((sum, r) => sum + overlapArea(c, r), 0);
    if (ov === 0) return c;
    if (ov < bestOverlap) { bestOverlap = ov; best = c; }
  }
  return best;
}

function applySiteBadge(ctx: CanvasRenderingContext2D, w: number, h: number, occupied: Rect[]) {
  ctx.save();
  const measure = (font: number) => {
    ctx.font = `600 ${font}px Arial, sans-serif`;
    return ctx.measureText('Zuragchin.mn').width;
  };
  const r = siteBadgeRect(w, h, occupied, measure);
  const bh = r.h;
  const font = Math.round(bh * 0.52);

  // Суурь пилл
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = '#0c0a09';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(r.x, r.y, r.w, r.h, bh / 2);
  else ctx.rect(r.x, r.y, r.w, r.h);
  ctx.fill();

  // Лого + бичиг
  ctx.globalAlpha = 0.95;
  const iconSize = Math.round(bh * 0.72);
  const ix = r.x + Math.round(bh * 0.25);
  drawAperture(ctx, ix, r.y + (bh - iconSize) / 2, iconSize);

  ctx.font = `600 ${font}px Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  const tx = ix + iconSize + Math.round(bh * 0.22);
  const ty = r.y + bh / 2 + 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Zuragchin', tx, ty);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('.mn', tx + ctx.measureText('Zuragchin').width, ty);
  ctx.restore();
}

// ── Байршлын XY тооцоолол ────────────────────────────────────────────────────
function getPositionXY(
  position: WatermarkPosition,
  w: number, h: number,
  elemW: number, elemH: number,
  padding: number,
): { x: number; y: number } {
  const right  = w - elemW - padding;
  const bottom = h - elemH - padding;
  const centerX = (w - elemW) / 2;
  const centerY = (h - elemH) / 2;

  switch (position) {
    case 'top-left':      return { x: padding,  y: padding + elemH };
    case 'top-center':    return { x: centerX,  y: padding + elemH };
    case 'top-right':     return { x: right,    y: padding + elemH };
    case 'middle-left':   return { x: padding,  y: centerY + elemH / 2 };
    case 'center':        return { x: centerX,  y: centerY + elemH / 2 };
    case 'middle-right':  return { x: right,    y: centerY + elemH / 2 };
    case 'bottom-left':   return { x: padding,  y: bottom  + elemH };
    case 'bottom-center': return { x: centerX,  y: bottom  + elemH };
    case 'bottom-right':  return { x: right,    y: bottom  + elemH };
    default:              return { x: right,    y: bottom  + elemH };
  }
}

// ── Бүх зургийг бүрхэх давтагдах текст тамга ────────────────────────────────
async function applyTextWatermarkTiled(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  opacity: number,
  fontSizePx?: number,
  color: string = '#ffffff',
  dense = false,
) {
  const fontSize = fontSizePx
    ? Math.max(12, Math.round(w * (fontSizePx / 1000)))
    : Math.max(16, Math.round(w * 0.025));

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font        = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle   = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth   = Math.max(1, fontSize / 12);

  const metrics  = ctx.measureText(text);
  const textW    = metrics.width;
  const textH    = fontSize;
  const spacingX = textW  + fontSize * (dense ? 1.2 : 3);
  const spacingY = textH  + fontSize * (dense ? 1.6 : 3);

  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.translate(-w / 2, -h / 2);

  for (let y = -h; y < h * 2; y += spacingY) {
    for (let x = -w; x < w * 2; x += spacingX) {
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();
}

// ── Бүх зургийг бүрхэх давтагдах лого тамга ─────────────────────────────────
async function applyImageWatermarkTiled(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  url: string,
  opacity: number,
  imageSizePct: number = 20,
) {
  try {
    const wmImg   = await loadImageFromUrl(url);
    const wmW     = Math.round(w * (imageSizePct / 100));
    const scale   = wmW / wmImg.naturalWidth;
    const wmH     = Math.round(wmImg.naturalHeight * scale);
    const spacingX = wmW + Math.round(w * 0.08);
    const spacingY = wmH + Math.round(h * 0.08);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.translate(-w / 2, -h / 2);

    for (let y = -h; y < h * 2; y += spacingY) {
      for (let x = -w; x < w * 2; x += spacingX) {
        ctx.drawImage(wmImg, x, y, wmW, wmH);
      }
    }
    ctx.restore();
  } catch (err) {
    console.error('Watermark image failed to load, skipping:', err);
  }
}

// ── Image loaders ─────────────────────────────────────────────────────────────
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src     = url;
  });
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  if (url.startsWith('data:')) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src     = url;
    });
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Watermark fetch failed: ${response.status}`);
  const blob      = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
    img.onerror = err => { URL.revokeObjectURL(objectUrl); reject(err); };
    img.src     = objectUrl;
  });
}

// ── Худалдах цомгийн хамгаалалт: торон зураас + голоор дайрсан том бичиг ──────
function applyProtection(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = Math.min(w, h);
  ctx.save();
  // Нарийн диагональ тор — нүүр, биеийг дайрч гарна
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, s / 450);
  const step = s / 8;
  ctx.beginPath();
  for (let x = -h; x < w + h; x += step) {
    ctx.moveTo(x, 0); ctx.lineTo(x + h, h);
    ctx.moveTo(x + h, 0); ctx.lineTo(x, h);
  }
  ctx.stroke();
  // Голоор дайрсан том бичиг (3 мөр)
  const fs = Math.round(s * 0.1);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.atan2(h, w));
  ctx.font = `900 ${fs}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, fs / 12);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.fillStyle = '#ffffff';
  for (const dy of [-fs * 2.6, 0, fs * 2.6]) {
    ctx.globalAlpha = dy === 0 ? 0.42 : 0.28;
    ctx.strokeText('ZURAGCHIN.MN', 0, dy);
    ctx.fillText('ZURAGCHIN.MN', 0, dy);
  }
  ctx.restore();
}

/** Худалдах цомгийн урьдчилан харах зураг: 1000px, чанар 60%, хамгаалалттай тамга */
export const SALE_PREVIEW_MAX = 1000;
export function makeSalePreview(file: File, album: { watermark_type: string; watermark_value: string; watermark_position: string }): Promise<Blob> {
  return applyWatermark(file, {
    type: (album.watermark_type || 'layers') as WatermarkOptions['type'],
    value: album.watermark_value,
    position: (album.watermark_position || 'bottom-right') as WatermarkPosition,
    opacity: 0.7,
    maxSize: SALE_PREVIEW_MAX,
    quality: 0.6,
    protect: true,
  });
}

// ── Цомог үүсгэгчийн лого / мэндчилгээ (брэнд давхарга) ─────────────────────────

/** Брэнд давхаргууд: давтагдах тамга болон «zuragchin.mn» текстийг хасна */
export function brandLayers(raw: string): string | null {
  try {
    const layers = JSON.parse(raw) as { type: string; text?: string; imagePreview?: string }[];
    if (!Array.isArray(layers)) return null;
    const keep = layers.filter(l =>
      (l.type === 'image' && !!l.imagePreview) ||
      (l.type === 'text' && !!l.text && !/zuragchin/i.test(l.text)));
    return keep.length ? JSON.stringify(keep) : null;
  } catch { return null; }
}

/** JPEG-ийн XMP (APP1) болон тайлбар (COM) сегментүүд — захиалгын ID, зохиогчийн эрх.
 *  EXIF-ийг (orientation) санаатай авахгүй: canvas аль хэдийн эргүүлсэн тул дахин эргэнэ. */
function jpegMetaSegments(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return out;
  const sig = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/');
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) break;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2 || i + 2 + len > bytes.length) break;
    const seg = bytes.subarray(i, i + 2 + len);
    const isXmp = marker === 0xe1 && sig.every((b, k) => seg[4 + k] === b);
    if (isXmp || marker === 0xfe) out.push(seg);
    i += 2 + len;
  }
  return out;
}

/**
 * Худалдаж авсан зурагт цомог үүсгэгчийн заасан лого / текстийг шингээнэ
 * (сайтын «Zuragchin.mn» тэмдэг, давтагдах тамгагүй). Захиалгын XMP/COM мэдээллийг хадгална.
 * Брэнд давхарга байхгүй эсвэл алдаа гарвал эх файлыг өөрчлөхгүй буцаана.
 */
export async function applyBrandToPurchase(blob: Blob, raw: string, filename: string): Promise<Blob> {
  const layers = raw ? brandLayers(raw) : null;
  if (!layers) return blob;
  try {
    const out = await applyWatermark(new File([blob], filename || 'photo.jpg', { type: blob.type || 'image/jpeg' }),
      { type: 'layers', value: layers, position: 'bottom-right', brandOnly: true, quality: 0.95, siteBadge: false });
    const meta = jpegMetaSegments(new Uint8Array(await blob.arrayBuffer()));
    if (!meta.length) return out;
    const body = new Uint8Array(await out.arrayBuffer());
    if (body[0] !== 0xff || body[1] !== 0xd8) return out;
    return new Blob([body.subarray(0, 2), ...meta, body.subarray(2)], { type: 'image/jpeg' });
  } catch (e) {
    console.warn('brand overlay failed, using original:', e);
    return blob;
  }
}
