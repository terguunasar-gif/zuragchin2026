import { supabase } from './supabase';

/**
 * Автомат принт асаалттай цомгууд — админ «Цомог» табаас цомог бүрээр асааж/унтраана.
 * platform_settings.auto_print_albums = ["<album id>", …] (уншихад нээлттэй, бичихэд зөвхөн админ).
 * Хэвлэдэг компьютер дээрх «Автомат принт» зөвхөн эдгээр цомгийн угаах захиалгыг өөрөө хэвлэнэ.
 */
const KEY = 'auto_print_albums';

export async function readAutoPrintAlbums(): Promise<Set<string>> {
  const { data, error } = await supabase.from('platform_settings').select('value').eq('key', KEY).maybeSingle();
  if (error) throw error;
  const v = (data as { value?: unknown } | null)?.value;
  return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
}

export async function saveAutoPrintAlbums(ids: Set<string>): Promise<void> {
  const { error } = await supabase.from('platform_settings')
    .upsert({ key: KEY, value: [...ids], updated_at: new Date().toISOString() });
  if (error) throw error;
}
