import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, ChevronRight, Download, Printer, Receipt } from 'lucide-react';
import { listPurchaseHistory } from '../lib/purchaseHistory';
import { useI18n } from '../lib/i18n';
import { LanguageSwitcher } from '../components/LanguagePicker';
import InAppBrowserBanner from '../components/InAppBrowserBanner';
import AutoOpenInBrowser from '../components/AutoOpenInBrowser';

// Энэ төхөөрөмж дээр төлсөн бүх захиалгын жагсаалт. Зурагчнаас угаасан зургаа
// авахдаа баримтаа нээж үзүүлэхэд зориулсан.
export default function MyPurchasesPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const items = useMemo(() => listPurchaseHistory(), []);

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 bg-stone-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-stone-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <Camera className="w-5 h-5 text-stone-950" />
          </div>
          <p className="text-white font-bold flex-1">{t('Миний худалдан авалт')}</p>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        <AutoOpenInBrowser />
        <InAppBrowserBanner compact />
        {items.length === 0 ? (
          <div className="text-center py-20">
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
