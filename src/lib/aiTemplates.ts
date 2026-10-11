import { publicDb } from './supabase';

/** AI бүүтийн нийтэд харагдах загвар (идэвхтэй темплет) */
export interface AiTemplatePublic {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  preview_url: string;
  aspect_ratio: string;
  max_people: number;
}

export const AI_CATEGORY_LABELS: Record<string, string> = {
  winter: 'Шинэ жил, өвөл',
  party: 'Үдэшлэг',
  mongolian: 'Монгол соёл',
  fun: 'Хөгжилтэй',
  general: 'Бусад',
};

export const AI_CATEGORY_GRADIENT: Record<string, string> = {
  winter: 'from-sky-900 via-indigo-900 to-stone-900',
  party: 'from-amber-700 via-rose-900 to-stone-900',
  mongolian: 'from-red-800 via-amber-800 to-stone-900',
  fun: 'from-fuchsia-800 via-violet-900 to-stone-900',
};

/** Нэг AI зургийн үнэ (бүүт дээр) */
export const AI_BOOTH_PRICE = 5000;

export async function fetchAiTemplates(): Promise<AiTemplatePublic[]> {
  const { data, error } = await publicDb
    .from('ai_templates')
    .select('id, slug, name, description, category, preview_url, aspect_ratio, max_people')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as AiTemplatePublic[];
}
