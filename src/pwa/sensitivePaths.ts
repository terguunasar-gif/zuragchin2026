/**
 * Document paths the service worker must never store or answer.
 * Payment, sign-in, and dashboard pages stay on the network so a cached
 * shell cannot replay a receipt, offer, booth, or session screen.
 */
const SENSITIVE_PATH = /^\/(?:dashboard|auth|receipt|offer|booth)(?:\/|$)/;

export function isSensitivePath(pathname: string): boolean {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return SENSITIVE_PATH.test(trimmed);
}

/** Precache URLs are root-relative and may omit the leading slash. */
export function isSensitivePrecacheUrl(url: string): boolean {
  const path = url.split('?')[0].split('#')[0];
  return isSensitivePath(path.startsWith('/') ? path : `/${path}`);
}
