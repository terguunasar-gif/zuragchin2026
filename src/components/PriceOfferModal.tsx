import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, HandCoins, Loader2, AlertCircle, User, Phone } from 'lucide-react';
import { publicDb } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { rememberOffer } from '../lib/offers';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Зочин зурагчинд үнийн санал илгээнэ. Зөвшөөрөгдвөл /offer/:token хуудсаар төлнө. */
export default function PriceOfferModal({ photoId, previewUrl, listPrice, onClose }: {
  photoId: string;
  previewUrl: string;
  listPrice: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [ratio, setRatio] = useState(0.5);
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    publicDb.from('platform_settings').select('value').eq('key', 'offer_min_ratio').maybeSingle()
      .then(({ data }) => {
        const v = Number((data as { value?: unknown } | null)?.value);
        if (Number.isFinite(v) && v > 0 && v < 1) setRatio(v);
      }, () => { /* анхдагч */ });
  }, []);

  const minAmount = Math.ceil(listPrice * ratio);
  const value = Number(amount);

  async function submit() {
    setError('');
    if (!name.trim()) return setError(t('Нэрээ оруулна уу'));
    if (!/^\d{8}$/.test(phone)) return setError(t('8 оронтой утасны дугаараа оруулна уу'));
    if (!(value >= minAmount)) return setError(t('Санал хамгийн багадаа {n} байна', { n: `₮${minAmount.toLocaleString()}` }));
    if (value >= listPrice) return setError(t('Санал зургийн үнээс бага байх ёстой — үнээрээ шууд худалдаж авна уу'));
    setBusy(true);
    try {
      const res = await fetch(`${QPAY_FN_URL}/offer-submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId, amount: value, buyerName: name.trim(), buyerPhone: phone, message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || t('Санал илгээж чадсангүй'));
      rememberOffer(data.token);
      navigate(`/offer/${data.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full bg-white/5 border border-white/10 focus:border-amber-500/50 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none text-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-stone-900 border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-stone-900 z-10">
          <h2 className="text-white font-semibold text-lg flex items-center gap-2">
            <HandCoins className="w-5 h-5 text-amber-400" /> {t('Үнийн санал')}
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <img src={previewUrl} alt="" className="w-16 h-16 rounded-xl object-cover" draggable={false} />
            <div>
              <p className="text-stone-400 text-xs">{t('Зургийн үнэ')}</p>
              <p className="text-white text-lg font-bold">₮{listPrice.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-stone-400 text-sm leading-relaxed">
            {t('Санал болгох үнээ бичнэ үү. Зурагчин зөвшөөрвөл SMS очих бөгөөд тэр үнээр чанартай файлыг авна.')}
          </p>
          <div>
            <label className="text-stone-400 text-sm mb-1.5 block">{t('Таны санал (₮)')}</label>
            <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              placeholder={String(minAmount)} className={input} />
            <p className="text-stone-500 text-xs mt-1">
              {t('Хамгийн багадаа {n}', { n: `₮${minAmount.toLocaleString()}` })}
            </p>
          </div>
          <div>
            <label className="text-stone-400 text-sm mb-1.5 flex items-center gap-2"><User className="w-3.5 h-3.5" /> {t('Нэр')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('Таны нэр')} className={input} autoComplete="name" />
          </div>
          <div>
            <label className="text-stone-400 text-sm mb-1.5 flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {t('Утасны дугаар')}</label>
            <input type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
              placeholder="99001234" className={input} autoComplete="tel" />
          </div>
          <div>
            <label className="text-stone-400 text-sm mb-1.5 block">{t('Зурагчинд үлдээх үг (заавал биш)')}</label>
            <textarea value={message} onChange={e => setMessage(e.target.value.slice(0, 300))} rows={2} className={input} />
          </div>
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          <button onClick={submit} disabled={busy}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <HandCoins className="w-5 h-5" />} {t('Санал илгээх')}
          </button>
          <p className="text-stone-500 text-xs text-center">
            {t('Зурагчин 48 цагийн дотор хариулна. Хариулаагүй бол санал автоматаар цуцлагдана.')}
          </p>
        </div>
      </div>
    </div>
  );
}
