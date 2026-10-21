import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/** Зурагчны нийтийн хуудас: шилдэг бүтээлүүд (эхнийх нь том), дарахад томруулж үзнэ */
export default function PortfolioGallery({ urls, name }: { urls: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen(i => (i === null ? i : (i + 1) % urls.length));
      if (e.key === 'ArrowLeft') setOpen(i => (i === null ? i : (i - 1 + urls.length) % urls.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, urls.length]);

  const [first, ...rest] = urls;
  return (
    <section className="mt-10">
      <h2 className="text-white text-xl font-bold mb-5">Шилдэг бүтээлүүд</h2>
      <div className={`grid gap-3 ${rest.length ? 'md:grid-cols-2' : ''}`}>
        <button onClick={() => setOpen(0)} className={`relative aspect-[4/3] rounded-2xl overflow-hidden bg-stone-900 group ${rest.length > 1 ? 'md:aspect-auto md:min-h-full' : ''}`}>
          <img src={first} alt={`${name} — бүтээл 1`} className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
            draggable={false} onContextMenu={e => e.preventDefault()} />
        </button>
        {rest.length > 0 && (
          <div className={`grid gap-3 ${rest.length > 1 ? 'grid-cols-2' : ''}`}>
            {rest.map((u, i) => (
              <button key={u} onClick={() => setOpen(i + 1)}
                className={`relative rounded-2xl overflow-hidden bg-stone-900 group ${rest.length === 3 && i === 2 ? 'col-span-2 aspect-[2/1]' : rest.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}>
                <img src={u} alt={`${name} — бүтээл ${i + 2}`} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                  draggable={false} onContextMenu={e => e.preventDefault()} />
              </button>
            ))}
          </div>
        )}
      </div>

      {open !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setOpen(null)}>
          <img src={urls[open]} alt={`${name} — бүтээл ${open + 1}`} className="max-w-[94vw] max-h-[88vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()} draggable={false} onContextMenu={e => e.preventDefault()} />
          <button onClick={() => setOpen(null)} aria-label="Хаах" className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"><X className="w-7 h-7" /></button>
          {urls.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); setOpen((open - 1 + urls.length) % urls.length); }} aria-label="Өмнөх"
                className="absolute left-2 sm:left-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronLeft className="w-6 h-6" /></button>
              <button onClick={e => { e.stopPropagation(); setOpen((open + 1) % urls.length); }} aria-label="Дараах"
                className="absolute right-2 sm:right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronRight className="w-6 h-6" /></button>
              <p className="absolute bottom-5 text-stone-400 text-sm">{open + 1} / {urls.length}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
