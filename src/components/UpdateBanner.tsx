import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { isOutdated, onOutdated, startVersionWatch } from '../lib/appVersion';
import { useI18n } from '../lib/i18n';

/** Сайт шинэчлэгдсэн үед доод талд «Шинэчлэх» товч */
export default function UpdateBanner() {
  const { t } = useI18n();
  const [show, setShow] = useState(isOutdated());
  useEffect(() => { startVersionWatch(); return onOutdated(setShow); }, []);
  if (!show) return null;
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] max-w-[calc(100vw-1.5rem)]">
      <button type="button" onClick={() => location.reload()}
        className="flex items-center gap-2 bg-amber-500 text-stone-950 font-bold text-sm rounded-full px-4 py-2.5 shadow-xl">
        <RefreshCw className="w-4 h-4" /> {t('Сайт шинэчлэгдлээ — дахин ачаалах')}
      </button>
    </div>
  );
}
