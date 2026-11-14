import { supabase } from './supabase';

/**
 * Цомгийн богино код — цомгийн ID-ийн эхний 6 тэмдэгт (жишээ: BDB02C).
 * Өөр хөтөч / утаснаас zuragchin.mn/c/BDB02C гэж бичээд цомог руугаа буцаж орно
 * (QR-аар камерын дотоод хөтчөөр орсон зочин Chrome-оор буцаж ороход localStorage хуваалцагддаггүй).
 */
export function albumCode(id: string): string {
  return (id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
}

/** Хэрэглэгчийн бичсэн кодыг цэвэрлэнэ: том/жижиг үсэг, O→0, I/L→1, хоосон зай, «zuragchin.mn/c/» хасна */
export function normalizeCode(input: string): string {
  return (input || '')
    .trim()
    .replace(/^.*\/c\//i, '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-F]/g, '')
    .slice(0, 6);
}

export interface CodeAlbum { id: string; name: string; link: string; event_date?: string | null }

/** Кодоор идэвхтэй цомог хайна (ID-ийн угтвараар) */
export async function findAlbumsByCode(raw: string): Promise<CodeAlbum[]> {
  const code = normalizeCode(raw).toLowerCase();
  if (code.length !== 6) return [];
  const { data, error } = await supabase
    .from('albums')
    .select('id, name, share_link, event_date')
    .eq('status', 'active')
    .gte('id', `${code}00-0000-0000-0000-000000000000`)
    .lte('id', `${code}ff-ffff-ffff-ffff-ffffffffffff`)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error || !data) return [];
  return data.map(a => ({
    id: a.id as string,
    name: (a.name as string) || 'Цомог',
    link: String(a.share_link || a.id).replace(/^\/?album\//, ''),
    event_date: (a.event_date as string) ?? null,
  }));
}

export function codeUrl(id: string): string {
  return `${window.location.origin}/c/${albumCode(id)}`;
}
