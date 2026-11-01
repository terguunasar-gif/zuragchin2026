import { useEffect, useState } from 'react';
import { inAppBrowserName, isAndroid, isIOS } from './browserEnv';

/**
 * beforeinstallprompt-ийг апп ачаалагдахад нь барьж авна.
 * Нүүр хуудас lazy ачаалагдсан ч цонхыг алдахгүй.
 * Chrome энэ үйлдлийг нэг удаа л prompt() дуудахад ашиглана.
 */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';
export type PhonePlatform = 'android' | 'ios' | 'other';

type Listener = () => void;

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
/** getInstalledRelatedApps-ийн хариу. Хоосон жагсаалт нь устгасны дараа дахин харуулна. */
let relatedInstall: 'unknown' | 'installed' | 'absent' = 'unknown';
let relatedChecked = false;
/** Суулгасны дараа хөтчийн жагсаалт түр хоцорч болно. Энэ хугацаанд хоосон хариуг устгалаа гэж үзэхгүй. */
let installedAt = 0;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(listener => listener());
}

function isInstallPrompt(event: Event): event is InstallPromptEvent {
  return typeof (event as InstallPromptEvent).prompt === 'function';
}

function bindInstallListeners() {
  if (typeof window === 'undefined') return;
  const host = window as Window & { __zuragchinInstallBound?: boolean };
  if (host.__zuragchinInstallBound) return;
  host.__zuragchinInstallBound = true;

  window.addEventListener('beforeinstallprompt', event => {
    if (!isInstallPrompt(event)) return;
    event.preventDefault();
    deferred = event;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    relatedInstall = 'installed';
    installedAt = Date.now();
    emit();
  });
}

bindInstallListeners();

export function onInstallState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canPromptInstall(): boolean {
  return deferred != null;
}

/** Хэрэглэгчийн товшилт дотор дуудна. Өмнө нь await хийхгүй. */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') {
      installedNow = true;
      relatedInstall = 'installed';
      installedAt = Date.now();
      emit();
      return 'accepted';
    }
    return 'dismissed';
  } catch {
    return 'unavailable';
  }
}

export function phonePlatform(): PhonePlatform {
  if (isAndroid) return 'android';
  if (isIOS) return 'ios';
  return 'other';
}

/** Суулгасан апп өөрийн цонхоороо нээгдсэн үе. Энгийн таб биш. */
export function isDisplayModeStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches;
}

type RelatedAppsNavigator = Navigator & {
  getInstalledRelatedApps?: () => Promise<Array<{ platform?: string }>>;
};

function hasRelatedAppsApi(): boolean {
  return typeof navigator !== 'undefined'
    && typeof (navigator as RelatedAppsNavigator).getInstalledRelatedApps === 'function';
}

/**
 * Chrome/Edge: манифестын related_applications-аар энэ PWA суусан эсэхийг асууна.
 * Устгасан бол жагсаалт хоосон болж, карт дахин гарна. localStorage ашиглахгүй.
 */
export async function refreshRelatedInstall(): Promise<void> {
  const nav = navigator as RelatedAppsNavigator;
  if (typeof nav.getInstalledRelatedApps !== 'function') {
    relatedChecked = true;
    relatedInstall = 'unknown';
    emit();
    return;
  }
  try {
    const apps = await nav.getInstalledRelatedApps();
    const installed = Array.isArray(apps) && apps.length > 0;
    if (installed) {
      relatedInstall = 'installed';
      installedNow = true;
    } else if (installedNow && Date.now() - installedAt < 4000) {
      relatedInstall = 'installed';
    } else {
      relatedInstall = 'absent';
      if (!isDisplayModeStandalone()) installedNow = false;
    }
  } catch {
    relatedInstall = 'unknown';
  }
  relatedChecked = true;
  emit();
}

/**
 * Карт харагдах эсэх.
 * Суулгасан цонх, эсвэл хөтөч «аль хэдийн суусан» гэж хэлбэл нууна.
 * beforeinstallprompt ирвэл суугаагүй тул харуулна. iOS дээр зөвхөн standalone-аар танина.
 */
export function shouldShowInstall(): boolean {
  if (isDisplayModeStandalone()) return false;
  // Суусан гэж батлагдвал суулгах цонх ирсэн ч картыг харуулахгүй.
  if (relatedInstall === 'installed') return false;
  if (installedNow && relatedInstall !== 'absent') return false;
  if (canPromptInstall()) return true;
  if (relatedInstall === 'absent') return true;
  if (hasRelatedAppsApi() && !relatedChecked) return false;
  return true;
}

/** iPhone дээрх жинхэнэ Safari. Chrome (CriOS) болон апп доторх цонх биш. */
export function isIosSafari(): boolean {
  if (!isIOS || typeof navigator === 'undefined') return false;
  if (inAppBrowserName()) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(navigator.userAgent || '');
}

export function usePwaInstall() {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  const [showInstall, setShowInstall] = useState(shouldShowInstall);

  useEffect(() => {
    const sync = () => {
      setCanPrompt(canPromptInstall());
      setShowInstall(shouldShowInstall());
    };
    sync();
    const detach = onInstallState(sync);
    void refreshRelatedInstall();
    const onReturn = () => {
      if (document.visibilityState === 'hidden') return;
      void refreshRelatedInstall();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    const queries = ['standalone', 'minimal-ui', 'window-controls-overlay'].map(mode => {
      const mq = window.matchMedia(`(display-mode: ${mode})`);
      mq.addEventListener('change', sync);
      return mq;
    });
    return () => {
      detach();
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('pageshow', onReturn);
      queries.forEach(mq => mq.removeEventListener('change', sync));
    };
  }, []);

  return {
    canPrompt,
    showInstall,
    platform: phonePlatform(),
    promptInstall,
  };
}
