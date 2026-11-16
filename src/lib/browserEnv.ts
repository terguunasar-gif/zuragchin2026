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
  // Google апп (Lens-ээр QR уншуулахад нээгддэг)
  if (/GSA\//.test(UA)) return 'Google';
  if (isAndroid && /; wv\)/.test(UA)) return 'App';
  // iPhone: банкны апп, QR уншигч зэрэг аппын доторх хөтөч (WKWebView) — «Safari/» тэмдэггүй.
  // Нүүр дэлгэцэд суулгасан сайт (standalone) болон Chrome/Firefox/Edge iOS-ийг хасна.
  if (isIOS && !/Safari\//.test(UA) && !/CriOS|FxiOS|EdgiOS/.test(UA)
      && !(typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone)
      && !(typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches)) return 'App';
  return null;
}

/** Facebook / Messenger / Instagram, мөн Line, KakaoTalk. Банкны WebView энд орохгүй. */
export function socialInAppName(ua: string): string | null {
  if (/FB_IAB|FBAN|FBAV|FB4A|FBIOS/i.test(ua)) return /Messenger|Orca/i.test(ua) ? 'Messenger' : 'Facebook';
  if (/Messenger/i.test(ua)) return 'Messenger';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/Line\//i.test(ua)) return 'Line';
  if (/KAKAOTALK/i.test(ua)) return 'KakaoTalk';
  return null;
}

/**
 * Android Chrome руу гаргах intent.
 * intent://хост+зам+query#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=<анхны хаяг>;end
 */
export function chromeIntentUrl(href: string): string {
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

/** QPay-ийн буцах хуудас, киоск, дэлгэцийн горимыг автоматаар бүү соль. */
export function shouldAutoOpenChrome(opts: { ua: string; pathname: string; search: string; alreadyTried: boolean }): boolean {
  if (opts.alreadyTried) return false;
  if (new URLSearchParams(opts.search).get('stay') === '1') return false;
  if (!/Android/i.test(opts.ua)) return false;
  if (!socialInAppName(opts.ua)) return false;
  // Баримт, санал, бүүт, «Миний худалдан авалт» дээр QPay-ээс буцаж ирсэн төлбөрийг энэ хөтөч дээр нь шалгана.
  if (/^\/(?:receipt|offer|booth|my-purchases)(?:\/|$)/.test(opts.pathname)) return false;
  if (/^\/album\/[^/]+\/(?:kiosk|screen)\/?$/.test(opts.pathname)) return false;
  return true;
}

/** Android: одоогийн хуудсыг Chrome-д нээх intent холбоос */
export function openInBrowserUrl(href = typeof location !== 'undefined' ? location.href : ''): string {
  return chromeIntentUrl(href);
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* хуучин хөтөч */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

export type SaveResult = 'shared' | 'downloaded' | 'manual' | 'cancelled';

/** Хөтөч галерей рүү чимээгүй бичиж чадахгүй. Файлаар хуваалцах боломжтой бол нэг цонхоор хадгална. */
export function canShareFiles(files: File[]): boolean {
  if (!files.length || typeof navigator === 'undefined' || !('share' in navigator)) return false;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try { return !!nav.canShare?.({ files }); } catch { return false; }
}

/**
 * Утасны «Save Image / Хадгалах» цонх. Олон зургийг нэг хуваалцалтаар.
 * Дэмжихгүй бол файл таталт руу буцна. Цуцалсан бол татсан гэж тэмдэглэхгүй.
 */
export async function saveFilesToGallery(files: File[]): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (!files.length) return 'downloaded';
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  for (const file of files) {
    const href = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = href;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
    await new Promise(r => setTimeout(r, 350));
  }
  return 'downloaded';
}

/**
 * Зургийг утсанд хадгална:
 *  - iPhone/Android-ийн хөтөч хуваалцах цонхыг дэмжвэл → «Зураг хадгалах / Галерейд хадгалах»
 *  - эс бөгөөс файлаар татна (Android: Downloads → Галерейд харагдана)
 *  - апп доторх хөтөч бол 'manual' — зургийг томоор харуулж «удаан дарж хадгалах» заавар өгнө
 */
export async function saveImageToDevice(
  url: string, filename: string, transform?: (blob: Blob) => Promise<Blob>,
): Promise<{ result: SaveResult; blobUrl?: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Зураг татаж чадсангүй');
  let blob = await res.blob();
  if (transform) blob = await transform(blob);
  const name = /\.(jpe?g|png|webp)$/i.test(filename) ? filename : `${filename}.jpg`;
  const blobUrl = URL.createObjectURL(blob);

  if (inAppBrowserName()) return { result: 'manual', blobUrl };

  try {
    const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return { result: 'shared', blobUrl };
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { result: 'cancelled', blobUrl };
  }

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { result: 'downloaded', blobUrl };
}

/**
 * Видеог (MP4) утас / компьютерт хадгална.
 *  - iPhone: хуваалцах цонх → «Save Video / Видео хадгалах» → Photos
 *  - Android, компьютер: .mp4 файлаар татна
 *  - Messenger/Facebook доторх хөтөч эсвэл татаж чадаагүй үед: видеог шинэ табд нээнэ (⋮ → Татах / удаан дарж хадгалах)
 * Анхаар: saveImageToDevice-ийг видеонд бүү ашигла — файлын нэрийг .jpg болгож эвдэрдэг байсан.
 */
export async function saveVideoToDevice(url: string, filename: string): Promise<SaveResult> {
  const name = /\.mp4$/i.test(filename) ? filename : `${filename}.mp4`;
  if (inAppBrowserName()) {
    window.open(url, '_blank');
    return 'manual';
  }
  let blob: Blob;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    blob = await res.blob();
  } catch {
    // CORS / сүлжээний алдаа — видеог шууд нээж хэрэглэгч өөрөө хадгална
    window.open(url, '_blank');
    return 'manual';
  }
  const file = new File([blob], name, { type: 'video/mp4' });

  if (isIOS) {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return 'shared';
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }

  const blobUrl = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  return 'downloaded';
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
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  let already = false;
  try { already = !!sessionStorage.getItem(AUTO_KEY); } catch { /* хувийн горим */ }
  if (!shouldAutoOpenChrome({ ua, pathname: location.pathname, search: location.search, alreadyTried: already })) return false;
  try { sessionStorage.setItem(AUTO_KEY, '1'); } catch { /* хувийн горим */ }
  location.href = openInBrowserUrl();
  return true;
}
