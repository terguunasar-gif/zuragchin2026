import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { autoOpenAppName, copyText, iosMajorVersion, isAndroid, isIOS, openInBrowserUrl, openInChromeIosUrl, openInSafariUrl, tryAutoOpenInBrowser } from '../lib/browserEnv';

const HIDE_KEY = 'zuragchin_iab_hide';

/**
 * Messenger/Facebook/Instagram, Line, KakaoTalk, Google апп (Lens QR), Telegram, TikTok доторх хөтчөөс гаргана.
 * Android: нэг удаа Chrome intent. Үлдвэл дээд баннер «Хөтчөөр нээх».
 * iOS 17+: нэг удаа Safari (x-safari-https); iOS 16-: Chrome (googlechromes://). Үлдвэл товч + заавар + холбоос хуулах.
 * QPay-ийн буцах хуудас (/receipt, /offer) болон киоск/дэлгэцийг автоматаар сольдоггүй.
 */
export default function InAppBrowserBanner() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const app = typeof navigator !== 'undefined' ? autoOpenAppName(navigator.userAgent || '') : null;
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => { tryAutoOpenInBrowser(); }, [pathname]);

  const eventScreen = /^\/album\/[^/]+\/(?:kiosk|screen)\/?$/.test(pathname);
  if (!app || hidden || eventScreen) return null;

  const hide = () => {
    setHidden(true);
    try { sessionStorage.setItem(HIDE_KEY, '1'); } catch { /* */ }
  };
  const copy = async () => {
    if (await copyText(location.href)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div className="fixed top-0 inset-x-0 z-40 bg-amber-500 text-stone-950 shadow-lg">
        <div className="px-3 py-2.5 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {isAndroid ? (
              <a href={openInBrowserUrl()}
                className="flex w-full items-center justify-center gap-2 bg-stone-950 text-white font-extrabold text-base rounded-xl px-4 py-3">
                <ExternalLink className="w-5 h-5" /> {t('Хөтчөөр нээх')}
              </a>
            ) : (
              <>
                {iosMajorVersion(navigator.userAgent || '') >= 17 ? (
                  <a href={openInSafariUrl()}
                    className="mb-2 flex w-full items-center justify-center gap-2 bg-stone-950 text-white font-extrabold text-base rounded-xl px-4 py-3">
                    <ExternalLink className="w-5 h-5" /> {t('Safari-аар нээх')}
                  </a>
                ) : (
                  <a href={openInChromeIosUrl()}
                    className="mb-2 flex w-full items-center justify-center gap-2 bg-stone-950 text-white font-extrabold text-base rounded-xl px-4 py-3">
                    <ExternalLink className="w-5 h-5" /> {t('Chrome-оор нээх')}
                  </a>
                )}
                <p className="text-sm font-semibold leading-snug pr-6">
                  {t('Баруун дээд буланд ••• дараад ‘Браузерт нээх’ / ‘Open in Safari’ сонгоно уу')}
                </p>
                <button type="button" onClick={copy}
                  className="mt-2 inline-flex items-center gap-1.5 bg-stone-950 text-white font-semibold text-sm rounded-xl px-3 py-2">
                  {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  {copied ? t('Хуулагдлаа') : t('Холбоос хуулах')}
                </button>
              </>
            )}
          </div>
          <button type="button" onClick={hide} className="p-1 text-stone-950/70 hover:text-stone-950" aria-label={t('Хаах')}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className={isIOS || !isAndroid ? (isIOS ? 'h-44' : 'h-28') : 'h-[4.5rem]'} aria-hidden />
    </>
  );
}
