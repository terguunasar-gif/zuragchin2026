import { useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { GuestInfo, GuestPackage, guestPhotoInfo, loadGuestPackages, setGuestUpload } from '../lib/guestPhotos';
import QpayPayModal from './QpayPayModal';

/**
 * Цомгийн эзэнд: «Зочдын зураг» багц авах, оруулалтыг асаах/унтраах.
 * Зочдын зураг зарагдахгүй — хүн бүр үнэгүй татна. Багцын төлбөр нь зөвхөн хадгалах зардал.
 */
export default function GuestPhotosPanel({ albumId, onChange, compact = false }: {
  albumId: string; onChange?: (info: GuestInfo) => void; compact?: boolean;
}) {
  const [info, setInfo] = useState<GuestInfo | null>(null);
  const [packages, setPackages] = useState<GuestPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<GuestPackage | null>(null);
  const [error, setError] = useState('');

  async function reload() {
    const [i, p] = await Promise.all([guestPhotoInfo(albumId), loadGuestPackages()]);
    setInfo(i); setPackages(p); setLoading(false);
    if (i) onChange?.(i);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [albumId]);

  async function toggle() {
    if (!info) return;
    setBusy(true); setError('');
    try {
      await setGuestUpload(albumId, !info.enabled);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  if (loading) return <div className="mt-4 flex justify-center"><Loader2 className="w-5 h-5 text-stone-500 animate-spin" /></div>;
  if (!info || !info.can_manage) return null; // SQL ажиллаагүй эсвэл эзэн биш

  const hasPackage = info.photo_limit > 0;
  const remaining = Math.max(0, info.photo_limit - info.used);

  return (
    <div className={`${compact ? '' : 'mt-4'} border border-white/10 rounded-xl p-4 text-left`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0"><Users className="w-4 h-4 text-emerald-400" /></div>
          <div>
            <p className="text-white font-semibold text-sm">Зочдын зураг</p>
            <p className="text-stone-400 text-xs mt-0.5 leading-relaxed">
              {hasPackage
                ? <>Зочид утсаараа авсан зургаа цомогт хуваалцана. <b className="text-stone-200">{info.used.toLocaleString()} / {info.photo_limit.toLocaleString()}</b> · үлдсэн {remaining.toLocaleString()}</>
                : <>Хамт олны гишүүд утсаараа авсан зургаа цомогт оруулж, бусадтайгаа <b className="text-stone-200">үнэгүй</b> хуваалцана. Зочдын зураг зарагдахгүй.</>}
            </p>
          </div>
        </div>
        {hasPackage && (
          <button onClick={toggle} disabled={busy} role="switch" aria-checked={info.enabled} aria-label="Зочдын зураг оруулалт"
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${info.enabled ? 'bg-emerald-500' : 'bg-white/15'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${info.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        )}
      </div>

      {hasPackage && !info.enabled && <p className="text-stone-500 text-xs mt-2">Оруулалт түр зогссон. Одоо байгаа зургууд харагдсаар байна.</p>}

      <p className="text-stone-500 text-[11px] mt-3 mb-1.5">{hasPackage ? 'Хязгаар нэмэх:' : 'Багц сонгоно уу (нэг удаа төлнө):'}</p>
      <div className="grid grid-cols-3 gap-2">
        {packages.map(p => (
          <button key={p.code} onClick={() => setPaying(p)}
            className="flex flex-col items-center gap-0.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/40 rounded-lg py-2 px-1 transition-colors">
            <span className="text-white text-sm font-semibold">{p.photos.toLocaleString()}</span>
            <span className="text-stone-500 text-[10px]">зураг</span>
            <span className="text-amber-300 text-xs font-semibold">₮{p.price.toLocaleString()}</span>
          </button>
        ))}
      </div>
      <p className="text-stone-500 text-[11px] mt-2 leading-relaxed">
        Нийт хязгаарыг бүх зочид хамтдаа ашиглана. Багц нэмэх тусам хязгаар нэмэгдэнэ.
      </p>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

      {paying && (
        <QpayPayModal
          title={`Зочдын зураг · ${paying.photos.toLocaleString()} зураг`}
          amount={paying.price}
          invoicePath="/guest-invoice"
          checkPath="/check-guest/"
          payload={{ albumId, packageCode: paying.code }}
          paidText="Төлбөр амжилттай! Зочид зургаа оруулж эхэлж болно."
          onClose={() => setPaying(null)}
          onPaid={() => { setPaying(null); reload(); }}
        />
      )}
    </div>
  );
}
