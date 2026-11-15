/** Киоск дэлгэцийн нэг хуудсанд хэдэн зураг гарах вэ. 1 нь одоогийн бүтэн зураг. */
export type KioskLayout = 1 | 4 | 9;

export const KIOSK_LAYOUT_KEY = 'zm_kiosk_layout';

export function parseKioskLayout(raw: string | null): KioskLayout {
  if (raw === '4' || raw === '9') return Number(raw) as KioskLayout;
  return 1;
}

/** `index` зураг аль хуудасны эхэнд байгаа. 1 горимд зураг бүр өөрийн хуудас. */
export function pageStartIndex(index: number, count: number, perPage: number): number {
  if (count <= 0) return 0;
  const per = perPage > 0 ? perPage : 1;
  const safe = Math.min(Math.max(Number.isFinite(index) ? Math.trunc(index) : 0, 0), count - 1);
  return Math.floor(safe / per) * per;
}

/** Сум, шивэлт: нэг хуудас урагш/хойш. Сүүлийн хуудаснаас эхнийх рүү ороод тойрно. */
export function movePage(index: number, delta: number, count: number, perPage: number): number {
  if (count <= 0) return 0;
  const per = perPage > 0 ? perPage : 1;
  const pages = Math.ceil(count / per);
  const page = pageStartIndex(index, count, per) / per;
  const next = ((page + delta) % pages + pages) % pages;
  return next * per;
}
