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

function isDisplayModeStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

/** Суулгасан цонх (standalone) эсвэл энэ сесс дээр дөнгөж суулгасан. */
export function isRunningAsApp(): boolean {
  return installedNow || isDisplayModeStandalone();
}

/** Хөтчийн таб дээр дөнгөж суулгасан — баталгааны мөрийг харуулахад. */
export function justInstalledInBrowser(): boolean {
  return installedNow && !isDisplayModeStandalone();
}

/** iPhone дээрх жинхэнэ Safari. Chrome (CriOS) болон апп доторх цонх биш. */
export function isIosSafari(): boolean {
  if (!isIOS || typeof navigator === 'undefined') return false;
  if (inAppBrowserName()) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(navigator.userAgent || '');
}

export function usePwaInstall() {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  const [installed, setInstalled] = useState(isRunningAsApp);
  const [justInstalled, setJustInstalled] = useState(justInstalledInBrowser);

  useEffect(() => {
    const sync = () => {
      setCanPrompt(canPromptInstall());
      setInstalled(isRunningAsApp());
      setJustInstalled(justInstalledInBrowser());
    };
    sync();
    const detach = onInstallState(sync);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', sync);
    return () => {
      detach();
      mq.removeEventListener('change', sync);
    };
  }, []);

  return {
    canPrompt,
    installed,
    justInstalled,
    platform: phonePlatform(),
    promptInstall,
  };
}
