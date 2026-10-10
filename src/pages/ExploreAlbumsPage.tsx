import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, ChevronRight, Images, Loader2, LogIn, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchPublicAlbums, LISTING_CATEGORIES, PublicAlbum } from '../lib/listing';
import PublicAlbumCard from '../components/PublicAlbumCard';

const PAGE = 24;

/** Нийтэд нийтлэгдсэн бүх цомог — нэвтрэлтгүй үзнэ, зургаа худалдаж авна */
export default function ExploreAlbumsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const category = params.get('cat') || '';
  const q = params.get('q') || '';
  const [search, setSearch] = useState(q);
  const [albums, setAlbums] = useState<PublicAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setSearch(q); load(0); }, [category, q]);

  async function load(offset: number) {
    setLoading(true); setError('');
    try {
      const list = await fetchPublicAlbums({ category, q, limit: PAGE, offset });
      setAlbums(prev => (offset === 0 ? list : [...prev, ...list]));
      setMore(list.length === PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Алдаа гарлаа');
    } finally {
      setLoading(false);
    }
  }

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center"><Camera className="w-5 h-5 text-stone-950" /></div>
            <div><span className="text-white font-bold tracking-tight">Zuragchin</span><span className="text-amber-400 font-bold">.mn</span></div>
          </button>
          {profile
            ? <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium">Хяналтын самбар <ChevronRight className="w-4 h-4" /></button>
            : <button onClick={() => navigate('/auth/login')} className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium"><LogIn className="w-4 h-4" /> Нэвтрэх</button>}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-2">Зургийн цомгууд</h1>
        <p className="text-stone-400 mb-6">Арга хэмжээнээс өөрийн зургаа олж, шууд худалдаж аваарай.</p>

        <form onSubmit={e => { e.preventDefault(); setParam('q', search.trim()); }} className="flex gap-2 mb-4 max-w-xl">
          <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 focus-within:border-amber-500/50 rounded-xl px-4">
            <Search className="w-4 h-4 text-stone-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Цомгийн нэр, байршил…"
              className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-stone-500" />
          </div>
          <button className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 rounded-xl text-sm">Хайх</button>
        </form>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-8 -mx-1 px-1">
          {['', ...LISTING_CATEGORIES].map(c => (
            <button key={c || 'all'} onClick={() => setParam('cat', c)}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm border transition-colors ${category === c ? 'bg-amber-500 text-stone-950 border-amber-500 font-semibold' : 'border-white/10 text-stone-300 hover:bg-white/5'}`}>
              {c || 'Бүгд'}
            </button>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error} <button onClick={() => load(0)} className="underline ml-2">Дахин оролдох</button></p>}

        {albums.length === 0 && !loading && !error ? (
          <div className="text-center py-20 bg-white/5 border border-white/10 rounded-2xl">
            <Images className="w-10 h-10 text-stone-600 mx-auto mb-3" />
            <p className="text-stone-400">{q || category ? 'Тохирох цомог олдсонгүй' : 'Одоогоор нийтлэгдсэн цомог алга'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {albums.map(a => <PublicAlbumCard key={a.id} album={a} />)}
          </div>
        )}

        {loading && <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 text-amber-400 animate-spin" /></div>}
        {more && !loading && (
          <div className="flex justify-center mt-8">
            <button onClick={() => load(albums.length)} className="bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-xl text-sm">Цааш үзэх</button>
          </div>
        )}
      </main>
    </div>
  );
}
