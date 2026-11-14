import QRCode from 'qrcode';

/** Урт нэрийг өргөнд багтаан мөр болгон хуваана (хамгийн ихдээ maxLines) */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return lines;
}

/**
 * Дээд талдаа цомгийн нэр, доод талдаа холбоос/брэнд бичсэн QR зургийг PNG-ээр татна
 * (хэвлэж ширээн дээр тавих, хуваалцахад аль цомог болох нь ойлгомжтой).
 */
export async function downloadLabeledQr(url: string, title: string, filename?: string, subtitle?: string): Promise<void> {
  const W = 1000, PAD = 70, QR = W - PAD * 2;
  const name = (title || 'Цомог').trim();

  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  // Нэрийн мөрүүдийг урьдчилан тооцоолно
  let fs = 64;
  ctx.font = `bold ${fs}px Arial, sans-serif`;
  let lines = wrapText(ctx, name, W - PAD * 2, 3);
  while (lines.length > 2 && fs > 44) { fs -= 4; ctx.font = `bold ${fs}px Arial, sans-serif`; lines = wrapText(ctx, name, W - PAD * 2, 3); }
  const lineH = Math.round(fs * 1.22);
  const headerH = PAD + lines.length * lineH + (subtitle ? 50 : 0) + 30;
  const footerH = 130;
  c.width = W; c.height = headerH + QR + footerH;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);

  // Цомгийн нэр
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${fs}px Arial, sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, PAD + i * lineH));
  if (subtitle) {
    ctx.fillStyle = '#666666';
    ctx.font = '34px Arial, sans-serif';
    ctx.fillText(subtitle, W / 2, PAD + lines.length * lineH + 8);
  }

  // QR
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, url, { width: QR, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
  ctx.drawImage(qrCanvas, PAD, headerH, QR, QR);

  // Доод тайлбар
  ctx.fillStyle = '#444444';
  ctx.font = '30px Arial, sans-serif';
  ctx.fillText('Камераар уншуулаад гарч ирсэн холбоосыг дарна уу', W / 2, headerH + QR + 22);
  ctx.fillStyle = '#b45309';
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.fillText('Zuragchin.mn', W / 2, headerH + QR + 68);

  const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('QR зураг үүсгэж чадсангүй'))), 'image/png'));
  const safe = name.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'album';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || `QR_${safe}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
