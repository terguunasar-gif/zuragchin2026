import { supabase } from './supabase';

export type StudioStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface Studio {
  id: string;
  owner_user_id: string | null;
  name: string;
  slug: string;
  description: string;
  phone: string;
  instagram: string;
  facebook: string;
  address: string;
  city: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  logo_url: string | null;
  cover_url: string | null;
  specialties: string[];
  status: StudioStatus;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudioHit extends Studio {
  distanceMeters: number | null;
}

export const STUDIO_SPECIALTIES = [
  'Хурим',
  'Портрет',
  'Студи зураг',
  'Гэр бүл',
  'Хүүхэд',
  'Мода',
  'Бүтээгдэхүүн',
  'Арга хэмжээ',
];

export const STUDIO_CITIES = [
  'Улаанбаатар', 'Дархан', 'Эрдэнэт', 'Баянхонгор', 'Өвөрхангай',
  'Архангай', 'Булган', 'Орхон', 'Сэлэнгэ', 'Төв', 'Дорнод',
  'Сүхбаатар', 'Хэнтий', 'Дорноговь', 'Дундговь', 'Өмнөговь',
  'Говьсүмбэр', 'Ховд', 'Баян-Өлгий', 'Увс', 'Завхан', 'Говь-Алтай', 'Хөвсгөл',
];

export const RADIUS_STOPS = [
  { meters: 500, label: '500м' },
  { meters: 2000, label: '2км' },
  { meters: 5000, label: '5км' },
  { meters: 10000, label: '10км' },
] as const;

export const DEFAULT_RADIUS_METERS = 2000;

export const DEFAULT_STUDIO_COVER =
  'https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?w=1200&h=600&fit=crop';

export const UB_CENTER = { lat: 47.9184, lng: 106.9177 };

export const STUDIO_STATUS_LABEL: Record<StudioStatus, string> = {
  draft: 'Ноорог',
  pending: 'Хүлээгдэж буй',
  approved: 'Батлагдсан',
  rejected: 'Татгалзсан',
};

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slugifyStudioName(name: string): string {
  let out = '';
  for (const ch of name.trim().toLowerCase()) {
    if (CYR[ch]) out += CYR[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += '-';
  }
  return out.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function makeStudioSlug(name: string): string {
  const base = (slugifyStudioName(name) || 'studio').slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

export function nearestRadius(meters: number): number {
  if (!Number.isFinite(meters)) return DEFAULT_RADIUS_METERS;
  return RADIUS_STOPS.reduce(
    (best, stop) => (Math.abs(stop.meters - meters) < Math.abs(best - meters) ? stop.meters : best),
    DEFAULT_RADIUS_METERS,
  );
}

export function radiusLabel(meters: number): string {
  return RADIUS_STOPS.find(stop => stop.meters === nearestRadius(meters))?.label ?? `${meters}м`;
}

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} км` : `${Math.round(km)} км`;
}

export function studioPlace(studio: Pick<Studio, 'city' | 'district' | 'address'>): string {
  const city = [studio.city, studio.district].filter(Boolean).join(' · ');
  return city || studio.address || '';
}

export function instagramHref(handle: string): string {
  const value = handle.trim().replace(/^@/, '');
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return `https://instagram.com/${value}`;
}

export function facebookHref(value: string): string {
  const v = value.trim();
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  return `https://${v}`;
}

export function hasCoordinates<T extends { latitude: number | null; longitude: number | null }>(
  studio: T,
): studio is T & { latitude: number; longitude: number } {
  return studio.latitude != null && studio.longitude != null
    && Number.isFinite(studio.latitude) && Number.isFinite(studio.longitude);
}

export function isPublicStudio(studio: Pick<Studio, 'status' | 'is_visible'>): boolean {
  return studio.status === 'approved' && studio.is_visible;
}

export function statusBadgeClass(status: StudioStatus): string {
  if (status === 'approved') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (status === 'pending') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (status === 'rejected') return 'bg-red-500/15 text-red-300 border-red-500/30';
  return 'bg-white/5 text-stone-400 border-white/10';
}

export function normalizeStudio(row: Studio): Studio {
  const latitude = row.latitude == null ? null : Number(row.latitude);
  const longitude = row.longitude == null ? null : Number(row.longitude);
  return {
    ...row,
    description: row.description ?? '',
    phone: row.phone ?? '',
    instagram: row.instagram ?? '',
    facebook: row.facebook ?? '',
    address: row.address ?? '',
    city: row.city ?? '',
    district: row.district ?? '',
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    latitude: latitude != null && Number.isFinite(latitude) ? latitude : null,
    longitude: longitude != null && Number.isFinite(longitude) ? longitude : null,
  };
}

export function readMapOrigin(latRaw: string | null, lngRaw: string | null): { lat: number; lng: number } | null {
  if (latRaw == null || lngRaw == null || latRaw === '' || lngRaw === '') return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function filterStudios(
  rows: Studio[],
  opts: { q: string; specialty: string; origin: { lat: number; lng: number } | null; radiusMeters: number },
): StudioHit[] {
  const q = opts.q.trim().toLowerCase();
  const hits: StudioHit[] = [];
  for (const row of rows) {
    let distanceMeters: number | null = null;
    if (opts.origin) {
      if (!hasCoordinates(row)) continue;
      distanceMeters = haversineMeters(opts.origin.lat, opts.origin.lng, row.latitude, row.longitude);
      if (distanceMeters > opts.radiusMeters) continue;
    }
    if (opts.specialty && opts.specialty !== 'Бүгд' && !row.specialties.includes(opts.specialty)) continue;
    if (q) {
      const hay = [row.name, row.description, row.city, row.district, row.address, ...row.specialties]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }
    hits.push({ ...row, distanceMeters });
  }
  hits.sort((a, b) => {
    if (a.distanceMeters != null && b.distanceMeters != null) return a.distanceMeters - b.distanceMeters;
    return a.name.localeCompare(b.name, 'mn');
  });
  return hits;
}

export function requestCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Энэ төхөөрөмж байршил дэмжихгүй. Газрын зураг дээр дарж тэмдэглэнэ үү.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('Байршил авах боломжгүй. Газрын зураг дээр дарж тэмдэглэнэ үү.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export async function fetchPublicStudios(): Promise<Studio[]> {
  const { data, error } = await supabase
    .from('studios')
    .select('*')
    .eq('status', 'approved')
    .eq('is_visible', true)
    .order('name');
  if (error) throw error;
  return (data ?? []).map(row => normalizeStudio(row as Studio));
}

export async function fetchStudioBySlug(slugOrId: string): Promise<Studio | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slugOrId);
  const query = supabase.from('studios').select('*');
  const { data, error } = await (isUuid ? query.eq('id', slugOrId) : query.eq('slug', slugOrId)).maybeSingle();
  if (error) throw error;
  return data ? normalizeStudio(data as Studio) : null;
}

export async function uploadStudioImage(userId: string, file: File, kind: 'logo' | 'cover'): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/studios/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('covers').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw error;
  const { data } = supabase.storage.from('covers').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}
