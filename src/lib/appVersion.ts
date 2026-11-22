// Сайт шинэчлэгдсэн эсэхийг шалгана: удаан нээлттэй байсан таб (ж: админ, хэвлэх компьютер)
// хуучин кодоор ажиллаж, засвар/логогүй хэвлэх зэрэг алдаа гаргахаас сэргийлнэ.

const RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

function loadedMain(): string | null {
  if (typeof document === 'undefined') return null;
  for (const s of Array.from(document.scripts)) {
    const m = s.src.match(RE);
    if (m) return m[0];
  }
  return null;
}

const current = loadedMain();
let outdated = false;
const subs = new Set<(v: boolean) => void>();
let lastCheck = 0;

export function isOutdated(): boolean { return outdated; }

export function onOutdated(fn: (v: boolean) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export async function checkForUpdate(force = false): Promise<boolean> {
  if (!current || outdated) return outdated;
  if (!force && Date.now() - lastCheck < 60_000) return outdated;
  lastCheck = Date.now();
  try {
    const html = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.text() : ''));
    const m = html.match(RE);
    if (m && m[0] !== current) {
      outdated = true;
      subs.forEach(fn => fn(true));
      // Шинэ service worker-ийг идэвхжүүлэх
      navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => null);
    }
  } catch { /* офлайн */ }
  return outdated;
}

let started = false;
export function startVersionWatch() {
  if (started || typeof window === 'undefined') return;
  started = true;
  setTimeout(() => void checkForUpdate(true), 30_000);
  setInterval(() => void checkForUpdate(true), 5 * 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkForUpdate(); });
  window.addEventListener('focus', () => void checkForUpdate());
}

/** Хуучин хувилбар бол хэрэглэгчид мэдэгдээд хуудсыг дахин ачаална. true = үргэлжлүүлж болохгүй. */
export function reloadIfOutdated(what = 'Энэ үйлдэл'): boolean {
  if (!outdated) return false;
  window.alert(`Сайтын шинэ хувилбар гарсан байна. ${what}-ийг зөв хийхийн тулд хуудас дахин ачаалагдана — дараа нь дахин дарна уу.`);
  location.reload();
  return true;
}
