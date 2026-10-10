import { publicDb } from './supabase';

/** «Үнэгүй хуваалцах» цомгийн багц — сайтын админ platform_settings.free_packages-д тохируулна */
export interface FreePackage { code: string; name: string; photos: number; days: number; price: number }

export const DEFAULT_FREE_PACKAGES: FreePackage[] = [
  { code: 'trial', name: 'Туршилт', photos: 20, days: 7, price: 0 },
  { code: 'small', name: 'Жижиг', photos: 100, days: 30, price: 15000 },
  { code: 'medium', name: 'Дунд', photos: 500, days: 30, price: 39000 },
  { code: 'large', name: 'Том', photos: 2000, days: 30, price: 79000 },
];

export function normalizePackages(v: unknown): FreePackage[] {
  if (!Array.isArray(v)) return DEFAULT_FREE_PACKAGES;
  const list = v.map((p: Record<string, unknown>) => ({
    code: String(p.code ?? ''), name: String(p.name ?? p.code ?? ''),
    photos: Number(p.photos), days: Number(p.days), price: Number(p.price),
  })).filter(p => p.code && p.photos > 0 && p.days > 0 && p.price >= 0);
  return list.length ? list : DEFAULT_FREE_PACKAGES;
}

export async function loadFreePackages(): Promise<FreePackage[]> {
  const { data } = await publicDb.from('platform_settings').select('value').eq('key', 'free_packages').maybeSingle();
  return normalizePackages((data as { value?: unknown } | null)?.value);
}

export const fmtMNT = (n: number) => `₮${Math.round(n).toLocaleString('en-US')}`;
