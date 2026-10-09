import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { isAndroid, openInBrowserUrl, openInSafariUrl, tryAutoOpenInBrowser } from '../lib/browserEnv';

/**
 * Messenger/Facebook доторх хөтчөөр нээгдсэн бол хуудсыг автоматаар Chrome (Android) / Safari (iPhone)-д нээнэ.
 * Шилжиж чадаагүй эсвэл хэрэглэгч энд үлдэхийг хүсвэл «Энд үргэлжлүүлэх» дарна.
 */
export default function AutoOpenInBrowser() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (tryAutoOpenInBrowser()) setShow(true);
  }, []);

  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-stone-950/95 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-4" />
        <p className="text-white font-semibold text-lg mb-2">
          {isAndroid ? t('Chrome-оор нээж байна…') : t('Safari-аар нээж байна…')}
        </p>
        <p className="text-stone-400 text-sm mb-6">
          {t('Шинэ цонхонд нээгдсэн бол энэ цонхыг хааж болно. Нээгдээгүй бол доорх товчийг дарна уу.')}
        </p>
        <a href={isAndroid ? openInBrowserUrl() : openInSafariUrl()}
          className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl mb-3">
          <ExternalLink className="w-5 h-5" /> {isAndroid ? t('Chrome-оор нээх') : t('Safari-аар нээх')}
        </a>
        <button onClick={() => setShow(false)} className="w-full text-stone-400 hover:text-white text-sm py-2">
          {t('Энд үргэлжлүүлэх')}
        </button>
      </div>
    </div>
  );
}
