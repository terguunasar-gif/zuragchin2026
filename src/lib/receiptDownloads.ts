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
