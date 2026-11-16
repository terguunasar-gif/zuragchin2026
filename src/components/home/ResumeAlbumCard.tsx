import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, Images, X } from 'lucide-react';
import { listVisitedAlbums } from '../../lib/visitedAlbums';

const HIDE_KEY = 'zm_resume_hidden';
const MAX_AGE = 30 * 86400000;

/**
 * Нүүр хуудсанд: сүүлд үзсэн цомог руу буцах том карт.
 * Хөтчөө хаагаад zuragchin.mn гэж дахин ороход цомгоо шууд олно (нэвтрээгүй зочинд ч).
 */
export default function ResumeAlbumCard() {
  const navigate = useNavigate();
  const all = listVisitedAlbums();
  const last = all[0];
  const others = all.slice(1);
  // X дарахад зөвхөн ЭНЭ удаагийн үзэлтийг нууна. Дараа нь цомог руу дахин орвол карт буцаж гарна.
  // (Өмнө нь sessionStorage-д «1» хадгалдаг байсан тул утасны хөтчид таб хаагдах хүртэл — хэдэн долоо хоног — алга болдог байв.)
  const stamp = last ? `${last.id}:${last.at}` : '';
  const [hidden, setHidden] = useState(() => {
    try { return !!stamp && localStorage.getItem(HIDE_KEY) === stamp; } catch { return false; }
  });
  const [open, setOpen] = useState(false);
  if (hidden || !last || Date.now() - last.at > MAX_AGE) return null;

  return (
    <section className="px-4 sm:px-6 pt-5">
      <div className="max-w-3xl mx-auto relative">
        <button
          onClick={() => navigate(`/album/${last.link}`)}
          className="w-full flex items-center gap-4 bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 border border-emerald-400/40 hover:border-emerald-300 rounded-2xl p-3 pr-12 text-left transition-colors"
        >
          {last.cover
            ? <img src={last.cover} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover flex-shrink-0" />
            : <span className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0"><Images className="w-7 h-7 text-emerald-300" /></span>}
          <span className="min-w-0 flex-1">
            <span className="block text-emerald-300 text-xs font-semibold mb-0.5">Таны сүүлд үзсэн цомог</span>
            <span className="block text-white font-bold text-lg leading-tight truncate">{last.name}</span>
            <span className="mt-2 inline-flex items-center gap-1.5 bg-emerald-500 text-stone-950 font-bold text-sm px-3 py-1.5 rounded-xl">
              Цомог руугаа буцах <ArrowRight className="w-4 h-4" />
            </span>
          </span>
        </button>
        <button
          onClick={() => { try { localStorage.setItem(HIDE_KEY, stamp); sessionStorage.removeItem(HIDE_KEY); } catch { /* */ } setHidden(true); }}
          aria-label="Хаах"
          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
        {others.length > 0 && (
          <button
            onClick={() => setOpen(o => !o)}
            aria-label="Бусад цомог"
            title="Бусад үзсэн цомгууд"
            className="absolute bottom-2 right-2 h-8 px-2 flex items-center gap-1 rounded-lg text-emerald-200 hover:text-white bg-white/5 hover:bg-white/10 text-xs"
          >
            +{others.length} <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
        {open && others.length > 0 && (
          <div className="mt-2 bg-stone-900 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
            {others.map(a => (
              <button key={a.id} onClick={() => navigate(`/album/${a.link}`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-left">
                {a.cover
                  ? <img src={a.cover} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  : <span className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Images className="w-4 h-4 text-stone-400" /></span>}
                <span className="text-stone-200 text-sm truncate flex-1">{a.name}</span>
                <ArrowRight className="w-4 h-4 text-stone-500" />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
