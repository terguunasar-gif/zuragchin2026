// Мессенжер, Facebook, Instagram гэх мэт апп доторх хөтчийг таних,
// бодит хөтөч (Chrome/Safari) рүү шилжүүлэх, зургийг утсанд хадгалах туслахууд.

const UA = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';

export const isAndroid = /Android/i.test(UA);
export const isIOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && typeof document !== 'undefined' && 'ontouchend' in document);

/** Апп доторх хөтөч (Messenger, Facebook, Instagram, Line, KakaoTalk, TikTok, Telegram, Android WebView) */
export function inAppBrowserName(): string | null {
  if (/FB_IAB|FBAN|FBAV|FB4A|FBIOS/i.test(UA)) return /Messenger|Orca/i.test(UA) ? 'Messenger' : 'Facebook';
  if (/Messenger/i.test(UA)) return 'Messenger';
  if (/Instagram/i.test(UA)) return 'Instagram';
  if (/Line\//i.test(UA)) return 'Line';
  if (/KAKAOTALK/i.test(UA)) return 'KakaoTalk';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(UA)) return 'TikTok';
  if (/Telegram/i.test(UA)) return 'Telegram';
  if (isAndroid && /; wv\)/.test(UA)) return 'App';
  return null;
}

/** Android: одоогийн хуудсыг Chrome (эсвэл үндсэн хөтөч)-д нээх intent холбоос */
export function openInBrowserUrl(href = typeof location !== 'undefined' ? location.href : ''): string {
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* хуучин хөтөч */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

export type SaveResult = 'shared' | 'downloaded' | 'manual';

/**
 * Зургийг утсанд хадгална:
 *  - iPhone/Android-ийн хөтөч хуваалцах цонхыг дэмжвэл → «Зураг хадгалах / Галерейд хадгалах»
 *  - эс бөгөөс файлаар татна (Android: Downloads → Галерейд харагдана)
 *  - апп доторх хөтөч бол 'manual' — зургийг томоор харуулж «удаан дарж хадгалах» заавар өгнө
 */
export async function saveImageToDevice(url: string, filename: string): Promise<{ result: SaveResult; blobUrl?: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Зураг татаж чадсангүй');
  const blob = await res.blob();
  const name = /\.(jpe?g|png|webp)$/i.test(filename) ? filename : `${filename}.jpg`;
  const blobUrl = URL.createObjectURL(blob);

  if (inAppBrowserName()) return { result: 'manual', blobUrl };

  try {
    const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (isIOS && nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return { result: 'shared', blobUrl };
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { result: 'shared', blobUrl };
  }

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { result: 'downloaded', blobUrl };
}

/** iPhone (iOS 17+): апп доторх хөтчөөс Safari-г нээх холбоос */
export function openInSafariUrl(href = typeof location !== 'undefined' ? location.href : ''): string {
  return href.replace(/^https:\/\//, 'x-safari-https://').replace(/^http:\/\//, 'x-safari-http://');
}

const AUTO_KEY = 'zuragchin_iab_auto';

/**
 * Апп доторх хөтчөөр орсон бол нэг удаа автоматаар Chrome / Safari руу шилжүүлэхийг оролдоно.
 * Шилжиж чадвал true буцаана (оролдлого хийсэн). ?stay=1 параметртэй бол оролдохгүй.
 */
export function tryAutoOpenInBrowser(): boolean {
  if (typeof window === 'undefined' || !inAppBrowserName()) return false;
  if (new URLSearchParams(location.search).get('stay') === '1') return false;
  try {
    if (sessionStorage.getItem(AUTO_KEY) === location.pathname) return false;
    sessionStorage.setItem(AUTO_KEY, location.pathname);
  } catch { /* хувийн горим */ }
  if (isAndroid) { location.href = openInBrowserUrl(); return true; }
  if (isIOS) { location.href = openInSafariUrl(); return true; }
  return false;
}
