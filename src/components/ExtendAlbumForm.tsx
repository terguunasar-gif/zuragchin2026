import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { DEFAULT_EXTEND_OPTIONS, ExtendOption, loadExtendOptions } from '../lib/albumExtend';
import BankLinks, { BankLink } from './BankLinks';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY };

interface Invoice { invoiceId: string; qrImage: string; urls: BankLink[]; amount: number; days: number }

/**
 * Цомгийн хугацаа сунгах: сонголт (30 хоног / 60 хоног …) → нэр, утас → QPay → амжилттай.
 * Хугацаа дууссан цомгийн хуудас болон хяналтын самбарын «Сунгах» цонхонд ашиглагдана.
 */
export default function ExtendAlbumForm({ albumId, defaultName = '', defaultPhone = '', onExtended }: {
  albumId: string; defaultName?: string; defaultPhone?: string; onExtended: (expiresAt: string | null) => void;
}) {
  const { t } = useI18n();
  const [options, setOptions] = useState<ExtendOption[]>(DEFAULT_EXTEND_OPTIONS);
  const [days, setDays] = useState(DEFAULT_EXTEND_OPTIONS[0].days);
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone.replace(/\D/g, ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    loadExtendOptions().then(o => { setOptions(o); setDays(o[0].days); });
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, []);

  const chosen = options.find(o => o.days === days) ?? options[0];
  // Хамгийн богино сонголттой харьцуулсан хэмнэлт
  const base = options[0];
  const saving = (o: ExtendOption) => Math.round(base.price / base.days * o.days - o.price);

  async function pay() {
    setError('');
    if (!name.trim() || !/^\d{8,}$/.test(phone.trim())) { setError(t('Нэр, утасны дугаараа зөв оруулна уу')); return; }
    setBusy(true);
    try {
      const res = await fetch(`${QPAY_FN_URL}/extend-invoice`, {
        method: 'POST', headers, body: JSON.stringify({ albumId, buyerName: name.trim(), buyerPhone: phone.trim(), days: chosen.days }),
      });
      const data = await res.json();
      if (!res.ok || !data.invoiceId) throw new Error(data.error || 'QPay');
      setInvoice(data);
      let n = 0;
      timer.current = window.setInterval(async () => {
        if (++n > 100 && timer.current) { window.clearInterval(timer.current); return; }
        try {
          const r = await fetch(`${QPAY_FN_URL}/check-extension/${data.invoiceId}`, { headers });
          const c = await r.json();
          if (c.isPaid) {
            if (timer.current) window.clearInterval(timer.current);
            setDone(true);
            setTimeout(() => onExtended(c.expiresAt ?? null), 1500);
          }
        } catch { /* дахин оролдоно */ }
      }, 3000);
    } catch (e) {
      setError(t('Алдаа гарлаа:') + ' ' + (e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  }

  if (done) return (
    <div className="py-4 text-center">
      <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
      <p className="text-white font-semibold">{t('Цомгийн хугацаа {n} хоногоор сунгагдлаа!', { n: invoice?.days ?? chosen.days })}</p>
    </div>
  );

  if (invoice) return (
    <div className="text-center">
      <p className="text-stone-300 text-sm mb-4">{t('QPay-ээр ₮{amount} төлнө үү', { amount: invoice.amount.toLocaleString('en-US') })}</p>
      <img src={`data:image/png;base64,${invoice.qrImage}`} alt="QPay QR" className="w-52 h-52 mx-auto bg-white rounded-xl p-2 mb-4" />
      <div className="mb-4"><BankLinks urls={invoice.urls} /></div>
      <p className="text-stone-500 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('Төлбөр хүлээж байна…')}
      </p>
    </div>
  );

  return (
    <div>
      <div className={`grid gap-2 mb-4 ${options.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`} role="radiogroup" aria-label={t('Сунгах хугацаа')}>
        {options.map(o => {
          const active = o.days === chosen.days;
          const save = saving(o);
          return (
            <button key={o.days} type="button" role="radio" aria-checked={active} onClick={() => setDays(o.days)}
              className={`relative rounded-xl border p-3 text-center transition-colors ${
                active ? 'bg-amber-500/15 border-amber-500 text-white' : 'bg-white/5 border-white/10 text-stone-300 hover:border-white/30'}`}>
              <p className="text-sm font-semibold">{t('{n} хоног', { n: o.days })}</p>
              <p className={`text-lg font-bold ${active ? 'text-amber-300' : 'text-stone-200'}`}>₮{o.price.toLocaleString('en-US')}</p>
              {save > 0 && <p className="text-emerald-400 text-[11px] font-semibold">{t('₮{n} хэмнэнэ', { n: save.toLocaleString('en-US') })}</p>}
            </button>
          );
        })}
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder={t('Нэр')}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-2 outline-none focus:border-amber-500" />
      <input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder={t('Утасны дугаар')} inputMode="numeric"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-3 outline-none focus:border-amber-500" />
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      <button onClick={pay} disabled={busy}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t('{n} хоногоор сунгах · ₮{p}', { n: chosen.days, p: chosen.price.toLocaleString('en-US') })}
      </button>
    </div>
  );
}
