import { useEffect, useState } from 'react';
import { publicDb } from './supabase';

/** Сайтын холбоо барих мэдээлэл, сошиал хаяг — Админ → Платформ хэсгээс засна (platform_settings) */
export const CONTACT_FIELDS = [
  { key: 'contact_phone', label: 'Утас', placeholder: '+976 9900-0000' },
  { key: 'contact_email', label: 'Имэйл', placeholder: 'info@zuragchin.mn' },
  { key: 'contact_address', label: 'Хаяг', placeholder: 'Улаанбаатар, Монгол' },
  { key: 'social_facebook', label: 'Facebook хуудас', placeholder: 'https://facebook.com/zuragchin.mn' },
  { key: 'social_instagram', label: 'Instagram', placeholder: 'https://instagram.com/zuragchin.mn' },
  { key: 'social_tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@zuragchin.mn' },
  { key: 'social_youtube', label: 'YouTube', placeholder: 'https://youtube.com/@zuragchin' },
] as const;

export type ContactKey = typeof CONTACT_FIELDS[number]['key'];
export type SiteContact = Partial<Record<ContactKey, string>>;

let cache: SiteContact | null = null;

export async function loadSiteContact(): Promise<SiteContact> {
  if (cache) return cache;
  const { data } = await publicDb.from('platform_settings').select('key, value').in('key', CONTACT_FIELDS.map(f => f.key));
  const out: SiteContact = {};
  for (const r of (data ?? []) as { key: ContactKey; value: unknown }[]) {
    const v = typeof r.value === 'string' ? r.value.trim() : '';
    if (v) out[r.key] = v;
  }
  cache = out;
  return out;
}

export function useSiteContact(): SiteContact {
  const [c, setC] = useState<SiteContact>(cache ?? {});
  useEffect(() => { loadSiteContact().then(setC, () => { /* хоосон үлдээнэ */ }); }, []);
  return c;
}

/** «facebook.com/x» гэх мэтийг бүтэн https холбоос болгоно */
export function normalizeUrl(u: string): string {
  const s = u.trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
}
