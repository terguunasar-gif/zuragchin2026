export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

interface WatermarkOptions {
  type: 'text' | 'image';
  value: string;
  position: WatermarkPosition;
  opacity?: number;
}

export async function applyWatermark(
  sourceFile: File,
  opts: WatermarkOptions,
): Promise<Blob> {
  const img = await loadImage(sourceFile);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  if (opts.type === 'text' && opts.value) {
    await applyTextWatermarkTiled(ctx, canvas.width, canvas.height, opts.value, opts.opacity ?? 0.35);
  } else if (opts.type === 'image' && opts.value) {
    await applyImageWatermarkTiled(ctx, canvas.width, canvas.height, opts.value, opts.opacity ?? 0.35);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      0.88,
    );
  });
}

// ── Текст тамга — бүх зургийг бүрхэх ─────────────────────────────────────────
async function applyTextWatermarkTiled(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  opacity: number,
) {
  const fontSize = Math.max(16, Math.round(w * 0.025));
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = Math.max(1, fontSize / 12);

  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const textH = fontSize;
  const spacingX = textW + fontSize * 3;
  const spacingY = textH + fontSize * 3;

  // 45 градус эргүүлж давтах
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.translate(-w / 2, -h / 2);

  const startX = -w;
  const startY = -h;

  for (let y = startY; y < h * 2; y += spacingY) {
    for (let x = startX; x < w * 2; x += spacingX) {
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }
  }

  ctx.restore();
}

// ── Зураг тамга — бүх зургийг бүрхэх ────────────────────────────────────────
async function applyImageWatermarkTiled(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  url: string,
  opacity: number,
) {
  try {
    const wmImg = await loadImageFromUrl(url);
    const maxWmW = Math.round(w * 0.18);
    const scale = Math.min(1, maxWmW / wmImg.naturalWidth);
    const wmW = Math.round(wmImg.naturalWidth * scale);
    const wmH = Math.round(wmImg.naturalHeight * scale);
    const spacingX = wmW + Math.round(w * 0.08);
    const spacingY = wmH + Math.round(h * 0.08);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.translate(-w / 2, -h / 2);

    const startX = -w;
    const startY = -h;

    for (let y = startY; y < h * 2; y += spacingY) {
      for (let x = startX; x < w * 2; x += spacingX) {
        ctx.drawImage(wmImg, x, y, wmW, wmH);
      }
    }

    ctx.restore();
  } catch (err) {
    console.error('Watermark image failed to load, skipping:', err);
  }
}

// ── Туслах функцүүд ───────────────────────────────────────────────────────────
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Watermark fetch failed: ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
    img.onerror = (err) => { URL.revokeObjectURL(objectUrl); reject(err); };
    img.src = objectUrl;
  });
}
