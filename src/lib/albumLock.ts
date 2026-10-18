import { supabase } from './supabase';

/** Цомгийн 4 оронтой код түгжээ (update-53) */
export type AlbumLockState = 'open' | 'bypass' | 'ok' | 'locked';

const keyOf = (albumId: string) => `zm_album_key_${albumId}`;

export function savedAlbumKey(albumId: string): string {
  try { return localStorage.getItem(keyOf(albumId)) || ''; } catch { return ''; }
}

function saveAlbumKey(albumId: string, token: string) {
  try { localStorage.setItem(keyOf(albumId), token); } catch { /* хувийн цонх */ }
}

/** SQL (update-53) ажиллуулаагүй бол 'open' гэж үзнэ */
export async function albumLockState(albumId: string): Promise<{ state: AlbumLockState; token: string }> {
  const token = savedAlbumKey(albumId);
  const { data, error } = await supabase.rpc('album_lock_state', { p_album_id: albumId, p_token: token || null });
  if (error || typeof data !== 'string') return { state: 'open', token: '' };
  return { state: data as AlbumLockState, token };
}

export async function unlockAlbum(albumId: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('unlock_album', { p_album_id: albumId, p_pin: pin });
  if (error) return { ok: false, error: 'Шалгаж чадсангүй, дахин оролдоно уу' };
  const r = data as { ok: boolean; token?: string; error?: string };
  if (r.ok) { if (r.token) saveAlbumKey(albumId, r.token); return { ok: true }; }
  return { ok: false, error: r.error === 'too_many' ? 'Хэт олон удаа буруу оруулсан. 15 минутын дараа дахин оролдоно уу.' : 'Код буруу байна' };
}

export interface AlbumLockInfo { paid: boolean; enabled: boolean; pin: string; price: number }

/** Цомгийн эзэнд — null бол SQL ажиллуулаагүй эсвэл эрхгүй */
export async function albumLockInfo(albumId: string): Promise<AlbumLockInfo | null> {
  const { data, error } = await supabase.rpc('album_lock_info', { p_album_id: albumId });
  if (error || !Array.isArray(data) || !data[0]) return null;
  const r = data[0];
  return { paid: !!r.paid, enabled: !!r.enabled, pin: String(r.pin ?? ''), price: Number(r.price ?? 10000) };
}

export async function setAlbumLock(albumId: string, enabled: boolean, pin?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('set_album_lock', { p_album_id: albumId, p_enabled: enabled, p_pin: pin ?? null });
  if (error) throw new Error(error.message);
  return String(data ?? '');
}
