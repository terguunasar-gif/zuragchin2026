import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Images, X } from 'lucide-react';
import { listVisitedAlbums } from '../../lib/visitedAlbums';

const HIDE_KEY = 'zm_resume_hidden';
const MAX_AGE = 30 * 86400000;

/**
 * Нүүр хуудсанд: сүүлд үзсэн цомог руу буцах том карт.
 * Хөтчөө хаагаад zuragchin.mn гэж дахин ороход цомгоо шууд олно (нэвтрээгүй зочинд ч).
 */
export default function ResumeAlbumCard() {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
  });
  const last = listVisitedAlbums()[0];
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
          onClick={() => { try { sessionStorage.setItem(HIDE_KEY, '1'); } catch { /* */ } setHidden(true); }}
          aria-label="Хаах"
          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}
