import { useState, useEffect, useRef } from 'react';
import {
  X, ShoppingCart, User, Phone, AlertCircle,
  Loader2, QrCode, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { AlbumData, CartItem } from '../PublicAlbumPage';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const ANON_KEY    = import.meta.env.VITE_SUPABASE_ANON_KEY;

const headers = {
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};

const PRINT_SIZE_LABELS: Record<string, string> = {
  '10x15': '10×15 cm',
  '13x18': '13×18 cm',
  '20x30': '20×30 cm',
  'A4':    'A4 (21×29.7)',
  '21x30': '21×30 cm',
};

type Step = 'summary' | 'qpay' | 'confirming';

interface InvoiceData {
  invoiceId: string;
  qrImage: string;   // base64 PNG
  qrText: string;
  urls: { name: string; description: string; link: string }[];
  grossTotal: number;
  qpayFee: number;
  platformFee: number;
  ownerTotal: number;
  photographerPool: number;
}

export default function CheckoutModal({
  cart,
  album,
  onClose,
  onSuccess,
}: {
  cart: CartItem[];
  album: AlbumData;
  onClose: () => void;
  onSuccess: (invoiceId: string) => void;
}) {
  const [step, setStep] = useState<Step>('summary');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  const grossTotal = cart.reduce((s, i) => s + i.price, 0);
  const qpayFee    = Math.round(grossTotal * 0.01 * 100) / 100;
  const platformFee = Math.round(grossTotal * 0.03 * 100) / 100;
  const ownerAmt   = Math.round(grossTotal * 0.10 * 100) / 100;
  const youPay     = grossTotal; // buyer pays gross; fees come out of that

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  function validate() {
    let ok = true;
    if (!buyerName.trim()) { setNameError('Нэрээ оруулна уу'); ok = false; } else setNameError('');
    if (!buyerPhone.trim() || !/^\d{8,}$/.test(buyerPhone.trim())) {
      setPhoneError('Утасны дугаараа оруулна уу (8+ тоо)'); ok = false;
    } else setPhoneError('');
    return ok;
  }

  async function createInvoice() {
    if (!validate()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${QPAY_FN_URL}/create-invoice`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cartItems: cart.map(c => ({
            photoId: c.photoId,
            photographerId: c.photographerId,
            type: c.type,
            printSize: c.printSize,
            price: c.price,
          })),
          buyerName: buyerName.trim(),
          buyerPhone: buyerPhone.trim(),
          albumId: album.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to create invoice');

      setInvoice(data);
      setStep('qpay');
      startPolling(data.invoiceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function startPolling(invoiceId: string) {
    pollCount.current = 0;
    setStep('qpay');
    pollRef.current = setInterval(async () => {
      pollCount.current++;
      if (pollCount.current > 60) { stopPolling(); return; } // give up after 3 mins
      try {
        const res = await fetch(`${QPAY_FN_URL}/check-payment/${invoiceId}`, { headers });
        const data = await res.json();
        if (data.isPaid) {
          stopPolling();
          setStep('confirming');
          setTimeout(() => onSuccess(invoiceId), 1200);
        }
      } catch { /* ignore poll errors */ }
    }, 3000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 sticky top-0 bg-stone-900 z-10">
          <h2 className="text-white font-semibold text-lg">
            {step === 'confirming' ? 'Амжилттай!' : 'Худалдан авалт'}
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ── STEP: summary + buyer info ── */}
          {step === 'summary' && (
            <>
              {/* Order items */}
              <div>
                <p className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-3">
                  Таны захиалга ({cart.length} бараа)
                </p>
                <div className="space-y-2">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                      <img src={item.previewUrl} alt={item.filename} className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{item.filename}</p>
                        <p className="text-stone-400 text-xs">
                          {item.type === 'download' ? 'Татах' : `Хэвлэх — ${PRINT_SIZE_LABELS[item.printSize!] ?? item.printSize}`}
                        </p>
                      </div>
                      <span className="text-amber-400 text-sm font-semibold flex-shrink-0">
                        {item.price === 0 ? 'Үнэгүй' : `₮${item.price.toLocaleString()}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fee breakdown */}
              <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm">
                <FeeRow label="Нийт дүн" value={grossTotal} />
                <FeeRow label="QPay шимтгэл (1%)" value={qpayFee} muted />
                <FeeRow label="Платформ шимтгэл (3%)" value={platformFee} muted />
                <FeeRow label="Зохион байгуулагчийн хувь (10%)" value={ownerAmt} muted />
                <div className="border-t border-white/10 pt-2 mt-1 flex justify-between font-semibold">
                  <span className="text-white">Нийт төлөх</span>
                  <span className="text-amber-400 text-base">₮{youPay.toLocaleString()}</span>
                </div>
              </div>

              {/* Buyer info */}
              <div>
                <p className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-3">Таны мэдээлэл</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-stone-400 text-sm mb-1.5 flex items-center gap-2">
                      <User className="w-3.5 h-3.5" /> Нэр
                    </label>
                    <input
                      type="text"
                      value={buyerName}
                      onChange={e => setBuyerName(e.target.value)}
                      placeholder="Таны нэр"
                      className={`w-full bg-white/5 border ${nameError ? 'border-red-500/50' : 'border-white/10'} focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none transition-all text-sm`}
                    />
                    {nameError && <p className="text-red-400 text-xs mt-1">{nameError}</p>}
                  </div>
                  <div>
                    <label className="text-stone-400 text-sm mb-1.5 flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5" /> Утасны дугаар
                    </label>
                    <input
                      type="tel"
                      value={buyerPhone}
                      onChange={e => setBuyerPhone(e.target.value)}
                      placeholder="99001234"
                      className={`w-full bg-white/5 border ${phoneError ? 'border-red-500/50' : 'border-white/10'} focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none transition-all text-sm`}
                    />
                    {phoneError && <p className="text-red-400 text-xs mt-1">{phoneError}</p>}
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={createInvoice}
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold py-3.5 rounded-xl transition-colors text-base flex items-center justify-center gap-2.5"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Боловсруулж байна…</>
                ) : (
                  'QPay-ээр төлөх'
                )}
              </button>
            </>
          )}

          {/* ── STEP: QPay QR ── */}
          {step === 'qpay' && invoice && (
            <>
              <div className="text-center">
                <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-4 py-1.5 text-sm font-medium mb-5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Төлбөр хүлээж байна…
                </div>

                {/* QR code */}
                <div className="bg-white rounded-2xl p-4 inline-block mb-4">
                  {invoice.qrImage ? (
                    <img
                      src={`data:image/png;base64,${invoice.qrImage}`}
                      alt="QPay QR"
                      width={200}
                      height={200}
                      className="block"
                    />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center">
                      <QrCode className="w-16 h-16 text-stone-400" />
                    </div>
                  )}
                </div>

                <p className="text-stone-400 text-sm mb-1">
                  QPay апп-аар уншуулж <span className="text-amber-400 font-semibold">₮{invoice.grossTotal.toLocaleString()}</span> төлнө үү
                </p>
                <p className="text-stone-600 text-xs mb-4">Төлбөр автоматаар шалгагдана</p>

                {/* Deep links */}
                {invoice.urls && invoice.urls.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-stone-500 text-xs">Эсвэл апп-аар нээх:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {invoice.urls.slice(0, 4).map((u, i) => (
                        <a
                          key={i}
                          href={u.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          {u.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Fee summary */}
              <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm">
                <FeeRow label="Нийт дүн" value={invoice.grossTotal} />
                <FeeRow label="QPay шимтгэл (1%)" value={invoice.qpayFee} muted />
                <FeeRow label="Платформ шимтгэл (3%)" value={invoice.platformFee} muted />
              </div>
            </>
          )}

          {/* ── STEP: confirming ── */}
          {step === 'confirming' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <p className="text-white font-semibold text-xl">Төлбөр амжилттай!</p>
              <p className="text-stone-400 text-sm">Баримт бэлтгэж байна…</p>
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin mx-auto" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeeRow({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? 'text-stone-500' : 'text-stone-300'}>{label}</span>
      <span className={muted ? 'text-stone-500' : 'text-stone-300'}>₮{value.toLocaleString()}</span>
    </div>
  );
}
