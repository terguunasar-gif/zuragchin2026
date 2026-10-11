import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { publicDb } from '../lib/supabase';
import { useI18n } from '../lib/i18n';

/** Төлсний дараа зургаа татаж авах хугацаа (platform_settings.purchase_download_days) */
export const DOWNLOAD_DAYS_DEFAULT = 14;

export function useDownloadDays(): number {
  const [days, setDays] = useState(DOWNLOAD_DAYS_DEFAULT);
  useEffect(() => {
    publicDb.from('platform_settings').select('value').eq('key', 'purchase_download_days').maybeSingle()
      .then(({ data }) => {
        const v = Number((data as { value?: unknown } | null)?.value);
        if (Number.isFinite(v) && v > 0) setDays(v);
      }, () => { /* анхдагч утга */ });
  }, []);
  return days;
}

/**
 * Төлбөрийн өмнөх анхааруулга ба «Хувийн хэрэглээний лиценз»-ийн зөвшөөрөл.
 * Зочин тэмдэглэхгүй бол төлбөр рүү шилжихгүй.
 */
export default function LicenseConsent({ checked, onChange, error }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const days = useDownloadDays();
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-amber-100 text-xs leading-relaxed">
          {t('Та зургаа төлбөр хийснээс хойш {n} хоногийн дотор татаж авна. Үүний дараа файл устгагдана.', { n: days })}
        </p>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-stone-400 leading-relaxed">
        <p className="flex items-center gap-1.5 text-stone-200 font-semibold mb-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> {t('Хувийн хэрэглээний лиценз')}
        </p>
        <p>{t('Хувьдаа хадгалах, хэвлүүлэх, сошиал хуудсандаа нийтлэхийг зөвшөөрнө.')}</p>
        <p>{t('Зургийг дахин худалдах, арилжааны зорилгоор ашиглах, бусдад файлаар түгээхийг хориглоно.')}</p>
        <p className="mt-1.5 text-stone-500">{t('Файл бүрт таны захиалгын дугаар нуугдмал байдлаар суулгагдана.')}</p>
      </div>
      <label className={`flex items-start gap-2.5 cursor-pointer rounded-xl p-2 -mx-2 ${error ? 'bg-red-500/10' : ''}`}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 mt-0.5 accent-amber-500 flex-shrink-0" />
        <span className="text-stone-200 text-sm">
          {t('Ойлголоо. {n} хоногийн дотор татаж авна, дахин зарахгүй.', { n: days })}
        </span>
      </label>
      {error && <p className="text-red-400 text-xs -mt-1">{error}</p>}
    </div>
  );
}
