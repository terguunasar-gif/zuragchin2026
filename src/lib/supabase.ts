import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'organizer' | 'photographer' | 'buyer' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole[];
  photographer_id: string | null;
  contact_info: Record<string, string>;
  avatar_url: string;
  created_at: string;
}

export function hasRole(profile: UserProfile | null, role: UserRole): boolean {
  return !!profile && profile.role.includes(role);
}

/**
 * Нэвтрэлтгүй (anon) клиент — нийтийн хуудсуудад (баримт, цомог) ашиглана.
 * Утсан дээр банкны апп-аас буцаж ирэхэд нэвтэрсэн хэрэглэгчийн session шинэчлэгдэх үед
 * үндсэн клиент түр «гацдаг» тул баримтын хуудас үүнээс хамаарахгүй байх ёстой.
 */
export const publicDb = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'zuragchin-public' },
});

/** Хүсэлт хэт удвал алдаа өгнө (хуудас эцэс төгсгөлгүй ачааллахаас сэргийлнэ) */
export function withTimeout<T>(p: PromiseLike<T>, ms = 12000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Сүлжээ удаан байна. Дахин оролдоно уу.')), ms);
    Promise.resolve(p).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
