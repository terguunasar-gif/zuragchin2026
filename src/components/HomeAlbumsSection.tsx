import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ImageOff, Loader2, Search, X } from 'lucide-react';
import {
  albumHref, CATEGORY_ICONS, fetchPublicAlbums, LISTING_CATEGORIES, PublicAlbum, PublicPhotoHit, searchPublicPhotos,
} from '../lib/listing';
import PublicAlbumCard from './PublicAlbumCard';

/** Нүүр хуудасны «Зургийн цомгууд» — үгээр (цомог, зургийн нэр) болон төрлөөр хайна */
export default function HomeAlbumsSection() {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<PublicAlbum[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundAlbums, setFoundAlbums] = useState<PublicAlbum[]>([]);
  const [foundPhotos, setFoundPhotos] = useState<PublicPhotoHit[]>([]);
  const chipsRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    fetchPublicAlbums({ limit: 6 }).then(setAlbums).catch(() => setAlbums([])).finally(() => setLoaded(true));
  }, []);

  async function search(q: string, cat: string) {
    setQuery(q); setCategory(cat);
    if (!q && !cat) { setFoundAlbums([]); setFoundPhotos([]); return; }
    const id = ++reqId.current;
    setSearching(true);
    const [a, p, catAlbums] = await Promise.all([
      fetchPublicAlbums({ q: q || undefined, category: cat || undefined, limit: 12 }).catch(() => [] as PublicAlbum[]),
      q ? searchPublicPhotos(q, 24) : Promise.resolve([] as PublicPhotoHit[]),
      // Төрөл сонгосон үед зургийн илэрцийг тухайн төрлийн цомгоор шүүнэ
      q && cat ? fetchPublicAlbums({ category: cat, limit: 100 }).catch(() => [] as PublicAlbum[]) : Promise.resolve(null),
    ]);
    if (id !== reqId.current) return; // хуучин хүсэлтийн хариу
    const allowed = catAlbums ? new Set(catAlbums.map(x => x.id)) : null;
    setFoundAlbums(a);
    setFoundPhotos(allowed ? p.filter(x => allowed.has(x.album_id)) : p);
    setSearching(false);
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    search(input.trim(), category);
  }

  function pickCategory(c: string) {
    search(query, c === category ? '' : c);
  }

  function clearText() {
    setInput('');
    search('', category);
  }

  function scrollChips(dir: number) {
    chipsRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  }

  if (!loaded) return null;
  if (albums.length === 0 && !query && !category) return null;

  const filtering = Boolean(query || category);
  const nothing = filtering && !searching && foundAlbums.length === 0 && foundPhotos.length === 0;
  const label = [query && `«${query}»`, category && `${CATEGORY_ICONS[category] ?? ''} ${category}`].filter(Boolean).join(' · ');

  return (
    <section id="albums" className="scroll-mt-20 py-10 sm:py-14 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <h2 className="text-2xl font-bold">Зургийн цомгууд</h2>
          <div className="flex items-center gap-3 md:gap-5">
            <form onSubmit={submit} className="relative flex-1 md:w-96">
              <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={input}
                onChange={e => { setInput(e.target.value); if (!e.target.value && query) search('', category); }}
                placeholder="Цомог, арга хэмжээ, зургийн нэрээр хайх…"
                className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 rounded-xl pl-10 pr-20 py-2.5 text-sm text-white placeholder-stone-500 outline-none"
              />
              {input && (
                <button type="button" onClick={clearText} className="absolute right-[60px] top-1/2 -translate-y-1/2 text-stone-500 hover:text-white p-1" title="Цэвэрлэх">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold px-3 py-1.5 rounded-lg">
                Хайх
              </button>
            </form>
            <button onClick={() => navigate(category ? `/explore?cat=${encodeURIComponent(category)}` : '/explore')}
              className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors whitespace-nowrap">
              Бүгдийг харах <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Төрлөөр шүүх */}
        <div className="relative mb-8">
          <button onClick={() => scrollChips(-1)} aria-label="Өмнөх"
            className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-stone-900 border border-white/10 text-stone-300 hover:text-white">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div ref={chipsRef} className="flex gap-2 overflow-x-auto scroll-smooth pb-1 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {['', ...LISTING_CATEGORIES].map(c => {
              const active = category === c;
              return (
                <button key={c || 'all'} onClick={() => (c ? pickCategory(c) : search(query, ''))}
                  className={`flex-shrink-0 flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-full text-sm border transition-colors ${
                    active
                      ? 'bg-amber-500 text-stone-950 border-amber-500 font-semibold'
                      : 'bg-white/[0.03] border-white/10 text-stone-300 hover:text-white hover:border-white/30'}`}>
                  <span className="text-base leading-none">{c ? CATEGORY_ICONS[c] ?? '📷' : '✨'}</span>
                  {c || 'Бүгд'}
                </button>
              );
            })}
          </div>
          <button onClick={() => scrollChips(1)} aria-label="Дараах"
            className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-stone-900 border border-white/10 text-stone-300 hover:text-white">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {!filtering ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {albums.map(album => <PublicAlbumCard key={album.id} album={album} />)}
          </div>
        ) : searching ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 text-amber-400 animate-spin" /></div>
        ) : nothing ? (
          <div className="py-14 text-center border border-dashed border-white/10 rounded-2xl">
            <ImageOff className="w-8 h-8 text-stone-600 mx-auto mb-3" />
            <p className="text-stone-300">{label} — цомог эсвэл зураг олдсонгүй</p>
            <p className="text-stone-500 text-sm mt-1">Өөр үг эсвэл төрлөөр хайж үзнэ үү.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {foundPhotos.length > 0 && (
              <div>
                <p className="text-stone-400 text-sm mb-4">Зураг — <span className="text-white font-medium">{foundPhotos.length}</span> илэрц</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {foundPhotos.map(p => (
                    <button key={p.id} onClick={() => navigate(`${albumHref(p.share_link)}?photo=${p.id}`)}
                      className="group text-left bg-white/5 border border-white/10 hover:border-amber-500/40 rounded-xl overflow-hidden transition-colors">
                      <div className="aspect-square bg-stone-900 overflow-hidden">
                        {p.preview_url
                          ? <img src={p.preview_url} alt={p.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          : <div className="w-full h-full flex items-center justify-center"><ImageOff className="w-6 h-6 text-stone-600" /></div>}
                      </div>
                      <div className="p-2.5">
                        <p className="text-white text-sm font-medium truncate">{p.title}</p>
                        <p className="text-stone-500 text-xs truncate">{p.album_name}</p>
                        <p className="text-amber-400 text-xs font-semibold mt-1">{p.price > 0 ? `₮${p.price.toLocaleString()}` : 'Үнэгүй'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {foundAlbums.length > 0 && (
              <div>
                <p className="text-stone-400 text-sm mb-4">
                  {category && !query ? <>{CATEGORY_ICONS[category]} {category} — </> : 'Цомог — '}
                  <span className="text-white font-medium">{foundAlbums.length}</span> цомог
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {foundAlbums.map(album => <PublicAlbumCard key={album.id} album={album} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
