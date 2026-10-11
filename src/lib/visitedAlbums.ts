/** Энэ төхөөрөмжөөс үзсэн цомгууд — нүүр хуудсанд «Таны цомог» товчоор буцаж орно */
const KEY = 'zm_visited_albums';
const MAX = 10;

export interface VisitedAlbum {
  id: string;
  name: string;
  /** /album/<link> хаягийн <link> хэсэг */
  link: string;
  cover?: string;
  at: number;
}

export function listVisitedAlbums(): VisitedAlbum[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(a => a && typeof a.id === 'string' && typeof a.link === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberAlbum(a: Omit<VisitedAlbum, 'at'>) {
  try {
    const link = a.link.replace(/^\/?album\//, '');
    if (!link) return;
    const list = listVisitedAlbums().filter(x => x.id !== a.id);
    list.unshift({ ...a, link, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch { /* хувийн цонх гэх мэт */ }
}

export function forgetAlbum(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(listVisitedAlbums().filter(x => x.id !== id)));
  } catch { /* */ }
}

/** «Таны цомог» товчийг X-ээр хаахад бүх жагсаалтыг арилгана. Линкээр дахин орвол rememberAlbum дахин нэмнэ. */
export function clearVisitedAlbums() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
}
