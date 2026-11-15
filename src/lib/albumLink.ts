/** Messenger зэрэг апп холбоосын ард наасан fbclid, төгсгөлийн цэг, слэш зэргийг цэвэрлэнэ. */
export function normalizeShareLink(raw: string | null | undefined): string {
  let s = (raw ?? '').trim();
  if (!s) return '';
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(s.replace(/\+/g, '%20'));
      if (decoded === s) break;
      s = decoded.trim();
    } catch {
      break;
    }
  }
  s = s.split(/[?#]/)[0];
  s = s.replace(/&fbclid\b.*/i, '').replace(/fbclid=.*/i, '');
  const embedded = s.match(/(?:^|\/)album\/([^/]+)/i);
  if (embedded) s = embedded[1];
  s = s.replace(/^[\s/\\]+/, '').replace(/[\s/\\.,;:!?)+\]}>'"»]+$/u, '');
  s = s.replace(/[&?].*$/, '').replace(/[,()*]/g, '').trim();
  return s;
}

export function albumOrFilter(link: string): string {
  return `share_link.eq./album/${link},share_link.eq.${link},id.eq.${link}`;
}

/** Багана байхгүй (хуучин SQL) — энэ нь сүлжээний алдаа биш. */
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();
  return code === '42703' || code === 'PGRST204'
    || msg.includes('does not exist')
    || msg.includes('schema cache')
    || msg.includes('could not find');
}

type QueryResult<T> = { data: T | null; error: { code?: string; message?: string } | null };

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Сүлжээ удаан байна. Дахин оролдоно уу.')), ms);
    Promise.resolve(p).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

/**
 * Нэг удаа автоматаар дахин оролдоно. Сүлжээ/timeout/query алдаа `error`-т үлдэнэ.
 * Амжилттай хоосон хариу (`data: null`, `error: null`) нь «цомог олдсонгүй».
 */
export async function readAlbumQuery<T>(
  run: () => PromiseLike<QueryResult<T>>,
  ms = 15000,
): Promise<QueryResult<T>> {
  const once = async (): Promise<QueryResult<T>> => {
    try {
      const res = await withTimeout(run(), ms);
      return { data: res.data ?? null, error: res.error ?? null };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'network';
      return { data: null, error: { message } };
    }
  };
  let res = await once();
  if (res.error && !isMissingColumnError(res.error)) res = await once();
  return res;
}
