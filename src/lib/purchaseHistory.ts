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
