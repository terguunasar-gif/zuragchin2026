// Худалдан авагч нэвтрэхгүйгээр худалддаг тул сагс болон төлсөн захиалгын
// түүхийг тухайн төхөөрөмжийн браузерт (localStorage) хадгална.

const CART_PREFIX = 'zuragchin_cart_';
const PENDING_PREFIX = 'zuragchin_pending_';
const HISTORY_KEY = 'zuragchin_purchases';

export interface PurchaseHistoryEntry {
  invoiceId: string;
  albumId: string;
  albumName: string;
  albumLink: string;
  total: number;
  downloads: number;
  prints: number;
  buyerName: string;
  paidAt: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* хувийн цонх гэх мэт үед хадгалахгүй */ }
}

// ── Сагс (цомог бүрээр) ─────────────────────────────────────────────────────
export function loadCart<T>(albumId: string): T[] {
  const v = read<T[]>(CART_PREFIX + albumId, []);
  return Array.isArray(v) ? v : [];
}

export function saveCart(albumId: string, cart: unknown[]) {
  write(CART_PREFIX + albumId, cart.length > 0 ? cart : null);
}

// ── Төлөгдөж амжаагүй нэхэмжлэх ─────────────────────────────────────────────
export function getPendingInvoice(albumId: string): string | null {
  return read<string | null>(PENDING_PREFIX + albumId, null);
}

export function setPendingInvoice(albumId: string, invoiceId: string | null) {
  write(PENDING_PREFIX + albumId, invoiceId);
}

/** Энэ хөтөчид үлдсэн бүх төлөгдөж амжаагүй (эсвэл төлөгдсөн ч баримт нь нээгдээгүй) нэхэмжлэх */
export function listPendingInvoices(): { albumId: string; invoiceId: string }[] {
  const out: { albumId: string; invoiceId: string }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PENDING_PREFIX)) continue;
      const v = read<string | null>(k, null);
      if (v) out.push({ albumId: k.slice(PENDING_PREFIX.length), invoiceId: v });
    }
  } catch { /* */ }
  return out;
}

// ── Төлсөн захиалгын түүх ───────────────────────────────────────────────────
export function listPurchaseHistory(): PurchaseHistoryEntry[] {
  const v = read<PurchaseHistoryEntry[]>(HISTORY_KEY, []);
  if (!Array.isArray(v)) return [];
  return [...v].sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
}

export function addPurchaseHistory(entry: PurchaseHistoryEntry) {
  const list = listPurchaseHistory().filter(e => e.invoiceId !== entry.invoiceId);
  list.unshift(entry);
  write(HISTORY_KEY, list.slice(0, 200));
}

/**
 * Энэ хөтөч дээрх бүх мэдэгдэх төлсөн нэхэмжлэхүүдийг «Төлсөн» түүхэнд нэгтгэнэ:
 * цомгийн хөтчийн (guide) төлсөн/эзэмшсэн зургууд түүхэнд ороогүй байж болно
 * (баримтыг нээгээгүй, эсвэл түүх бичдэг болохоос өмнө төлсөн).
 */
export function syncPurchaseHistoryFromGuides(): void {
  try {
    const known = new Set(listPurchaseHistory().map(h => h.invoiceId));
    let visited: { id: string; name: string; link: string }[] = [];
    try { visited = JSON.parse(localStorage.getItem('zm_visited_albums') || '[]') || []; } catch { /* */ }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('zm_album_guide_')) continue;
      const albumId = k.slice('zm_album_guide_'.length);
      let g: { name?: string; paidInvoices?: unknown; owned?: unknown } = {};
      try { g = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { continue; }
      const owned = Array.isArray(g.owned) ? g.owned as { invoiceId?: string; type?: string }[] : [];
      const invs = new Set<string>([
        ...(Array.isArray(g.paidInvoices) ? g.paidInvoices.filter((x): x is string => typeof x === 'string') : []),
        ...owned.map(o => o.invoiceId).filter((x): x is string => typeof x === 'string'),
      ]);
      const va = visited.find(v => v.id === albumId);
      for (const inv of invs) {
        if (!inv || known.has(inv)) continue;
        known.add(inv);
        const mine = owned.filter(o => o.invoiceId === inv);
        addPurchaseHistory({
          invoiceId: inv, albumId, albumName: va?.name || 'Цомог', albumLink: va?.link || albumId,
          total: 0, downloads: mine.filter(o => o.type === 'download').length, prints: mine.filter(o => o.type === 'print').length,
          buyerName: typeof g.name === 'string' ? g.name : '', paidAt: new Date().toISOString(),
        });
      }
    }
  } catch { /* */ }
}
