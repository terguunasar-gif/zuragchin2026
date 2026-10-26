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
  /** Нүүр хуудасны студийн хэсэг. Хайлтын is_visible-ээс тусдаа. */
  show_on_home: boolean;
  /** NULL = хязгааргүй / шууд. */
  listed_from: string | null;
  listed_until: string | null;
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

/** Цэг тавьсны дараах хайлтын радиус. Нүүр болон /studios ижил шошго, анхны утга 500м. */
export const RADIUS_STOPS = [
  { meters: 500, label: '500м' },
  { meters: 1000, label: '1км' },
  { meters: 2000, label: '2км' },
  { meters: 3000, label: '3км' },
  { meters: 5000, label: '5км' },
  { meters: 10000, label: '10км' },
] as const;

export const DEFAULT_RADIUS_METERS = 500;

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

export type ListingPhase = 'unlimited' | 'scheduled' | 'open' | 'expired';

export function isWithinListingWindow(
  studio: Pick<Studio, 'listed_from' | 'listed_until'>,
  now = Date.now(),
): boolean {
  if (studio.listed_from) {
    const from = new Date(studio.listed_from).getTime();
    if (Number.isFinite(from) && now < from) return false;
  }
  if (studio.listed_until) {
    const until = new Date(studio.listed_until).getTime();
    if (Number.isFinite(until) && now > until) return false;
  }
  return true;
}

export function listingPhase(
  studio: Pick<Studio, 'listed_from' | 'listed_until'>,
  now = Date.now(),
): ListingPhase {
  const from = studio.listed_from ? new Date(studio.listed_from).getTime() : null;
  const until = studio.listed_until ? new Date(studio.listed_until).getTime() : null;
  const hasFrom = from != null && Number.isFinite(from);
  const hasUntil = until != null && Number.isFinite(until);
  if (hasFrom && now < (from as number)) return 'scheduled';
  if (hasUntil && now > (until as number)) return 'expired';
  if (!hasFrom && !hasUntil) return 'unlimited';
  return 'open';
}

export function formatListingStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Админ жагсаалтад: үлдсэн хугацаа, дууссан, эхлээгүй, хязгааргүй. */
export function listingSummary(
  studio: Pick<Studio, 'listed_from' | 'listed_until'>,
  now = Date.now(),
): string {
  const phase = listingPhase(studio, now);
  if (phase === 'unlimited') return 'Хугацаагүй';
  if (phase === 'scheduled' && studio.listed_from) return `Эхлээгүй · ${formatListingStamp(studio.listed_from)}`;
  if (phase === 'expired') {
    const stamp = studio.listed_until ? formatListingStamp(studio.listed_until) : '';
    return stamp ? `Дууссан · ${stamp}` : 'Дууссан';
  }
  if (studio.listed_until) {
    const ms = new Date(studio.listed_until).getTime() - now;
    const days = Math.ceil(ms / 86400000);
    if (days <= 1) return 'Өнөөдөр дуусна';
    return `${days} хоног үлдсэн`;
  }
  return 'Идэвхтэй';
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function listingWindowError(fromIso: string | null, untilIso: string | null): string | null {
  if (!fromIso || !untilIso) return null;
  const from = new Date(fromIso).getTime();
  const until = new Date(untilIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(until)) return 'Огноо буруу байна.';
  if (until < from) return 'Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.';
  return null;
}

export function isPublicStudio(
  studio: Pick<Studio, 'status' | 'is_visible' | 'listed_from' | 'listed_until'>,
): boolean {
  return studio.status === 'approved' && studio.is_visible && isWithinListingWindow(studio);
}

/** Нүүр хуудас: нийтийн жагсаалт + show_on_home. */
export function isHomeStudio(
  studio: Pick<Studio, 'status' | 'is_visible' | 'listed_from' | 'listed_until' | 'show_on_home'>,
): boolean {
  return isPublicStudio(studio) && studio.show_on_home;
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
    show_on_home: row.show_on_home !== false,
    listed_from: row.listed_from ?? null,
    listed_until: row.listed_until ?? null,
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
  // Non-finite radius (homepage «Бүгд») keeps every studio and still records distance.
  const limitRadius = Number.isFinite(opts.radiusMeters);
  const hits: StudioHit[] = [];
  for (const row of rows) {
    let distanceMeters: number | null = null;
    if (opts.origin) {
      if (hasCoordinates(row)) {
        distanceMeters = haversineMeters(opts.origin.lat, opts.origin.lng, row.latitude, row.longitude);
        if (limitRadius && distanceMeters > opts.radiusMeters) continue;
      } else if (limitRadius) {
        continue;
      }
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
    const ad = a.distanceMeters;
    const bd = b.distanceMeters;
    if (ad != null && bd != null) return ad - bd || a.name.localeCompare(b.name, 'mn');
    if (ad != null) return -1;
    if (bd != null) return 1;
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

function applyListingWindow(rows: Studio[]): Studio[] {
  return rows.filter(row => isWithinListingWindow(row));
}

/** Батлагдсан, харагдах, жагсаалтын цонхонд багтсан студи. show_on_home шаардлагагүй. */
export async function fetchPublicStudios(): Promise<Studio[]> {
  const { data, error } = await supabase
    .from('studios')
    .select('*')
    .eq('status', 'approved')
    .eq('is_visible', true)
    .order('name');
  if (error) throw error;
  return applyListingWindow((data ?? []).map(row => normalizeStudio(row as Studio)));
}

/** Нүүр хуудасны студийн хэсэг: нийтийн жагсаалт + show_on_home. */
export async function fetchHomeStudios(): Promise<Studio[]> {
  const rows = await fetchPublicStudios();
  return rows.filter(row => row.show_on_home);
}

export interface StudioOwner {
  id: string;
  name: string;
  email: string;
}

export function studioOwnerLabel(owner: Pick<StudioOwner, 'name' | 'email'> | null | undefined): string {
  if (!owner) return 'Эзэмшигчгүй';
  const name = owner.name.trim();
  const email = owner.email.trim();
  if (name && email) return `${name} · ${email}`;
  return name || email || 'Эзэмшигч';
}

function mapOwnerRow(row: { id?: string; name?: string | null; email?: string | null }): StudioOwner {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
  };
}

async function queryOwnerTable(table: 'users' | 'profiles', q: string) {
  let request = supabase
    .from(table)
    .select('id, name, email')
    .contains('role', ['photographer'])
    .order('name')
    .limit(15);
  if (q) request = request.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
  return request;
}

/** Бүртгэлтэй зурагчныг нэр эсвэл имэйлээр хайна (админ оноолт). */
export async function searchStudioOwners(query: string): Promise<StudioOwner[]> {
  const q = query.trim().replace(/[%_,]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
  const primary = await queryOwnerTable('users', q);
  const source = primary.error ? await queryOwnerTable('profiles', q) : primary;
  if (source.error) throw source.error;
  const byId = new Map<string, StudioOwner>();
  for (const row of source.data ?? []) {
    const owner = mapOwnerRow(row);
    if (owner.id) byId.set(owner.id, owner);
  }

  if (q) {
    const { data: profiles } = await supabase
      .from('photographer_profiles')
      .select('user_id, display_name')
      .ilike('display_name', `%${q}%`)
      .limit(15);
    const named = (profiles ?? [])
      .map(row => ({ id: String(row.user_id ?? ''), displayName: String(row.display_name ?? '') }))
      .filter(row => row.id);
    for (const row of named) {
      const existing = byId.get(row.id);
      if (existing && !existing.name && row.displayName) {
        byId.set(row.id, { ...existing, name: row.displayName });
      }
    }
    const missing = named.filter(row => !byId.has(row.id)).map(row => row.id);
    if (missing.length > 0) {
      const extra = await fetchStudioOwners(missing);
      for (const row of named) {
        if (byId.has(row.id)) continue;
        const owner = extra[row.id];
        if (!owner) continue;
        byId.set(row.id, { ...owner, name: owner.name || row.displayName });
      }
    }
  }

  return [...byId.values()].slice(0, 15);
}

export async function fetchStudioOwners(ids: string[]): Promise<Record<string, StudioOwner>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const fromUsers = await supabase.from('users').select('id, name, email').in('id', unique);
  const source = fromUsers.error
    ? await supabase.from('profiles').select('id, name, email').in('id', unique)
    : fromUsers;
  if (source.error) throw source.error;
  const map: Record<string, StudioOwner> = {};
  for (const row of source.data ?? []) {
    const owner = mapOwnerRow(row);
    if (owner.id) map[owner.id] = owner;
  }
  return map;
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
