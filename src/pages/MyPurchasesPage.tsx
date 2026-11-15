import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Download, Loader2, Printer, Receipt } from 'lucide-react';
import { listPurchaseHistory, listPendingInvoices, setPendingInvoice, type PurchaseHistoryEntry } from '../lib/purchaseHistory';
import RecoverPurchases from '../components/RecoverPurchases';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
import { useI18n } from '../lib/i18n';
import { LanguageSwitcher } from '../components/LanguagePicker';
import BrandMark from '../components/BrandMark';

// Энэ төхөөрөмж дээр төлсөн бүх захиалгын жагсаалт. Зурагчнаас угаасан зургаа
// авахдаа баримтаа нээж үзүүлэхэд зориулсан.
export default function MyPurchasesPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState<PurchaseHistoryEntry[]>(() => listPurchaseHistory());
  // Банкны апп руу шилжиж төлөөд буцаж ирэхэд төлбөрийг шалгах хуудас хаагдсан байж болно —
  // энэ хөтөчид үлдсэн нэхэмжлэхүүдийг шалгаж, төлөгдсөнийг баримт руу нь холбоно.
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<string[]>([]);
  useEffect(() => {
    const known = new Set(items.map(i => i.invoiceId));
    const pending = listPendingInvoices().filter(p => !known.has(p.invoiceId));
    if (!pending.length) return;
    setChecking(true);
    Promise.all(pending.map(async p => {
      try {
        const res = await fetch(`${QPAY_FN_URL}/check-payment/${p.invoiceId}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        });
        const data = await res.json();
        if (data?.isPaid) { setPendingInvoice(p.albumId, null); return p.invoiceId; }
      } catch { /* сүлжээ */ }
      return null;
    })).then(r => {
      const paid = r.filter((x): x is string => !!x);
      setChecking(false);
      if (paid.length === 1 && items.length === 0) navigate(`/receipt/${paid[0]}`, { replace: true });
      else setFound(paid);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 bg-stone-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-stone-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <a href="/" title="Нүүр хуудас" className="w-8 h-8 flex-shrink-0 hover:opacity-80">
            <BrandMark className="w-8 h-8" />
          </a>
          <p className="text-white font-bold flex-1">{t('Миний худалдан авалт')}</p>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        {checking && (
          <div className="flex items-center gap-2 text-stone-400 text-sm bg-white/5 border border-white/10 rounded-xl px-4 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> {t('Төлбөрийг шалгаж байна…')}
          </div>
        )}
        {found.map(id => (
          <button key={id} onClick={() => navigate(`/receipt/${id}`)}
            className="w-full flex items-center justify-between gap-3 bg-emerald-500/15 border border-emerald-400/40 rounded-2xl px-4 py-4 text-left">
            <span>
              <span className="block text-emerald-300 font-bold">{t('Төлөгдсөн захиалга олдлоо')}</span>
              <span className="block text-stone-300 text-sm">{t('Дарж зургаа татаж авна уу')}</span>
            </span>
            <ChevronRight className="w-5 h-5 text-emerald-300" />
          </button>
        ))}
        {items.length === 0 && found.length === 0 && !checking ? (
          <div className="text-center pt-16 pb-6">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-8 h-8 text-stone-500" />
            </div>
            <p className="text-white font-medium mb-1">{t('Төлсөн захиалга алга')}</p>
            <p className="text-stone-500 text-sm">{t('QPay-ээр төлсөн захиалгууд энд хадгалагдана.')}</p>
            <p className="text-stone-600 text-xs mt-3 max-w-sm mx-auto">{t('Messenger, Facebook зэрэг өөр апп доторх хөтчөөр төлсөн бол тэр хөтчөөрөө (жишээ нь Messenger дахь цомгийн холбоосоор) орж харна уу.')}</p>
          </div>
        ) : (
          items.map(it => (
            <button
              key={it.invoiceId}
              onClick={() => navigate(`/receipt/${it.invoiceId}`)}
              className="w-full text-left bg-stone-900 hover:bg-stone-800 border border-white/10 rounded-2xl p-4 flex items-center gap-4 transition-colors"
            >
              <div className="w-11 h-11 bg-emerald-500/15 text-emerald-400 rounded-xl flex items-center justify-center flex-shrink-0">
                <Receipt className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold truncate">{it.albumName || t('Цомог')}</p>
                <p className="text-stone-500 text-xs mt-0.5">
                  {formatDate(it.paidAt)} · №{it.invoiceId.slice(0, 8).toUpperCase()}
                  {it.buyerName ? ` · ${it.buyerName}` : ''}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-stone-400">
                  {it.downloads > 0 && (
                    <span className="flex items-center gap-1"><Download className="w-3.5 h-3.5" /> {t('Татах {n}', { n: it.downloads })}</span>
                  )}
                  {it.prints > 0 && (
                    <span className="flex items-center gap-1 text-amber-300"><Printer className="w-3.5 h-3.5" /> {t('Угаалгах {n}', { n: it.prints })}</span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-white font-bold">₮{it.total.toLocaleString('en-US')}</p>
                <p className="text-emerald-400 text-xs">{t('Төлөгдсөн')}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-600 flex-shrink-0" />
            </button>
          ))
        )}

        <RecoverPurchases onRecovered={() => setItems(listPurchaseHistory())} />

        <p className="text-stone-600 text-xs text-center pt-4">
          {t('Энэ жагсаалт зөвхөн энэ утас/компьютерийн браузерт хадгалагдана. Баримтын хуудсыг screenshot хийж эсвэл линкийг нь хадгалж авбал илүү найдвартай.')}
        </p>
      </main>
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
