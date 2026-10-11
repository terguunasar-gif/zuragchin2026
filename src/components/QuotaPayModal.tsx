import { useEffect, useRef, useState } from 'react';
import { X, Loader2, RefreshCw, CheckCircle2, AlertCircle, QrCode } from 'lucide-react';
import { supabase } from '../lib/supabase';
import BankLinks, { BankLink, canOpenBankApps } from './BankLinks';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface QuotaPackage { code: string; name: string; photos: number; price: number }

export const DEFAULT_QUOTA_PACKAGES: QuotaPackage[] = [
  { code: 'p500', name: '+500 зураг', photos: 500, price: 5000 },
  { code: 'p2000', name: '+2,000 зураг', photos: 2000, price: 15000 },
];

export function normalizeQuotaPackages(v: unknown): QuotaPackage[] {
  if (!Array.isArray(v)) return DEFAULT_QUOTA_PACKAGES;
  const list = v.map(p => ({
    code: String(p?.code ?? ''), name: String(p?.name ?? p?.code ?? ''), photos: Number(p?.photos), price: Number(p?.price),
  })).filter(p => p.code && p.photos > 0 && p.price > 0);
  return list.length ? list : DEFAULT_QUOTA_PACKAGES;
}

/** Зурагчны зургийн хязгаарын нэмэлт багцыг QPay-ээр төлөх цонх */
export default function QuotaPayModal({ albumId, pkg, onPaid, onClose }: {
  albumId: string; pkg: QuotaPackage; onPaid: () => void; onClose: () => void;
}) {
  const [inv, setInv] = useState<{ invoiceId: string; qrImage: string; urls: BankLink[] } | null>(null);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${QPAY_FN_URL}/quota-invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: ANON_KEY },
          body: JSON.stringify({ albumId, packageCode: pkg.code }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Нэхэмжлэх үүсгэж чадсангүй');
        setInv(data);
        let n = 0;
        poll.current = setInterval(async () => {
          if (++n > 100) { if (poll.current) clearInterval(poll.current); return; }
          try {
            const r = await fetch(`${QPAY_FN_URL}/check-quota/${data.invoiceId}`, { headers: { Authorization: `Bearer ${ANON_KEY}` } });
            const d = await r.json();
            if (d.isPaid) {
              if (poll.current) clearInterval(poll.current);
              setPaid(true);
              setTimeout(onPaid, 1200);
            }
          } catch { /* дахин оролдоно */ }
        }, 3000);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { if (poll.current) clearInterval(poll.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-stone-900 border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
        <button onClick={onClose} className="absolute top-4 right-4 text-stone-400 hover:text-white"><X className="w-5 h-5" /></button>
        <h3 className="text-white font-semibold text-lg">{pkg.name}</h3>
        <p className="text-amber-400 font-bold text-2xl mt-1">₮{pkg.price.toLocaleString()}</p>
        <div className="mt-5">
          {error ? (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-left">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" /><p className="text-red-300 text-sm">{error}</p>
            </div>
          ) : paid ? (
            <div className="py-6"><CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" /><p className="text-white font-semibold">Төлбөр амжилттай! Хязгаар нэмэгдлээ.</p></div>
          ) : !inv ? (
            <div className="py-10"><Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" /></div>
          ) : (
            <>
              <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-4 py-1.5 text-sm mb-4">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Төлбөр хүлээж байна…
              </div>
              <div className="bg-white rounded-2xl p-4 inline-block mb-3">
                {inv.qrImage ? <img src={`data:image/png;base64,${inv.qrImage}`} alt="QPay QR" width={200} height={200} /> : <QrCode className="w-16 h-16 text-stone-400" />}
              </div>
              <p className="text-stone-400 text-sm mb-3">QPay апп-аар уншуулж төлнө үү</p>
              {inv.urls?.length > 0 && (
                <div className="space-y-2">
                  {canOpenBankApps && <p className="text-stone-500 text-xs">Эсвэл апп-аар нээх:</p>}
                  <BankLinks urls={inv.urls} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
