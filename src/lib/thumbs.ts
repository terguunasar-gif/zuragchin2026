import { supabase } from './supabase';
import { isMissingColumnError } from './albumLink';

/**
 * Цомгийн сүлжээнд харуулах жижиг хувилбар.
 * Preview (1000–1600px, тамгатай) зургийг 640px болгож шахна — тамга нь хэвээр үлдэнэ.
 */
export const THUMB_EDGE = 640;
const THUMB_QUALITY = 0.72;
/** Файлын нэр UUID тул агуулга хэзээ ч өөрчлөгдөхгүй → хөтөч 1 жил cache хийнэ */
export const IMMUTABLE_CACHE = '31536000';

async function decode(blob: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch { /* хуучин Safari — доорх аргаар */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Зургийг уншиж чадсангүй'));
      i.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Зургийг THUMB_EDGE хүртэл жижигрүүлж JPEG болгоно */
export async function makeThumb(blob: Blob): Promise<Blob> {
  const img = await decode(blob);
  try {
    const scale = Math.min(1, THUMB_EDGE / Math.max(img.w, img.h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.w * scale));
    canvas.height = Math.max(1, Math.round(img.h * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.src, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/jpeg', THUMB_QUALITY));
  } finally {
    img.close();
  }
}

/** photos-preview доторх замыг нийтийн холбоосоос гаргана */
export function previewPathFromUrl(url: string | null | undefined): string {
  const s = String(url ?? '');
  return s.includes('/photos-preview/') ? (s.split('/photos-preview/')[1]?.split('?')[0] ?? '') : '';
}

/** Жижиг хувилбарыг өөрийн хавтаст байршуулж нийтийн холбоосыг буцаана */
export async function uploadThumb(thumb: Blob, uid: string, albumId: string): Promise<{ path: string; url: string }> {
  const path = `${uid}/${albumId}/thumb_${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('photos-preview')
    .upload(path, thumb, { contentType: 'image/jpeg', upsert: false, cacheControl: IMMUTABLE_CACHE });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from('photos-preview').getPublicUrl(path);
  return { path, url: publicUrl };
}

/**
 * Байгаа зурагт (preview_url-аас) жижиг хувилбар үүсгэж бүртгэнэ.
 * Амжилттай бол шинэ thumb_url-ыг буцаана.
 */
export async function backfillThumb(photo: { id: string; preview_url: string }, uid: string, albumId: string): Promise<string> {
  const res = await fetch(photo.preview_url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`preview ${res.status}`);
  const thumb = await makeThumb(await res.blob());
  const up = await uploadThumb(thumb, uid, albumId);
  const { error } = await supabase.rpc('set_photo_thumb', { p_photo_id: photo.id, p_url: up.url });
  if (error) {
    await supabase.storage.from('photos-preview').remove([up.path]).catch(() => null);
    throw new Error(error.message);
  }
  return up.url;
}

/** thumb_url багана / set_photo_thumb функц нэмэгдээгүй (SQL ажиллуулаагүй) эсэх */
export function isThumbSqlMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return isMissingColumnError(error) || /set_photo_thumb|thumb_url/i.test(error.message ?? '');
}
