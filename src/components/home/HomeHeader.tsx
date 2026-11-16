import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Receipt, Menu, Settings, Smartphone, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePwaInstall } from '../../lib/pwaInstall';
import { BrandLogo } from '../BrandMark';
import HomeQrButton from './HomeQrButton';
import { listPurchaseHistory, syncPurchaseHistoryFromGuides } from '../../lib/purchaseHistory';
import { cachedUndownloaded, undownloadedByInvoice } from '../../lib/receiptDownloads';

const MENU_LINKS = [
  { label: 'Гэрэл зурагчид', to: '/photographers' },
  { label: 'Гэрэл зургийн студи', to: '/studios' },
  { label: 'Зургийн цомгууд', to: '/explore' },
  { label: 'AI загвар', to: '/ai-booth' },
  { label: 'Холбоо барих', to: '/contact' },
];

/** Нүүр хуудасны толгой: лого зүүн, Нэвтрэх + цэс баруун. Нэвтэрсэн үед самбар, гарах цэсэнд орно. */
export default function HomeHeader() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { showInstall } = usePwaInstall();
  const [open, setOpen] = useState(false);

  function scrollToInstall() {
    setOpen(false);
    window.setTimeout(() => {
      document.getElementById('app-install')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function go(to: string) {
    setOpen(false);
    navigate(to);
  }

  return (
    <>
      <header className="border-b border-white/10 sticky top-0 z-50 bg-stone-950/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <button
            onClick={() => { navigate('/'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="hover:opacity-80 transition-opacity min-w-0"
          >
            <span className="sm:hidden"><BrandLogo size="sm" truncate /></span>
            <span className="hidden sm:inline-flex"><BrandLogo truncate /></span>
          </button>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {showInstall && (
              <button
                type="button"
                onClick={scrollToInstall}
                className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl h-9 px-2 sm:px-2.5 text-xs"
                aria-label="Апп суулгах"
              >
                <Smartphone className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Апп</span>
              </button>
            )}
            {profile ? (
              <button
                onClick={() => setOpen(true)}
                className="text-sm font-medium text-stone-200 hover:text-white max-w-[9rem] truncate px-2 py-2"
              >
                {profile.name || 'Профайл'}
              </button>
            ) : (
              <button
                onClick={() => navigate('/auth/login')}
                className="text-sm font-medium text-stone-200 hover:text-white px-2 sm:px-3 py-2"
              >
                Нэвтрэх
              </button>
            )}
            <button
              type="button"
              aria-label={open ? 'Цэс хаах' : 'Цэс нээх'}
              aria-expanded={open}
              onClick={() => setOpen(o => !o)}
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        <MyAlbumsBar />
      </header>

      {open && (
        <>
          <button
            type="button"
            aria-label="Цэс хаах"
            className="fixed inset-0 z-[60] bg-black/60"
            onClick={() => setOpen(false)}
          />
          <nav className="fixed top-0 right-0 z-[70] h-full w-[min(100%,20rem)] bg-stone-950 border-l border-white/10 shadow-2xl flex flex-col">
            <div className="h-14 sm:h-16 px-4 flex items-center justify-between border-b border-white/10">
              <span className="text-sm font-semibold text-white">Цэс</span>
              <button
                type="button"
                aria-label="Цэс хаах"
                onClick={() => setOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-stone-300 hover:text-white hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {profile && (
              <div className="px-4 py-3 border-b border-white/10">
                <p className="text-white text-sm font-medium truncate">{profile.name}</p>
                <p className="text-stone-500 text-xs truncate">{profile.email}</p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto py-2">
              {showInstall && (
                <button onClick={scrollToInstall} className="w-full flex items-center gap-3 px-4 py-3 text-amber-400 hover:bg-white/5 text-sm font-medium">
                  <Smartphone className="w-4 h-4" /> Апп суулгах
                </button>
              )}
              {profile && (
                <button onClick={() => go('/dashboard')} className="w-full flex items-center gap-3 px-4 py-3 text-stone-200 hover:bg-white/5 text-sm">
                  <Settings className="w-4 h-4 text-amber-400" /> Хяналтын самбар
                </button>
              )}
              {MENU_LINKS.map(item => (
                <button
                  key={item.to}
                  onClick={() => go(item.to)}
                  className="w-full text-left px-4 py-3 text-stone-200 hover:bg-white/5 text-sm"
                >
                  {item.label}
                </button>
              ))}
              {!profile && (
                <button onClick={() => go('/auth/register')} className="w-full text-left px-4 py-3 text-amber-400 hover:bg-white/5 text-sm font-medium">
                  Бүртгүүлэх
                </button>
              )}
            </div>
            {profile && (
              <button
                onClick={() => { setOpen(false); signOut(); }}
                className="m-4 flex items-center justify-center gap-2 border border-red-500/30 text-red-300 hover:bg-red-500/10 rounded-xl py-3 text-sm"
              >
                <LogOut className="w-4 h-4" /> Гарах
              </button>
            )}
          </nav>
        </>
      )}
    </>
  );
}

/** Нүүрний дээд мөр: QR уншигч + Төлсөн захиалга (татаагүй зургийн тоотой) */
function MyAlbumsBar() {
  const navigate = useNavigate();
  // Цомгийн хөтчөөр төлсөн ч түүхэнд ороогүй захиалгуудыг нэгтгэнэ
  const [history] = useState(() => { syncPurchaseHistoryFromGuides(); return listPurchaseHistory(); });
  // Кэшээс шууд, дараа нь серверээс шинэчилнэ (алдаа гарвал кэш хэвээр)
  const [undlList, setUndlList] = useState(() => cachedUndownloaded(history.map(h => h.invoiceId)));
  const undl = undlList.reduce((n, r) => n + r.count, 0);
  useEffect(() => {
    if (!history.length) return;
    let cancel = false;
    undownloadedByInvoice(history.map(h => h.invoiceId)).then(r => { if (!cancel) setUndlList(r); }).catch(() => {});
    return () => { cancel = true; };
  }, [history.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="border-t border-white/5 bg-stone-950/95">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-end gap-2">
        <HomeQrButton />
        {history.length > 0 && (
          <button
            onClick={() => navigate('/my-purchases')}
            title="Төлсөн захиалга — зургаа татах"
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-emerald-400/40 text-emerald-300 font-semibold text-sm px-3 py-1.5 rounded-xl flex-shrink-0"
          >
            <Receipt className="w-4 h-4" /> Төлсөн
          </button>
        )}
        {undl > 0 && (
          <button
            // Нэг захиалга бол шууд баримт (татах хэсэг), олон бол төлсөн жагсаалт
            onClick={() => navigate(undlList.length === 1 ? `/receipt/${undlList[0].invoice}` : '/my-purchases')}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-sm px-3 py-1.5 rounded-xl flex-shrink-0"
          >
            Татаагүй {undl} зураг →
          </button>
        )}
      </div>
    </div>
  );
}
