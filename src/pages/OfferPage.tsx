import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { HandCoins, Loader2, AlertCircle, Clock, CheckCircle2, XCircle, RefreshCw, QrCode, ArrowLeft } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { QPAY_FN_URL, OFFER_STATUS_LABEL, OfferStatus, rememberOffer } from '../lib/offers';
import LicenseConsent from '../components/LicenseConsent';
import BankLinks, { BankLink, canOpenBankApps } from '../components/BankLinks';

const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const headers = { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' };

interface OfferInfo {
  status: OfferStatus;
  listPrice: number;
  offerAmount: number;
  counterAmount: number | null;
  finalAmount: number | null;
  respondBy: string;
  payBy: string | null;
  invoiceId: string | null;
  buyerName: string;
  previewUrl: string;
  albumName: string;
  albumLink: string;
}

interface Invoice { invoiceId: string; qrImage: string; urls: BankLink[]; amount: number }

function left(iso: string | null, now: number): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return '0';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} ц ${m} мин` : `${m} мин`;
}

/** Зочны үнийн саналын хуудас: төлөв харах, эсрэг саналд хариулах, зөвшөөрөгдсөн үнээр төлөх */
export default function OfferPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [offer, setOffer] = useState<OfferInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [licenseOk, setLicenseOk] = useState(false);
  const [licenseError, setLicenseError] = useState('');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [now, setNow] = useState(Date.now());
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (token) { rememberOffer(token); load(); }
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(tick); if (poll.current) clearInterval(poll.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${QPAY_FN_URL}/offer/${token}`, { headers });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || t('Санал олдсонгүй'));
      setOffer(data);
      if (data.status === 'paid' && data.invoiceId) navigate(`/receipt/${data.invoiceId}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function buyerRespond(action: 'accept' | 'decline') {
    setBusy(true); setError('');
    try {
      const res = await fetch(`${QPAY_FN_URL}/offer-buyer-respond`, { method: 'POST', headers, body: JSON.stringify({ token, action }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function pay() {
    if (!licenseOk) { setLicenseError(t('Нөхцөлийг зөвшөөрч тэмдэглэнэ үү')); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch(`${QPAY_FN_URL}/offer-invoice`, { method: 'POST', headers, body: JSON.stringify({ token, licenseAccepted: true }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || t('Нэхэмжлэх үүсгэж чадсангүй'));
      if (data.alreadyPaid) { navigate(`/receipt/${data.invoiceId}`); return; }
      setInvoice(data);
      let n = 0;
      poll.current = setInterval(async () => {
        if (++n > 80) { if (poll.current) clearInterval(poll.current); return; }
        try {
          const r = await fetch(`${QPAY_FN_URL}/check-payment/${data.invoiceId}`, { headers });
          const d = await r.json();
          if (d.isPaid) {
            if (poll.current) clearInterval(poll.current);
            navigate(`/receipt/${data.invoiceId}`);
          }
        } catch { /* дахин оролдоно */ }
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );

  if (!offer) return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6 text-center">
      <div>
        <AlertCircle className="w-10 h-10 text-stone-500 mx-auto mb-3" />
        <p className="text-white font-semibold">{error || t('Санал олдсонгүй')}</p>
      </div>
    </div>
  );

  const s = offer.status;
  const tone = s === 'accepted' || s === 'paid' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
    : s === 'rejected' || s === 'cancelled' ? 'text-stone-300 bg-white/5 border-white/10'
    : 'text-amber-300 bg-amber-500/10 border-amber-500/30';

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-8">
      <div className="max-w-md mx-auto space-y-5">
        {offer.albumLink && (
          <Link to={`/album/${offer.albumLink}`} className="inline-flex items-center gap-1.5 text-stone-400 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" /> {offer.albumName || t('Цомог руу буцах')}
          </Link>
        )}
        <div className="bg-stone-900 border border-white/10 rounded-2xl p-5 space-y-4">
          <h1 className="text-white font-semibold text-lg flex items-center gap-2">
            <HandCoins className="w-5 h-5 text-amber-400" /> {t('Таны үнийн санал')}
          </h1>
          <div className="flex gap-4">
            <img src={offer.previewUrl} alt="" draggable={false} onContextMenu={e => e.preventDefault()}
              className="w-24 h-24 rounded-xl object-cover flex-shrink-0" />
            <div className="text-sm space-y-1">
              <p className="text-stone-400">{t('Зургийн үнэ')}: <span className="text-stone-200 line-through">₮{offer.listPrice.toLocaleString()}</span></p>
              <p className="text-stone-400">{t('Таны санал')}: <span className="text-white font-semibold">₮{offer.offerAmount.toLocaleString()}</span></p>
              {offer.counterAmount !== null && (
                <p className="text-stone-400">{t('Зурагчны санал')}: <span className="text-amber-300 font-semibold">₮{offer.counterAmount.toLocaleString()}</span></p>
              )}
            </div>
          </div>
          <div className={`border rounded-xl px-3 py-2 text-sm font-medium ${tone}`}>{t(OFFER_STATUS_LABEL[s])}</div>

          {s === 'pending' && (
            <p className="text-stone-400 text-sm flex items-start gap-2">
              <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {t('Зурагчин {h}-ийн дотор хариулна. Хариу ирэхэд SMS очно. Энэ хуудасны холбоосыг хадгалаарай.', { h: left(offer.respondBy, now) })}
            </p>
          )}

          {s === 'countered' && offer.counterAmount !== null && (
            <div className="space-y-3">
              <p className="text-stone-300 text-sm">
                {t('Зурагчин {n}-өөр зарахыг санал болгож байна. Хариулах хугацаа: {h}', { n: `₮${offer.counterAmount.toLocaleString()}`, h: left(offer.respondBy, now) })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => buyerRespond('accept')} disabled={busy}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> {t('Зөвшөөрөх')}
                </button>
                <button onClick={() => buyerRespond('decline')} disabled={busy}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 py-2.5 rounded-xl flex items-center justify-center gap-1.5">
                  <XCircle className="w-4 h-4" /> {t('Татгалзах')}
                </button>
              </div>
            </div>
          )}

          {s === 'accepted' && offer.finalAmount !== null && !invoice && (
            <div className="space-y-4">
              <p className="text-stone-300 text-sm">
                {t('{n}-өөр төлж чанартай файлаа авна уу. Төлөх хугацаа: {h}', { n: `₮${offer.finalAmount.toLocaleString()}`, h: left(offer.payBy, now) })}
              </p>
              <LicenseConsent checked={licenseOk} onChange={v => { setLicenseOk(v); if (v) setLicenseError(''); }} error={licenseError} />
              <button onClick={pay} disabled={busy}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                {t('QPay-ээр төлөх')} · ₮{offer.finalAmount.toLocaleString()}
              </button>
            </div>
          )}

          {invoice && (
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-4 py-1.5 text-sm">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {t('Төлбөр хүлээж байна…')}
              </div>
              <div className="bg-white rounded-2xl p-4 inline-block">
                {invoice.qrImage
                  ? <img src={`data:image/png;base64,${invoice.qrImage}`} alt="QPay QR" width={200} height={200} />
                  : <QrCode className="w-16 h-16 text-stone-400" />}
              </div>
              <p className="text-stone-400 text-sm">{t('QPay апп-аар уншуулж {amount} төлнө үү', { amount: `₮${invoice.amount.toLocaleString()}` })}</p>
              {invoice.urls?.length > 0 && (
                <div className="space-y-2">
                  {canOpenBankApps && <p className="text-stone-500 text-xs">{t('Эсвэл апп-аар нээх:')}</p>}
                  <BankLinks urls={invoice.urls} />
                </div>
              )}
            </div>
          )}

          {(s === 'rejected' || s === 'cancelled') && offer.albumLink && (
            <Link to={`/album/${offer.albumLink}`}
              className="block text-center bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 py-2.5 rounded-xl text-sm">
              {t('Цомог руу буцаж үнээр нь худалдаж авах')}
            </Link>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
