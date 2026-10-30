import { publicDb, supabase } from './supabase';

/**
 * «Зочдын зураг» (update-81): хамт олны гишүүд утсаар авсан зургаа цомогт үнэгүй хуваалцана.
 * Зочны зураг зарагдахгүй. Хадгалах зардлыг цомгийн эзэн багцаар төлнө (platform_settings.guest_photo_packages).
 */
export interface GuestPackage { code: string; name: string; photos: number; price: number }

export const DEFAULT_GUEST_PACKAGES: GuestPackage[] = [
  { code: 'g500', name: 'Жижиг', photos: 500, price: 5000 },
  { code: 'g1500', name: 'Дунд', photos: 1500, price: 10000 },
  { code: 'g4000', name: 'Том', photos: 4000, price: 20000 },
];

export function normalizeGuestPackages(v: unknown): GuestPackage[] {
  if (!Array.isArray(v)) return DEFAULT_GUEST_PACKAGES;
  const list = v.map((p: Record<string, unknown>) => ({
    code: String(p?.code ?? ''), name: String(p?.name ?? p?.code ?? ''), photos: Number(p?.photos), price: Number(p?.price),
  })).filter(p => p.code && p.photos > 0 && p.price > 0);
  return list.length ? list : DEFAULT_GUEST_PACKAGES;
}

export async function loadGuestPackages(): Promise<GuestPackage[]> {
  const { data } = await publicDb.from('platform_settings').select('value').eq('key', 'guest_photo_packages').maybeSingle();
  return normalizeGuestPackages((data as { value?: unknown } | null)?.value);
}

export interface GuestInfo { enabled: boolean; photo_limit: number; used: number; can_upload: boolean; can_manage: boolean }

/** null = SQL (update-81) ажиллаагүй */
export async function guestPhotoInfo(albumId: string): Promise<GuestInfo | null> {
  const { data, error } = await supabase.rpc('guest_photo_info', { p_album_id: albumId });
  if (error) return null;
  const r = (Array.isArray(data) ? data[0] : data) as GuestInfo | undefined;
  return r ?? null;
}

export interface GuestPhoto { id: string; path: string; thumb_path: string; uploader_name: string; mine: boolean; created_at: string }

export async function listGuestPhotos(albumId: string, lockToken = ''): Promise<GuestPhoto[]> {
  const { data, error } = await supabase.rpc('album_guest_photo_list', { p_album_id: albumId, p_token: lockToken || null });
  if (error) return [];
  return (data ?? []) as GuestPhoto[];
}

export const guestUrl = (path: string) => supabase.storage.from('guest-photos').getPublicUrl(path).data.publicUrl;

export async function setGuestUpload(albumId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_guest_upload', { p_album_id: albumId, p_enabled: enabled });
  if (error) throw new Error(error.message);
}

export async function deleteGuestPhoto(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_guest_photo', { p_id: id });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { path?: string; thumb_path?: string } | undefined;
  const files = [row?.path, row?.thumb_path].filter(Boolean) as string[];
  if (files.length) await supabase.storage.from('guest-photos').remove(files);
}

// ── Зураг шахах ─────────────────────────────────────────────────────────────
const FULL_EDGE = 2048;
const TARGET_BYTES = 1_100_000; // ~1 MB
const THUMB_EDGE = 480;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Зургийг уншиж чадсангүй')); };
    img.src = url;
  });
}

function encode(img: HTMLImageElement, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Зураг шахаж чадсангүй'))), 'image/jpeg', quality));
}

/** ~1 MB-ийн үндсэн зураг + жижиг thumbnail */
export async function compressGuestPhoto(file: File): Promise<{ full: Blob; thumb: Blob }> {
  const img = await loadImage(file);
  let full = await encode(img, FULL_EDGE, 0.82);
  if (full.size > TARGET_BYTES) full = await encode(img, FULL_EDGE, 0.7);
  if (full.size > TARGET_BYTES) full = await encode(img, 1600, 0.7);
  const thumb = await encode(img, THUMB_EDGE, 0.72);
  return { full, thumb };
}

/** Нэг зургийг шахаж, storage руу оруулаад бүртгэнэ */
export async function uploadGuestPhoto(albumId: string, userId: string, file: File, lockToken = ''): Promise<void> {
  const { full, thumb } = await compressGuestPhoto(file);
  const key = crypto.randomUUID();
  const base = `${albumId}/${userId}/${key}`;
  const bucket = supabase.storage.from('guest-photos');
  const up1 = await bucket.upload(`${base}.jpg`, full, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (up1.error) throw new Error(up1.error.message.includes('row-level security') ? 'Зочдын зураг оруулах боломж хаагдсан эсвэл хязгаар дүүрсэн' : up1.error.message);
  const up2 = await bucket.upload(`${base}_t.jpg`, thumb, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (up2.error) { await bucket.remove([`${base}.jpg`]); throw new Error(up2.error.message); }
  const { error } = await supabase.rpc('add_guest_photo', {
    p_album_id: albumId, p_path: `${base}.jpg`, p_thumb_path: `${base}_t.jpg`, p_bytes: full.size + thumb.size, p_token: lockToken || null,
  });
  if (error) {
    await bucket.remove([`${base}.jpg`, `${base}_t.jpg`]);
    throw new Error(error.message.replace(/^GUEST_FULL:\s*/, ''));
  }
}
