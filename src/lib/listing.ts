import { publicDb, withTimeout } from './supabase';

/** Нүүр хуудсанд цомог нийтлэх багц — админ platform_settings.listing_packages-д тохируулна */
export interface ListingPackage { code: string; name: string; days: number; price: number }

export const DEFAULT_LISTING_PACKAGES: ListingPackage[] = [
  { code: 'week', name: '7 хоног', days: 7, price: 5000 },
  { code: 'month', name: '30 хоног', days: 30, price: 15000 },
];

export const LISTING_CATEGORIES = [
  // Арга хэмжээ
  'Хурим', 'Баяр наадам', 'Спорт', 'Соёл', 'Хөгжим', 'Марафон', 'Хурал, уулзалт', 'Төгсөлт', 'Хүүхэд', 'Аялал',
  // Уран сайхны гэрэл зургийн төрөл
  'Хөрөг', 'Байгаль', 'Гэр бүл', 'Загвар, моод', 'Гудамж', 'Архитектур', 'Амьтан', 'Хоол', 'Уран сайхан',
  'Бусад',
];

/** Төрөл бүрийн тэмдэг — нүүр хуудасны шүүлтүүрт */
export const CATEGORY_ICONS: Record<string, string> = {
  'Хурим': '💍', 'Баяр наадам': '🏇', 'Спорт': '⚽', 'Соёл': '🎭', 'Хөгжим': '🎵', 'Марафон': '🏃',
  'Хурал, уулзалт': '🎤', 'Төгсөлт': '🎓', 'Хүүхэд': '🧸', 'Аялал': '🧭',
  'Хөрөг': '👤', 'Байгаль': '🏔️', 'Гэр бүл': '👨‍👩‍👧', 'Загвар, моод': '👗', 'Гудамж': '🏙️',
  'Архитектур': '🏛️', 'Амьтан': '🐎', 'Хоол': '🍜', 'Уран сайхан': '🎨', 'Бусад': '📷',
};

export function normalizeListingPackages(v: unknown): ListingPackage[] {
  if (!Array.isArray(v)) return DEFAULT_LISTING_PACKAGES;
  const list = v.map((p: Record<string, unknown>) => ({
    code: String(p.code ?? ''), name: String(p.name ?? p.code ?? ''), days: Number(p.days), price: Number(p.price),
  })).filter(p => p.code && p.days > 0 && p.price > 0);
  return list.length ? list : DEFAULT_LISTING_PACKAGES;
}

export async function loadListingPackages(): Promise<ListingPackage[]> {
  const { data } = await publicDb.from('platform_settings').select('value').eq('key', 'listing_packages').maybeSingle();
  return normalizeListingPackages((data as { value?: unknown } | null)?.value);
}

export interface PublicAlbum {
  id: string; name: string; share_link: string; cover_url: string | null; photographers: string | null;
  photo_count: number; price: number; category: string; location: string; event_date: string | null;
  /** Цомгийн хамгийн өндөр зургийн үнэ (update-41). price нь хамгийн бага үнэ. */
  max_price?: number | null;
}

export async function fetchPublicAlbums(opts: { category?: string; q?: string; photographer?: string; limit?: number; offset?: number } = {}): Promise<PublicAlbum[]> {
  const { data, error } = await withTimeout(publicDb.rpc('list_public_albums', {
    p_category: opts.category || null,
    p_q: opts.q?.trim() || null,
    p_photographer: opts.photographer || null,
    p_limit: opts.limit ?? 24,
    p_offset: opts.offset ?? 0,
  }), 12000);
  if (error) throw error;
  return ((data ?? []) as PublicAlbum[]).map(a => ({ ...a, price: Number(a.price ?? 0), max_price: a.max_price == null ? null : Number(a.max_price) }));
}

export const albumHref = (shareLink: string) => `/album/${shareLink.replace(/^\/?album\//, '')}`;

/** Зурагчны өгсөн нэрээр олдсон зарах зураг (update-50) */
export interface PublicPhotoHit {
  id: string; title: string; preview_url: string | null; album_id: string; album_name: string;
  share_link: string; price: number; photographer: string;
}

export async function searchPublicPhotos(q: string, limit = 24): Promise<PublicPhotoHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const { data, error } = await withTimeout(publicDb.rpc('search_public_photos', { p_q: term, p_limit: limit }), 12000);
  if (error) return []; // SQL ажиллуулаагүй бол цомгийн хайлт л ажиллана
  return ((data ?? []) as PublicPhotoHit[]).map(p => ({ ...p, price: Number(p.price ?? 0) }));
}
