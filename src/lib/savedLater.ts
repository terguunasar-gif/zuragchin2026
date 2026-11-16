/** Төлөхдөө сонгоогүй үлдээсэн («Түр хадгалах») зургууд — цомог бүрт, энэ төхөөрөмжид */
const PREFIX = 'zm_saved_later_';
const laterKey = (albumId: string) => `${PREFIX}${albumId}`;

export function readLater(albumId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(laterKey(albumId)) || '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}

export function writeLater(albumId: string, ids: string[]): string[] {
  const uniq = [...new Set(ids)];
  try {
    if (uniq.length) localStorage.setItem(laterKey(albumId), JSON.stringify(uniq));
    else localStorage.removeItem(laterKey(albumId));
  } catch { /* хувийн цонх */ }
  return uniq;
}

/** Бүх цомгийн түр хадгалсан зургууд */
export function listAllLater(): { albumId: string; ids: string[] }[] {
  const out: { albumId: string; ids: string[] }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const albumId = k.slice(PREFIX.length);
      const ids = readLater(albumId);
      if (ids.length) out.push({ albumId, ids });
    }
  } catch { /* */ }
  return out;
}
