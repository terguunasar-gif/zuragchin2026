import { publicDb } from './supabase';

/** Цомгийн хугацаа сунгах сонголт — platform_settings.album_extend_options (супер админ засна) */
export interface ExtendOption { days: number; price: number }

export const DEFAULT_EXTEND_OPTIONS: ExtendOption[] = [
  { days: 30, price: 10000 },
  { days: 60, price: 18000 },
];

export function normalizeExtendOptions(v: unknown): ExtendOption[] {
  if (!Array.isArray(v)) return DEFAULT_EXTEND_OPTIONS;
  const list = v.map((o: Record<string, unknown>) => ({ days: Math.round(Number(o?.days)), price: Math.round(Number(o?.price)) }))
    .filter(o => o.days > 0 && o.price > 0)
    .sort((a, b) => a.days - b.days);
  return list.length ? list : DEFAULT_EXTEND_OPTIONS;
}

export async function loadExtendOptions(): Promise<ExtendOption[]> {
  const { data } = await publicDb.from('platform_settings').select('value').eq('key', 'album_extend_options').maybeSingle();
  return normalizeExtendOptions((data as { value?: unknown } | null)?.value);
}
