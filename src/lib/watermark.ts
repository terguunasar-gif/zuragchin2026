export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

interface WatermarkOptions {
  type: 'text' | 'image';
  value: string;
  position: WatermarkPosition;
  opacity?: number;
}

function getPositionCoords(
  pos: WatermarkPosition,
  canvasW: number,
  canvasH: number,
  wmW: number,
  wmH: number,
  margin = 24,
): { x: number; y: number } {
  switch (pos) {
    case 'top-left':     return { x: margin, y: margin };
    case 'top-right':    return { x: canvasW - wmW - margin, y: margin };
    case 'bottom-left':  return { x: margin, y: canvasH - wmH - margin };
    case 'bottom-right': return { x: canvasW - wmW - margin, y: canvasH - wmH - margin };
    case 'center':       return { x: (canvasW - wmW) / 2, y: (canvasH - wmH) / 2 };
  }
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
  ctx.globalAlpha = opts.opacity ?? 0.70;

  if (opts.type === 'text' && opts.value) {
    const fontSize = Math.max(20, Math.round(canvas.width * 0.03));
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = Math.max(1, fontSize / 10);
    const metrics = ctx.measureText(opts.value);
    const textW = metrics.width;
    const textH = fontSize;
    const { x, y } = getPositionCoords(opts.position, canvas.width, canvas.height, textW, textH);
    ctx.strokeText(opts.value, x, y + textH);
    ctx.fillText(opts.value, x, y + textH);
  } else if (opts.type === 'image' && opts.value) {
    try {
      const wmImg = await loadImageFromUrl(opts.value);
      const maxWmW = Math.round(canvas.width * 0.20);
      const scale = Math.min(1, maxWmW / wmImg.naturalWidth);
      const wmW = Math.round(wmImg.naturalWidth * scale);
      const wmH = Math.round(wmImg.naturalHeight * scale);
      const { x, y } = getPositionCoords(opts.position, canvas.width, canvas.height, wmW, wmH);
      ctx.drawImage(wmImg, x, y, wmW, wmH);
    } catch (err) {
      console.error('Watermark image failed to load, skipping:', err);
    }
  }

  ctx.globalAlpha = 1.0;
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      0.88,
    );
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

// fetch ашиглан CORS-оос зайлсхийж, blob URL болгон ачаалдаг
async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Watermark fetch failed: ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
}
