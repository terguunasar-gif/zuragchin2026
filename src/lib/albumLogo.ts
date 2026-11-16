import { supabase } from './supabase';

/**
 * Цомгийн тамганы лого.
 * Логог base64 (data URL) хэлбэрээр цомгийн тохиргоонд (albums.watermark_value) хадгалбал
 * цомог нээх бүрт хэдэн MB татагддаг байсан. Одоо 600px болгож `covers` bucket-д байршуулаад
 * тохиргоонд зөвхөн холбоосыг нь хадгална.
 */
export const LOGO_MAX_EDGE = 600;

/** Логог жижигрүүлж PNG blob + data URL болгоно (тунгалаг дэвсгэр хадгалагдана) */
export function shrinkLogo(src: Blob, max = LOGO_MAX_EDGE): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((img.naturalWidth || max) * scale));
      c.height = Math.max(1, Math.round((img.naturalHeight || max) * scale));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/png');
      c.toBlob(b => (b ? resolve({ blob: b, dataUrl }) : reject(new Error('PNG болгож чадсангүй'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Зураг уншигдсангүй')); };
    img.src = url;
  });
}

/** Жижигрүүлсэн логог covers/watermarks/<uid>/<albumKey>/ руу байршуулж нийтийн холбоосыг буцаана */
export async function uploadAlbumLogo(blob: Blob, uid: string, albumKey: string): Promise<string> {
  const path = `watermarks/${uid}/${albumKey}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage.from('covers')
    .upload(path, blob, { upsert: false, contentType: 'image/png', cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  return supabase.storage.from('covers').getPublicUrl(path).data.publicUrl;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/**
 * Файлаас лого бэлтгэнэ: жижигрүүлээд байршуулна.
 * Байршуулж чадаагүй бол жижигрүүлсэн (≈20–80KB) data URL-ыг буцаана — хэдэн MB-ын эх биш.
 */
export async function prepareLogo(src: Blob, uid: string, albumKey: string): Promise<{ url: string; uploaded: boolean }> {
  const { blob, dataUrl } = await shrinkLogo(src);
  try {
    return { url: await uploadAlbumLogo(blob, uid, albumKey), uploaded: true };
  } catch (e) {
    console.warn('logo upload failed, using shrunk inline image:', e);
    return { url: dataUrl, uploaded: false };
  }
}

/** data URL эсэх */
export const isInlineImage = (s: unknown): s is string => typeof s === 'string' && s.startsWith('data:image');

/**
 * watermark_value (JSON) доторх data URL логонуудыг байршуулсан холбоосоор солино.
 * Өөрчлөлт ороогүй бол changed=false.
 */
export async function externalizeWatermarkValue(value: string, uid: string, albumKey: string): Promise<{ value: string; changed: boolean; failed: number }> {
  let layers: unknown;
  try { layers = JSON.parse(value); } catch { return { value, changed: false, failed: 0 }; }
  if (!Array.isArray(layers)) return { value, changed: false, failed: 0 };
  let changed = false, failed = 0;
  const cache = new Map<string, string>(); // ижил лого давхардсан бол нэг л удаа байршуулна
  for (const l of layers as { imagePreview?: string }[]) {
    if (!l || !isInlineImage(l.imagePreview)) continue;
    const src = l.imagePreview;
    try {
      let url = cache.get(src);
      if (!url) {
        const { blob } = await shrinkLogo(await dataUrlToBlob(src));
        url = await uploadAlbumLogo(blob, uid, albumKey);
        cache.set(src, url);
      }
      l.imagePreview = url;
      changed = true;
    } catch (e) {
      console.warn('logo externalize failed', e);
      failed++;
    }
  }
  return { value: changed ? JSON.stringify(layers) : value, changed, failed };
}
