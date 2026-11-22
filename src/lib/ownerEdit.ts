// Цомгийн эзэн / зурагчин оруулсан зургаа засна (гэрэл, өнгө, тайралт).
// Эх файл өөрчлөгдөхгүй: засвар photo_uploads.adjust-д хадгалагдаж, урьдчилан харах
// хувилбар (preview + thumb) засагдсан зургаар дахин үүснэ. Татах/угаалгах үед сервер
// энэ засварыг (baseAdjust) буцааж, хөтөч эх зурагт хэрэгжүүлнэ.
import { supabase } from './supabase';
import { applyWatermark, makeSalePreview } from './watermark';
import { applyBaseEdit, hasEdit, type PhotoAdjust, type PrintCrop } from './photoAdjust';
import { IMMUTABLE_CACHE, makeThumb, uploadThumb } from './thumbs';

export type OwnerEdit = PhotoAdjust & PrintCrop;

export interface EditablePhoto {
  id: string;
  filename: string;
  original_url: string;
  preview_url: string;
  thumb_url?: string | null;
  adjust?: OwnerEdit | null;
}

export interface EditAlbum {
  is_free: boolean;
  watermark_type: string;
  watermark_value: string;
  watermark_position: string;
  watermark_strength?: string | null;
}

/** Засах цонхонд: эх зургийн түр холбоос */
export async function originalUrlFor(photo: EditablePhoto): Promise<string> {
  const path = photo.original_url.replace(/^photos-original\//, '');
  const { data, error } = await supabase.storage.from('photos-original').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error('Эх зургийг нээж чадсангүй (өөр зурагчны оруулсан зураг байж магадгүй)');
  return data.signedUrl;
}

/** Хоосон/тэг утгыг хасна */
export function cleanEdit(a: OwnerEdit): OwnerEdit {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(a)) {
    const n = Math.round(Number(v) || 0);
    if (!n) continue;
    if (k === 'cropZoom' && n === 100) continue;
    out[k] = n;
  }
  return out as OwnerEdit;
}

/** Засварыг хадгалж, урьдчилан харах зургийг шинэчилнэ. Шинэ preview/thumb холбоосыг буцаана. */
export async function saveOwnerEdit(photo: EditablePhoto, album: EditAlbum, uid: string, albumId: string, edit: OwnerEdit)
  : Promise<{ preview_url: string; thumb_url: string | null; adjust: OwnerEdit | null }> {
  const adjust = cleanEdit(edit);
  const path = photo.original_url.replace(/^photos-original\//, '');
  const { data: blob, error: dlErr } = await supabase.storage.from('photos-original').download(path);
  if (dlErr || !blob) throw new Error('Эх зургийг татаж чадсангүй');
  const edited = await applyBaseEdit(blob, hasEdit(adjust) ? adjust : null);
  const file = new File([edited], photo.filename || 'photo.jpg', { type: 'image/jpeg' });
  // Үнэгүй цомгийн эх зурагт лого аль хэдийн шингэсэн — дахин тавихгүй
  const preview = album.is_free
    ? await applyWatermark(file, { type: 'none', value: '', position: (album.watermark_position || 'bottom-right') as never, maxSize: 1600 })
    : await makeSalePreview(file, album);

  const newPath = `${uid}/${albumId}/${album.is_free ? 'preview_' : 'preview_p2_'}${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await supabase.storage.from('photos-preview')
    .upload(newPath, preview, { contentType: 'image/jpeg', cacheControl: IMMUTABLE_CACHE });
  if (upErr) throw new Error(upErr.message);
  const { data: { publicUrl } } = supabase.storage.from('photos-preview').getPublicUrl(newPath);

  let thumb: { path: string; url: string } | null = null;
  try { thumb = await uploadThumb(await makeThumb(preview), uid, albumId); } catch { /* preview-ээр харагдана */ }

  const { error: dbErr } = await supabase.rpc('set_photo_edit', {
    p_photo_id: photo.id,
    p_adjust: hasEdit(adjust) ? adjust : null,
    p_preview_url: publicUrl,
    p_thumb_url: thumb?.url ?? null,
  });
  if (dbErr) {
    await supabase.storage.from('photos-preview').remove([newPath, ...(thumb ? [thumb.path] : [])]).catch(() => null);
    throw new Error(/set_photo_edit|schema cache|adjust/.test(dbErr.message)
      ? 'Өгөгдлийн санд засварын тохиргоо нэмэгдээгүй байна (SQL ажиллуулах шаардлагатай)'
      : dbErr.message);
  }
  // Хуучин preview-г устгахгүй: худалдан авагчийн сагс/«Төлсөн» жагсаалт түүнийг харуулсаар байж болно
  return { preview_url: publicUrl, thumb_url: thumb?.url ?? null, adjust: hasEdit(adjust) ? adjust : null };
}
