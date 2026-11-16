import type { PhotoAdjust, PrintCrop } from './photoAdjust';

/**
 * Төлөхөөс өмнө сагсанд хийсэн засварууд — нэхэмжлэх үүссэн үед хадгалж,
 * төлбөр баталгаажмагц худалдан авалт бүрт (buyer-adjust) хадгална.
 */
type Edit = PhotoAdjust & PrintCrop;
export interface PendingEdit { photoId: string; type: 'download' | 'print'; adjust: Edit }

const KEY = 'zm_pending_edits';
const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

function readAll(): Record<string, PendingEdit[]> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function writeAll(v: Record<string, PendingEdit[]>) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* */ }
}

export function savePendingEdits(invoiceId: string, edits: PendingEdit[]) {
  const all = readAll();
  if (edits.length) all[invoiceId] = edits; else delete all[invoiceId];
  writeAll(all);
}

export function hasPendingEdits(invoiceId: string): boolean {
  return !!readAll()[invoiceId]?.length;
}

/** Төлөгдсөн нэхэмжлэхийн хүлээгдэж буй засваруудыг серверт хадгална. Буцаах: purchaseId → засвар */
export async function flushPendingEdits(invoiceId: string): Promise<Record<string, Edit>> {
  const edits = readAll()[invoiceId];
  if (!edits?.length) return {};
  const res = await fetch(`${QPAY_FN_URL}/signed-urls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ invoiceId }),
  });
  if (!res.ok) return {};
  const data = await res.json().catch(() => ({}));
  const items = (data.signedUrls ?? []) as { purchaseId: string; photoId?: string; type: string }[];
  const saved: Record<string, Edit> = {};
  const left: PendingEdit[] = [];
  for (const e of edits) {
    const it = items.find(i => i.photoId === e.photoId && i.type === e.type);
    if (!it) { left.push(e); continue; }
    try {
      const r = await fetch(`${QPAY_FN_URL}/buyer-adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ invoiceId, purchaseId: it.purchaseId, adjust: e.adjust }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) saved[it.purchaseId] = j.adjust ?? e.adjust;
      else if (r.status >= 500) left.push(e); // дараа дахин оролдоно; эрхгүй (403/409) бол орхино
    } catch { left.push(e); }
  }
  savePendingEdits(invoiceId, left);
  return saved;
}
