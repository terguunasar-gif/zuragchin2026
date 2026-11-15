import { useState } from 'react';
import { Loader2, Phone, Smartphone } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { addPurchaseHistory, type PurchaseHistoryEntry } from '../lib/purchaseHistory';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/buyer-purchases`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface RecoveredOrder {
  invoiceId: string;
  albumId: string;
  albumName: string;
  albumLink: string;
  total: number;
  downloads: number;
  prints: number;
  buyerName: string;
  paidAt: string;
}

function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (/^\d{8}$/.test(d)) return d;
  if (/^976\d{8}$/.test(d)) return d.slice(3);
  return null;
}

function asEntry(raw: unknown): PurchaseHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as RecoveredOrder;
  const invoiceId = String(o.invoiceId ?? '');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(invoiceId)) return null;
  return {
    invoiceId,
    albumId: String(o.albumId ?? ''),
    albumName: String(o.albumName ?? '').slice(0, 200),
    albumLink: String(o.albumLink ?? '').replace(/^\/?album\//, '').slice(0, 200),
    total: Number(o.total) || 0,
    downloads: Number(o.downloads) || 0,
    prints: Number(o.prints) || 0,
    buyerName: String(o.buyerName ?? '').slice(0, 80),
    paidAt: String(o.paidAt ?? ''),
  };
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(`${FN_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data && typeof data === 'object' ? data as Record<string, unknown> : {} };
}

/**
 * Төлсөн захиалгаа өөр хөтчөөс утасны дугаараар татах.
 * Баталгаажсаны дараа одоогийн жагсаалтад нэгтгэж, баримт хуудсаар татуулна.
 */
export default function RecoverPurchases({ onRecovered }: { onRecovered: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'phone' | 'code' | 'done'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(0);

  function messageFor(data: Record<string, unknown>, fallback: string): string {
    const err = String(data.error ?? '');
    const wait = Number(data.retryAfter);
    if (err === 'invalid_phone') return t('8 оронтой утасны дугаараа оруулна уу.');
    if (err === 'invalid_code' || err === 'expired') return t('Код буруу эсвэл хугацаа дууссан. Дахин код авна уу.');
    if (err === 'too_many_attempts') return t('Оролдлого хэтэрсэн. Шинэ код авна уу.');
    if (err === 'rate_limited') {
      return Number.isFinite(wait) && wait > 0
        ? t('Хэт олон удаа оролдлоо. {s} секундын дараа дахин оролдоно уу.', { s: Math.ceil(wait) })
        : t('Хэт олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.');
    }
    if (err === 'sms_failed') return t('Код илгээж чадсангүй. Дахин оролдоно уу.');
    if (err === 'sms_not_configured') return t('SMS үйлчилгээ тохируулаагүй байна. Дараа дахин оролдоно уу.');
    return fallback;
  }

  async function requestCode() {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError(t('8 оронтой утасны дугаараа оруулна уу.'));
      return;
    }
    setPhone(normalized);
    setBusy(true);
    setError('');
    try {
      const { ok, data } = await post('/request-code', { phone: normalized });
      if (!ok) {
        setError(messageFor(data, t('Код илгээж чадсангүй. Дахин оролдоно уу.')));
        return;
      }
      setStep('code');
    } catch {
      setError(t('Сэргээж чадсангүй. Дахин оролдоно уу.'));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    const normalized = normalizePhone(phone);
    const digits = code.replace(/\D/g, '');
    if (!normalized) {
      setError(t('8 оронтой утасны дугаараа оруулна уу.'));
      return;
    }
    if (!/^\d{6}$/.test(digits)) {
      setError(t('6 оронтой кодоо оруулна уу.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { ok, data } = await post('/verify-code', { phone: normalized, code: digits });
      if (!ok) {
        setError(messageFor(data, t('Сэргээж чадсангүй. Дахин оролдоно уу.')));
        return;
      }
      const orders = Array.isArray(data.orders) ? data.orders : [];
      const entries = orders.map(asEntry).filter((e): e is PurchaseHistoryEntry => !!e);
      for (const entry of [...entries].reverse()) addPurchaseHistory(entry);
      setSaved(entries.length);
      setStep('done');
      if (entries.length) onRecovered();
    } catch {
      setError(t('Сэргээж чадсангүй. Дахин оролдоно уу.'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={() => { setOpen(true); setError(''); }}
          className="inline-flex items-center gap-2 text-emerald-300 hover:text-emerald-200 border border-emerald-400/30 hover:border-emerald-300/60 bg-emerald-500/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Smartphone className="w-4 h-4" />
          {t('Утасны дугаараар сэргээх')}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-stone-900 border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white font-semibold">{t('Утасны дугаараар сэргээх')}</p>
          <p className="text-stone-500 text-xs mt-1 leading-relaxed">
            {t('Өөр хөтөч, утас эсвэл Messenger дотор төлсөн бол төлөхдөө оруулсан 8 оронтой дугаараараа захиалгаа сэргээнэ.')}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-stone-500 hover:text-white text-xs shrink-0">
          {t('Хаах')}
        </button>
      </div>

      {step === 'phone' && (
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (!busy) void requestCode(); }}
        >
          <label className="block text-stone-400 text-sm" htmlFor="recover-phone">
            <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{t('Утасны дугаар')}</span>
          </label>
          <input
            id="recover-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="99001234"
            className="w-full bg-white/5 border border-white/10 focus:border-emerald-400/50 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-stone-950 font-semibold rounded-xl py-2.5 text-sm"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('Код авах')}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (!busy) void verifyCode(); }}
        >
          <p className="text-stone-300 text-sm leading-relaxed">
            {t('Хэрэв энэ дугаарт төлсөн захиалга байвал баталгаажуулах код SMS-ээр очино. 5 минутын дотор оруулна уу.')}
          </p>
          <label className="block text-stone-400 text-sm" htmlFor="recover-code">{t('6 оронтой код')}</label>
          <input
            id="recover-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            className="w-full bg-white/5 border border-white/10 focus:border-emerald-400/50 text-white tracking-[0.3em] placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-stone-950 font-semibold rounded-xl py-2.5 text-sm"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('Баталгаажуулах')}
          </button>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              className="text-stone-400 hover:text-white"
              onClick={() => { setStep('phone'); setCode(''); setError(''); }}
            >
              {t('Дугаар солих')}
            </button>
            <button
              type="button"
              disabled={busy}
              className="text-emerald-300 hover:text-emerald-200 disabled:opacity-60"
              onClick={() => { if (!busy) void requestCode(); }}
            >
              {t('Дахин код авах')}
            </button>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-3">
          <p className={saved > 0 ? 'text-emerald-300 text-sm' : 'text-stone-300 text-sm'}>
            {saved > 0
              ? t('{n} захиалга энэ төхөөрөмжид хадгалагдлаа. Баримт руу орж зургаа татна.', { n: saved })
              : t('Энэ дугаарт төлсөн захиалга олдсонгүй.')}
          </p>
          <button
            type="button"
            className="text-stone-400 hover:text-white text-xs"
            onClick={() => { setStep('phone'); setCode(''); setSaved(0); setError(''); }}
          >
            {t('Дугаар солих')}
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
