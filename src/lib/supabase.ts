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
