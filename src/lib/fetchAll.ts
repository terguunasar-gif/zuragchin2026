/**
 * Supabase (PostgREST) нэг хүсэлтэд хамгийн ихдээ 1000 мөр буцаадаг (max_rows).
 * .limit(3000) ч энэ хязгаарыг давдаггүй — 1000-аас олон зурагтай цомгийн үлдсэн зургууд «алга» болдог байсан.
 * Энэ туслах функц .range()-ээр 1000-аар нь хуудаслан бүгдийг нь уншина.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PageResult<T> = { data: T[] | null; error: any };

export const PAGE_ROWS = 1000;

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  maxRows = 50000,
): Promise<PageResult<T>> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) return from === 0 ? { data: null, error } : { data: out, error: null };
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_ROWS) break;
  }
  return { data: out, error: null };
}
