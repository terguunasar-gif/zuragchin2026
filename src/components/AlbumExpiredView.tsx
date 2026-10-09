import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Lock, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { LanguageSwitcher } from './LanguagePicker';
import BankLinks, { BankLink } from './BankLinks';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY };

export const EXTEND_PRICE_DEFAULT = 10000;
export const EXTEND_DAYS_DEFAULT = 30;
export const PURGE_AFTER_DEFAULT = 60;

interface Invoice { invoiceId: string; qrImage: string; urls: BankLink[]; amount: number; days: number }

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
  const [price, setPrice] = useState(EXTEND_PRICE_DEFAULT);
  const [days, setDays] = useState(EXTEND_DAYS_DEFAULT);
  const [purgeDays, setPurgeDays] = useState(PURGE_AFTER_DEFAULT);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    settingNum('album_extend_price', EXTEND_PRICE_DEFAULT).then(setPrice);
    settingNum('album_extend_days', EXTEND_DAYS_DEFAULT).then(setDays);
    settingNum('album_purge_after_days', PURGE_AFTER_DEFAULT).then(setPurgeDays);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, []);

  const closed = new Date(expiresAt);
  const purgeDate = new Date(closed.getTime() + purgeDays * 86400000);
  const fmt = (d: Date) => lang === 'mn'
    ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
    : d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });

  async function createInvoice() {
    setError('');
    if (!name.trim() || !/^\d{8,}$/.test(phone.trim())) { setError(t('Нэр, утасны дугаараа зөв оруулна уу')); return; }
    setBusy(true);
    try {
      const res = await fetch(`${QPAY_FN_URL}/extend-invoice`, {
        method: 'POST', headers, body: JSON.stringify({ albumId, buyerName: name.trim(), buyerPhone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.invoiceId) throw new Error(data.error || 'QPay');
      setInvoice(data);
      timer.current = window.setInterval(async () => {
        try {
          const r = await fetch(`${QPAY_FN_URL}/check-extension/${data.invoiceId}`, { headers });
          const c = await r.json();
          if (c.isPaid) {
            if (timer.current) window.clearInterval(timer.current);
            setDone(true);
            setTimeout(onExtended, 1500);
          }
        } catch { /* дахин оролдоно */ }
      }, 3000);
    } catch (e) {
      setError(t('Алдаа гарлаа:') + ' ' + (e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  }

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
          ) : done ? (
            <div className="py-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <p className="text-white font-semibold">{t('Цомог дахин нээгдлээ!')}</p>
            </div>
          ) : invoice ? (
            <>
              <p className="text-stone-300 text-sm mb-4">{t('QPay-ээр ₮{amount} төлнө үү', { amount: invoice.amount.toLocaleString('en-US') })}</p>
              <img src={`data:image/png;base64,${invoice.qrImage}`} alt="QPay QR" className="w-52 h-52 mx-auto bg-white rounded-xl p-2 mb-4" />
              <div className="mb-4"><BankLinks urls={invoice.urls} /></div>
              <p className="text-stone-500 text-xs flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('Төлбөр хүлээж байна…')}
              </p>
            </>
          ) : (
            <>
              <p className="text-stone-400 text-sm mb-1">{t('Хаагдсан огноо: {date}', { date: fmt(closed) })}</p>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 my-4">
                <p className="text-amber-300 text-2xl font-bold">₮{price.toLocaleString('en-US')}</p>
                <p className="text-stone-300 text-sm">{t('төлөөд цомог {n} хоног дахин нээгдэнэ', { n: days })}</p>
              </div>
              <p className="text-stone-500 text-xs mb-4 flex items-start gap-1.5 text-left">
                <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {t('Сунгахгүй бол {date}-нд зургууд бүрмөсөн устна. Аль хэдийн худалдаж авсан зургийн баримт тэр хүртэл хүчинтэй.', { date: fmt(purgeDate) })}
              </p>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={t('Нэр')}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-2 outline-none focus:border-amber-500" />
              <input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder={t('Утасны дугаар')} inputMode="numeric"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-3 outline-none focus:border-amber-500" />
              {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
              <button onClick={createInvoice} disabled={busy}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t('Цомог сунгах')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
