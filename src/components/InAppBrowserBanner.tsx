import { useState } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { copyText, inAppBrowserName, isAndroid, isIOS, openInBrowserUrl, openInSafariUrl } from '../lib/browserEnv';

/** Messenger/Facebook доторх хөтчөөр орсон бол Chrome/Safari-д нээхийг санал болгоно. */
export default function InAppBrowserBanner({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const app = inAppBrowserName();
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem('zuragchin_iab_hide') === '1'; } catch { return false; }
  });
  const [copied, setCopied] = useState(false);
  if (!app || hidden) return null;

  const hide = () => { setHidden(true); try { sessionStorage.setItem('zuragchin_iab_hide', '1'); } catch { /* */ } };
  const name = app === 'App' ? t('апп') : app;

  return (
    <div className={`bg-sky-500/10 border border-sky-500/30 rounded-2xl p-4 ${compact ? '' : 'mb-5'} relative`}>
      <button onClick={hide} className="absolute top-2 right-2 text-sky-300/60 hover:text-sky-200 p-1" aria-label="close">
        <X className="w-4 h-4" />
      </button>
      <p className="text-sky-200 text-sm font-semibold pr-6">
        {t('Та {app} доторх хөтчөөр орсон байна', { app: name })}
      </p>
      <p className="text-sky-200/80 text-xs mt-1 leading-relaxed">
        {t('Зургаа утсандаа хадгалах, худалдан авалтаа дараа дахин харахад Chrome эсвэл Safari-аар нээх нь найдвартай.')}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        {isAndroid && (
          <a href={openInBrowserUrl()}
            className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-stone-950 font-semibold text-sm px-3 py-2 rounded-xl">
            <ExternalLink className="w-4 h-4" /> {t('Chrome-оор нээх')}
          </a>
        )}
        {isIOS && (
          <a href={openInSafariUrl()}
            className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-stone-950 font-semibold text-sm px-3 py-2 rounded-xl">
            <ExternalLink className="w-4 h-4" /> {t('Safari-аар нээх')}
          </a>
        )}
        <button onClick={async () => { if (await copyText(location.href)) { setCopied(true); setTimeout(() => setCopied(false), 2000); } }}
          className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-sm px-3 py-2 rounded-xl">
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          {copied ? t('Хуулагдлаа') : t('Холбоос хуулах')}
        </button>
      </div>
      {!isAndroid && (
        <p className="text-sky-200/70 text-xs mt-2">{t('Баруун дээд/доод буланд байгаа ••• товчийг дараад «Safari-д нээх / Open in browser»-ийг сонгоно уу.')}</p>
      )}
    </div>
  );
}
