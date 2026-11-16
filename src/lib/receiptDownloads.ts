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

/** Төлсөн ч татаж амжаагүй зургийн тоо (сервер download_count = 0 ба энэ төхөөрөмж дээр тэмдэглэгдээгүй). */
export async function undownloadedByInvoice(invoiceIds: string[]): Promise<{ invoice: string; count: number }[]> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay/signed-urls`;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const ids = [...new Set(invoiceIds.filter(Boolean))].slice(-10);
  return Promise.all(ids.map(async invoice => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
        body: JSON.stringify({ invoiceId: invoice }),
      });
      const body = await res.json().catch(() => ({}));
      const local = new Set(readDownloadedIds(invoice));
      const items = (body.signedUrls ?? []) as { purchaseId: string; type: string; signedUrl?: string; expired?: boolean; downloadCount?: number }[];
      const count = items.filter(u => u.type === 'download' && u.signedUrl && !u.expired
        && !(Number(u.downloadCount) > 0) && !local.has(u.purchaseId)).length;
      return { invoice, count };
    } catch { return { invoice, count: 0 }; }
  }));
}

export async function countUndownloaded(invoiceIds: string[]): Promise<number> {
  return (await undownloadedByInvoice(invoiceIds)).reduce((n, r) => n + r.count, 0);
}
