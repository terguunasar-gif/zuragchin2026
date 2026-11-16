/** Баримт бүрийн татсан зургууд. Энэ төхөөрөмж дээр хадгалагдана. */
const keyOf = (invoiceId: string) => `zm_receipt_dl_${invoiceId}`;

export function readDownloadedIds(invoiceId: string): string[] {
  if (!invoiceId || typeof localStorage === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(invoiceId)) || '[]');
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter((x): x is string => typeof x === 'string' && x.length > 0))];
  } catch {
    return [];
  }
}

export function writeDownloadedIds(invoiceId: string, ids: string[]): string[] {
  const next = [...new Set([...readDownloadedIds(invoiceId), ...ids.filter(id => typeof id === 'string' && id.length > 0)])];
  try { localStorage.setItem(keyOf(invoiceId), JSON.stringify(next)); } catch { /* хувийн цонх */ }
  return next;
}

/** Сервер download_count > 0 бол энэ зургийг аль хэдийн татсан гэж үзнэ. */
export function idsWithServerDownloads(rows: { id?: string | null; downloadCount?: number | null }[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.id && Number(row.downloadCount) > 0) ids.push(row.id);
  }
  return ids;
}

/** Татсан мөрүүдийг сонголтоос гаргана. Үлдсэн тоо дараагийн таталтад үлдэнэ. */
export function withoutDownloaded(selected: Iterable<string>, downloaded: Iterable<string>): string[] {
  const got = downloaded instanceof Set ? downloaded : new Set(downloaded);
  return [...selected].filter(id => !got.has(id));
}

export function everyDownloaded(ids: string[], downloaded: Iterable<string>): boolean {
  if (!ids.length) return false;
  const got = downloaded instanceof Set ? downloaded : new Set(downloaded);
  return ids.every(id => got.has(id));
}

/** Төлсөн ч татаж амжаагүй зургууд: нэг хурдан хүсэлтээр (сервер download_count = 0, хугацаа дуусаагүй),
 *  энэ төхөөрөмж дээр татсан гэж тэмдэглэгдсэнийг хасна. Сүүлийн хариуг кэшлэнэ. */
const UNDL_CACHE = 'zm_undl_cache';
export function cachedUndownloaded(invoiceIds: string[]): { invoice: string; count: number }[] {
  try {
    const all = JSON.parse(localStorage.getItem(UNDL_CACHE) || '{}') as Record<string, string[]>;
    return invoiceIds.map(invoice => {
      const local = new Set(readDownloadedIds(invoice));
      return { invoice, count: (all[invoice] ?? []).filter(id => !local.has(id)).length };
    }).filter(x => x.count > 0);
  } catch { return []; }
}

export async function undownloadedByInvoice(invoiceIds: string[]): Promise<{ invoice: string; count: number }[]> {
  const ids = [...new Set(invoiceIds.filter(Boolean))].slice(-30);
  if (!ids.length) return [];
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay/undownloaded`;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
    body: JSON.stringify({ invoiceIds: ids }),
  });
  if (!res.ok) throw new Error(String(res.status));
  const body = await res.json().catch(() => ({}));
  const items = (body.items ?? []) as { invoiceId: string; purchaseIds: string[] }[];
  // кэш шинэчлэх
  try {
    const all = JSON.parse(localStorage.getItem(UNDL_CACHE) || '{}') as Record<string, string[]>;
    for (const id of ids) delete all[id];
    for (const it of items) all[it.invoiceId] = it.purchaseIds;
    localStorage.setItem(UNDL_CACHE, JSON.stringify(all));
  } catch { /* */ }
  return ids.map(invoice => {
    const local = new Set(readDownloadedIds(invoice));
    const it = items.find(x => x.invoiceId === invoice);
    return { invoice, count: (it?.purchaseIds ?? []).filter(id => !local.has(id)).length };
  }).filter(x => x.count > 0);
}

export async function countUndownloaded(invoiceIds: string[]): Promise<number> {
  return (await undownloadedByInvoice(invoiceIds)).reduce((n, r) => n + r.count, 0);
}
