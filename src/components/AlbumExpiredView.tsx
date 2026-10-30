import { useEffect, useState } from 'react';
import { Clock, Lock, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { LanguageSwitcher } from './LanguagePicker';
import ExtendAlbumForm from './ExtendAlbumForm';

export const EXTEND_PRICE_DEFAULT = 10000;
export const EXTEND_DAYS_DEFAULT = 30;
export const PURGE_AFTER_DEFAULT = 60;

async function settingNum(key: string, fallback: number) {
  const { data } = await supabase.from('platform_settings').select('value').eq('key', key).maybeSingle();
  const v = Number((data as { value?: unknown } | null)?.value);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Хугацаа нь дууссан цомгийн линк дээр харагдана: сунгах төлбөрийг QPay-ээр авна. */
export default function AlbumExpiredView({ albumId, albumName, expiresAt, purged, onExtended }: {
  albumId: string;
  albumName: string;
  expiresAt: string;
  purged: boolean;
  onExtended: () => void;
}) {
  const { t, lang, locale } = useI18n();
  const [purgeDays, setPurgeDays] = useState(PURGE_AFTER_DEFAULT);

  useEffect(() => {
    settingNum('album_purge_after_days', PURGE_AFTER_DEFAULT).then(setPurgeDays);
  }, []);

  const closed = new Date(expiresAt);
  const purgeDate = new Date(closed.getTime() + purgeDays * 86400000);
  const fmt = (d: Date) => lang === 'mn'
    ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
    : d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col">
      <div className="flex justify-end p-4"><LanguageSwitcher /></div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-stone-900 border border-white/10 rounded-2xl p-6 text-center">
          <div className="w-14 h-14 bg-amber-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
            {purged ? <Trash2 className="w-7 h-7 text-stone-400" /> : <Lock className="w-7 h-7 text-amber-400" />}
          </div>
          <p className="text-stone-400 text-sm mb-1">{albumName}</p>
          <h1 className="text-white text-xl font-bold mb-2">
            {purged ? t('Цомгийн зургууд устгагдсан') : t('Цомгийн хугацаа дууссан')}
          </h1>

          {purged ? (
            <p className="text-stone-400 text-sm">{t('Хугацаа дууссанаас хойш {n} хоногт сунгаагүй тул зургууд устгагдсан.', { n: purgeDays })}</p>
          ) : (
            <>
              <p className="text-stone-400 text-sm mb-4">{t('Хаагдсан огноо: {date}', { date: fmt(closed) })}</p>
              <p className="text-stone-500 text-xs mb-4 flex items-start gap-1.5 text-left">
                <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {t('Сунгахгүй бол {date}-нд зургууд бүрмөсөн устна. Аль хэдийн худалдаж авсан зургийн баримт тэр хүртэл хүчинтэй.', { date: fmt(purgeDate) })}
              </p>
              <ExtendAlbumForm albumId={albumId} onExtended={onExtended} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
