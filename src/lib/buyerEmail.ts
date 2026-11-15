/**
 * Checkout болон сэргээлтийн имэйл.
 * supabase/functions/buyer-purchases/logic.ts normalizeEmail-тэй ижил дүрэм.
 */
export function normalizeEmail(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s.length < 6 || s.length > 254) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(s)) return null;
  return s;
}
