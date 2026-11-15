// Худалдан авалт сэргээх цэвэр логик (Deno болон тест хоёуланд ажиллана).
// Захиалгын мөр буцаахгүй — зөвхөн дугаар, хязгаар, бүлэглэлт.

export const LIMITS = {
  requestPhone15m: 3,
  requestPhoneDay: 8,
  requestIp15m: 10,
  requestIpDay: 30,
  verifyPhone15m: 15,
  verifyPhoneDay: 40,
  verifyIp15m: 30,
  verifyIpDay: 80,
  window15m: 15 * 60 * 1000,
  windowDay: 24 * 60 * 60 * 1000,
  cooldownMs: 60 * 1000,
  ttlMs: 5 * 60 * 1000,
  maxAttempts: 5,
} as const;

export interface PaidRow {
  qpay_invoice_id: string;
  created_at: string;
  album_id: string;
  type: string;
  gross_amount: number;
  buyer_name: string;
  buyer_phone: string;
  album_name: string;
  album_title: string;
  share_link: string;
}

export interface RecoveredOrder {
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

/** Checkout дээр хадгалсан 8 оронтой дугаар. 976 угтвартай 11 оронг сүүлийн 8 болгоно. */
export function normalizePhone(raw: unknown): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (/^\d{8}$/.test(d)) return d;
  if (/^976\d{8}$/.test(d)) return d.slice(3);
  return null;
}

export function isSixDigitCode(raw: unknown): boolean {
  return /^\d{6}$/.test(String(raw ?? "").trim());
}

export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let out = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const av = i < a.length ? a.charCodeAt(i) : 0;
    const bv = i < b.length ? b.charCodeAt(i) : 0;
    out |= av ^ bv;
  }
  return out === 0;
}

/** 000000–999999, modulo хазайлтгүй. */
export function randomCode(): string {
  const limit = 1_000_000;
  const max = Math.floor(0x1_0000_0000 / limit) * limit;
  const buf = new Uint32Array(1);
  let n = 0;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= max);
  return String(n % limit).padStart(6, "0");
}

/** Цонхон дахь оролдлого max-аас хэтэрвэл хүлээх секунд, үгүй бол 0. Одоогийн оролдлого hits дотор байна. */
export function retryAfterSeconds(nowMs: number, hits: number[], windowMs: number, max: number): number {
  const inWindow = hits.filter((t) => t > nowMs - windowMs && t <= nowMs);
  if (inWindow.length <= max) return 0;
  const oldest = Math.min(...inWindow);
  return Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
}

export function strictestRetry(waits: number[]): number {
  return waits.reduce((m, n) => Math.max(m, n), 0);
}

/**
 * Зөвхөн тухайн утасны төлсөн мөрүүдийг нэхэмжлэхээр бүлэглэнэ.
 * Өөр дугаар холилдвол null — дуудагч захиалга буцаахгүй.
 */
export function groupPaidPurchases(phone: string, rows: PaidRow[]): RecoveredOrder[] | null {
  if (rows.some((r) => r.buyer_phone !== phone)) return null;
  const map = new Map<string, RecoveredOrder>();
  for (const r of rows) {
    const invoiceId = String(r.qpay_invoice_id ?? "");
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(invoiceId)) continue;
    let order = map.get(invoiceId);
    if (!order) {
      const title = String(r.album_title ?? "").trim();
      const name = String(r.album_name ?? "").trim();
      order = {
        invoiceId,
        albumId: String(r.album_id ?? ""),
        albumName: (title || name).slice(0, 200),
        albumLink: String(r.share_link ?? "").replace(/^\/?album\//, "").slice(0, 200),
        total: 0,
        downloads: 0,
        prints: 0,
        buyerName: String(r.buyer_name ?? "").trim().slice(0, 80),
        paidAt: String(r.created_at ?? ""),
      };
      map.set(invoiceId, order);
    }
    const amount = Number(r.gross_amount) || 0;
    order.total = Math.round((order.total + amount) * 100) / 100;
    if (r.type === "download") order.downloads += 1;
    else if (r.type === "print") order.prints += 1;
    if (!order.buyerName && r.buyer_name) order.buyerName = String(r.buyer_name).trim().slice(0, 80);
    if (r.created_at && (!order.paidAt || r.created_at < order.paidAt)) order.paidAt = r.created_at;
  }
  return [...map.values()]
    .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""))
    .slice(0, 200);
}
