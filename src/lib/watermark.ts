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
  /** JPEG чанар (0–1) */
  quality?: number;
  /** Худалдах цомгийн preview: өтгөн тамга, голоор дайрсан том бичиг, торон зураас — AI-аар арилгахад хэцүү */
  protect?: boolean;
}

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

  if (opts.type === 'none') {
    // тамгагүй
  } else if (opts.type === 'layers') {
    let hasTiled = false;
    try {
      const layers: WatermarkLayer[] = JSON.parse(opts.value);
      hasTiled = layers.some(l => l.type === 'tiled-text' && !!l.text);
      for (const layer of layers) {
        if (layer.type === 'tiled-text' && opts.brandOnly) {
          continue;
        } else if (layer.type === 'tiled-text' && layer.text) {
          // Бүх зургийг бүрхэх давтагдах текст тамга
          await applyTextWatermarkTiled(
            ctx, canvas.width, canvas.height,
            layer.text, opts.protect ? Math.max(layer.opacity, 0.32) : layer.opacity, layer.fontSize, layer.color, !!opts.protect,
          );
        } else if (layer.type === 'text' && layer.text) {
          // Булангийн байршилд нэг удаа харуулах текст
          applyTextWatermarkPositioned(
            ctx, canvas.width, canvas.height,
            layer.text, layer.opacity, layer.fontSize, layer.color, layer.position,
          );
        } else if (layer.type === 'image' && layer.imagePreview) {
          // Булангийн байршилд лого
          await applyImageWatermarkPositioned(
            ctx, canvas.width, canvas.height,
            layer.imagePreview, layer.opacity, layer.imageSize ?? 20, layer.position,
          );
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
) {
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

  const { x, y } = getPositionXY(position, w, h, tw, th, padding);

  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
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
) {
  try {
    const wmImg = await loadImageFromUrl(url);
    const wmW   = Math.round(w * (imageSizePct / 100));
    const scale = wmW / wmImg.naturalWidth;
    const wmH   = Math.round(wmImg.naturalHeight * scale);
    const padding = Math.round(w * 0.02);

    const { x, y } = getPositionXY(position, w, h, wmW, wmH, padding);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(wmImg, x, y, wmW, wmH);
    ctx.restore();
  } catch (err) {
    console.error('Positioned image watermark failed:', err);
  }
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
