import { useEffect, useState } from 'react';
import { Loader2, Mail, Phone, Smartphone } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { normalizeEmail } from '../lib/buyerEmail';
import { recoveryAuth } from '../lib/supabase';
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

type Channel = 'email' | 'phone';
type Step = 'form' | 'code' | 'done';

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

async function post(path: string, body: unknown, accessToken?: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(`${FN_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken || ANON_KEY}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data && typeof data === 'object' ? data as Record<string, unknown> : {} };
}

function otpErrorCode(error: { code?: string; message?: string; status?: number } | null): string {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  if (code === 'otp_expired' || /expired/i.test(message)) return 'expired';
  if (code.includes('rate_limit') || error?.status === 429) return 'rate_limited';
  return 'invalid_code';
}

/**
 * Төлсөн захиалгаа өөр хөтчөөс имэйлээр (SMS тохируулсан бол утсаар) татах.
 * Имэйлийн кодыг Supabase Auth шалгана. Захиалга зөвхөн баталгаажсан имэйл дээр буцна.
 */
export default function RecoverPurchases({ onRecovered }: { onRecovered: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [sms, setSms] = useState(false);
  const [channel, setChannel] = useState<Channel>('email');
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    let on = true;
    post('/options', {}).then(({ ok, data }) => {
      if (on && ok && data.sms === true) setSms(true);
    }).catch(() => { /* SMS товчийг нууна */ });
    return () => { on = false; };
  }, []);

  function messageFor(data: Record<string, unknown>, fallback: string): string {
    const err = String(data.error ?? '');
    const wait = Number(data.retryAfter);
    if (err === 'invalid_phone') return t('8 оронтой утасны дугаараа оруулна уу.');
    if (err === 'invalid_email') return t('Имэйл хаягаа зөв оруулна уу');
    if (err === 'invalid_code' || err === 'expired' || err === 'unauthorized') return t('Код буруу эсвэл хугацаа дууссан. Дахин код авна уу.');
    if (err === 'too_many_attempts') return t('Оролдлого хэтэрсэн. Шинэ код авна уу.');
    if (err === 'rate_limited') {
      return Number.isFinite(wait) && wait > 0
        ? t('Хэт олон удаа оролдлоо. {s} секундын дараа дахин оролдоно уу.', { s: Math.ceil(wait) })
        : t('Хэт олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.');
    }
    if (err === 'email_failed') return t('Имэйл илгээж чадсангүй. Дахин оролдоно уу.');
    if (err === 'sms_failed') return t('Код илгээж чадсангүй. Дахин оролдоно уу.');
    if (err === 'sms_not_configured') return t('SMS үйлчилгээ тохируулаагүй байна. Дараа дахин оролдоно уу.');
    return fallback;
  }

  function resetToForm(next: Channel) {
    setChannel(next);
    setStep('form');
    setCode('');
    setError('');
    setSaved(0);
  }

  async function requestEmail() {
    const normalized = normalizeEmail(email);
    if (!email.trim()) {
      setError(t('Имэйл хаягаа оруулна уу.'));
      return;
    }
    if (!normalized) {
      setError(t('Имэйл хаягаа зөв оруулна уу'));
      return;
    }
    const trimmedPhone = phone.trim();
    const normalizedPhone = trimmedPhone ? normalizePhone(phone) : null;
    if (trimmedPhone && !normalizedPhone) {
      setError(t('8 оронтой утасны дугаараа оруулна уу.'));
      return;
    }
    setEmail(normalized);
    if (normalizedPhone) setPhone(normalizedPhone);
    setBusy(true);
    setError('');
    try {
      const { ok, data } = await post('/request-code', {
        email: normalized,
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      });
      if (!ok) {
        setError(messageFor(data, t('Имэйл илгээж чадсангүй. Дахин оролдоно уу.')));
        return;
      }
      setStep('code');
    } catch {
      setError(t('Сэргээж чадсангүй. Дахин оролдоно уу.'));
    } finally {
      setBusy(false);
    }
  }

  async function requestPhone() {
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

  async function verifyEmail() {
    const normalized = normalizeEmail(email);
    const digits = code.replace(/\D/g, '');
    const normalizedPhone = phone.trim() ? normalizePhone(phone) : null;
    if (!normalized) {
      setError(t('Имэйл хаягаа оруулна уу.'));
      return;
    }
    if (!/^\d{6}$/.test(digits)) {
      setError(t('6 оронтой кодоо оруулна уу.'));
      return;
    }
    setBusy(true);
    setError('');
    const client = recoveryAuth();
    try {
      const { data, error: otpError } = await client.auth.verifyOtp({
        email: normalized,
        token: digits,
        type: 'email',
      });
      const accessToken = data.session?.access_token;
      if (otpError || !accessToken) {
        setError(messageFor({ error: otpErrorCode(otpError) }, t('Код буруу эсвэл хугацаа дууссан. Дахин код авна уу.')));
        return;
      }
      const { ok, data: body } = await post('/verify-code', {
        email: normalized,
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      }, accessToken);
      if (!ok) {
        setError(messageFor(body, t('Сэргээж чадсангүй. Дахин оролдоно уу.')));
        return;
      }
      keepOrders(body.orders);
    } catch {
      setError(t('Сэргээж чадсангүй. Дахин оролдоно уу.'));
    } finally {
      await client.auth.signOut({ scope: 'local' }).catch(() => { /* session аль хэдийн хаагдсан */ });
      setBusy(false);
    }
  }

  async function verifyPhone() {
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
      keepOrders(data.orders);
    } catch {
      setError(t('Сэргээж чадсангүй. Дахин оролдоно уу.'));
    } finally {
      setBusy(false);
    }
  }

  function keepOrders(raw: unknown) {
    const orders = Array.isArray(raw) ? raw : [];
    const entries = orders.map(asEntry).filter((e): e is PurchaseHistoryEntry => !!e);
    for (const entry of [...entries].reverse()) addPurchaseHistory(entry);
    setSaved(entries.length);
    setStep('done');
    if (entries.length) onRecovered();
  }

  if (!open) {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={() => { setOpen(true); setError(''); }}
          className="inline-flex items-center gap-2 text-emerald-300 hover:text-emerald-200 border border-emerald-400/30 hover:border-emerald-300/60 bg-emerald-500/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Mail className="w-4 h-4" />
          {t('Имэйлээр сэргээх')}
        </button>
      </div>
    );
  }

  const title = channel === 'phone' ? t('Утасны дугаараар сэргээх') : t('Имэйлээр сэргээх');
  const intro = channel === 'phone'
    ? t('Өөр хөтөч, утас эсвэл Messenger дотор төлсөн бол төлөхдөө оруулсан 8 оронтой дугаараараа захиалгаа сэргээнэ.')
    : t('Өөр хөтөч, утас эсвэл Messenger дотор төлсөн бол төлөхдөө оруулсан имэйлээрээ захиалгаа сэргээнэ.');

  return (
    <div className="bg-stone-900 border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white font-semibold">{title}</p>
          <p className="text-stone-500 text-xs mt-1 leading-relaxed">{intro}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-stone-500 hover:text-white text-xs shrink-0">
          {t('Хаах')}
        </button>
      </div>

      {step === 'form' && channel === 'email' && (
        <form noValidate className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!busy) void requestEmail(); }}>
          <label className="block text-stone-400 text-sm" htmlFor="recover-email">
            <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{t('Имэйл хаяг')}</span>
          </label>
          <input
            id="recover-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value.slice(0, 254))}
            placeholder="name@example.com"
            className="w-full bg-white/5 border border-white/10 focus:border-emerald-400/50 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none text-sm"
          />
          <label className="block text-stone-400 text-sm" htmlFor="recover-email-phone">
            <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{t('Утас (заавал биш)')}</span>
          </label>
          <input
            id="recover-email-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="99001234"
            aria-describedby="recover-email-phone-hint"
            className="w-full bg-white/5 border border-white/10 focus:border-emerald-400/50 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none text-sm"
          />
          <p id="recover-email-phone-hint" className="text-stone-500 text-xs">{t('Оруулбал зөвхөн энэ дугаарын захиалгыг хайна.')}</p>
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-stone-950 font-semibold rounded-xl py-2.5 text-sm"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('Код авах')}
          </button>
          {sms && (
            <button
              type="button"
              className="w-full inline-flex items-center justify-center gap-2 text-stone-400 hover:text-white text-xs"
              onClick={() => resetToForm('phone')}
            >
              <Smartphone className="w-3.5 h-3.5" />
              {t('Эсвэл утасны дугаараар (SMS)')}
            </button>
          )}
        </form>
      )}

      {step === 'form' && channel === 'phone' && sms && (
        <form noValidate className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!busy) void requestPhone(); }}>
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
          <button type="button" className="text-stone-400 hover:text-white text-xs" onClick={() => resetToForm('email')}>
            {t('Имэйлээр сэргээх')}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (!busy) void (channel === 'email' ? verifyEmail() : verifyPhone()); }}
        >
          <p className="text-stone-300 text-sm leading-relaxed">
            {channel === 'phone'
              ? t('Хэрэв энэ дугаарт төлсөн захиалга байвал баталгаажуулах код SMS-ээр очино. 5 минутын дотор оруулна уу.')
              : t('Хэрэв энэ имэйлд төлсөн захиалга байвал баталгаажуулах код имэйлээр очино. Кодоо оруулна уу.')}
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
            <button type="button" className="text-stone-400 hover:text-white" onClick={() => { setStep('form'); setCode(''); setError(''); }}>
              {channel === 'phone' ? t('Дугаар солих') : t('Имэйл солих')}
            </button>
            <button
              type="button"
              disabled={busy}
              className="text-emerald-300 hover:text-emerald-200 disabled:opacity-60"
              onClick={() => { if (!busy) void (channel === 'email' ? requestEmail() : requestPhone()); }}
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
              : channel === 'phone'
                ? t('Энэ дугаарт төлсөн захиалга олдсонгүй.')
                : t('Энэ имэйлд төлсөн захиалга олдсонгүй.')}
          </p>
          <button type="button" className="text-stone-400 hover:text-white text-xs" onClick={() => resetToForm(channel)}>
            {channel === 'phone' ? t('Дугаар солих') : t('Имэйл солих')}
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
