import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Images, LogOut, Menu, Settings, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { clearVisitedAlbums, listVisitedAlbums, VisitedAlbum } from '../../lib/visitedAlbums';
import { BrandLogo } from '../BrandMark';

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
  const [open, setOpen] = useState(false);

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
            <BrandLogo />
          </button>
          <div className="flex items-center gap-1 sm:gap-2">
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
                className="text-sm font-medium text-stone-200 hover:text-white px-3 py-2"
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

/** Энэ төхөөрөмжөөс үзсэн цомгууд руу буцах товч */
function MyAlbumsBar() {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<VisitedAlbum[]>(() => listVisitedAlbums());
  const [open, setOpen] = useState(false);
  if (albums.length === 0) return null;
  const last = albums[0];
  return (
    <div className="border-t border-white/5 bg-stone-950/95">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-end gap-2 relative">
        <button
          onClick={() => navigate(`/album/${last.link}`)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-semibold text-sm pl-1.5 pr-3 py-1.5 rounded-xl transition-colors min-w-0 max-w-[75vw]"
        >
          {last.cover
            ? <img src={last.cover} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
            : <Images className="w-5 h-5 flex-shrink-0 ml-1" />}
          <span className="flex-shrink-0">Таны цомог</span>
          <span className="font-normal truncate hidden sm:inline">· {last.name}</span>
        </button>
        {albums.length > 1 && (
          <button
            onClick={() => setOpen(o => !o)}
            title="Бусад цомог"
            className="w-9 h-9 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-stone-300"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
        <button
          onClick={() => { clearVisitedAlbums(); setOpen(false); setAlbums([]); }}
          title="Хаах"
          aria-label="«Таны цомог» товчийг хаах"
          className="w-9 h-9 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-stone-400 hover:text-white flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute right-4 sm:right-6 top-full mt-1 w-72 max-w-[calc(100vw-2rem)] bg-stone-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden z-50">
            {albums.map(a => (
              <button
                key={a.id}
                onClick={() => { setOpen(false); navigate(`/album/${a.link}`); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-left"
              >
                {a.cover
                  ? <img src={a.cover} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                  : <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Images className="w-4 h-4 text-stone-400" /></div>}
                <span className="text-stone-200 text-sm truncate">{a.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
