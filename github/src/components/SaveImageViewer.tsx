import { Share2, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { inAppBrowserName, isIOS } from '../lib/browserEnv';

/** Зургийг томоор харуулж, утсанд хэрхэн хадгалахыг заана (апп доторх хөтөч, Android Downloads) */
export default function SaveImageViewer({ url, name, hint, onClose }: {
  url: string; name: string; hint: 'manual' | 'downloaded' | 'shared'; onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-white text-sm font-medium truncate pr-4">{name}</p>
        <button onClick={onClose} className="text-white/80 hover:text-white p-2"><X className="w-6 h-6" /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-2">
        <img src={url} alt={name} className="max-w-full max-h-full object-contain" style={{ WebkitTouchCallout: 'default' }} />
      </div>
      <div className="p-4 space-y-2 bg-stone-950/80">
        {hint === 'downloaded' ? (
          <p className="text-emerald-300 text-sm text-center">{t('Зураг татагдлаа. Утасны «Галерей» → «Downloads» хавтсаас харна уу.')}</p>
        ) : (
          <p className="text-amber-200 text-sm text-center font-medium">
            {isIOS
              ? t('Зурган дээр удаан дараад «Зургийг хадгалах / Save to Photos»-ыг сонгоно уу.')
              : t('Зурган дээр удаан дараад «Зураг татах / Download image»-ыг сонгоно уу.')}
          </p>
        )}
        {inAppBrowserName() && (
          <p className="text-stone-400 text-xs text-center">
            {t('Хадгалагдахгүй бол дээд талын ••• → «Chrome / Safari-д нээх»-ээр нээгээд дахин «Татах» дарна уу.')}
          </p>
        )}
        {typeof navigator !== 'undefined' && 'share' in navigator && !inAppBrowserName() && (
          <button onClick={async () => {
            try {
              const blob = await (await fetch(url)).blob();
              await navigator.share({ files: [new File([blob], /\.(jpe?g|png)$/i.test(name) ? name : name + '.jpg', { type: blob.type || 'image/jpeg' })] });
            } catch { /* цуцалсан */ }
          }}
            className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white text-sm py-2.5 rounded-xl">
            <Share2 className="w-4 h-4" /> {t('Хуваалцах / Галерейд хадгалах')}
          </button>
        )}
      </div>
    </div>
  );
}
