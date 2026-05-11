import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Search, Star, Phone, Instagram, Facebook, User, ChevronRight, LogIn, MapPin, X, Copy, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const CATEGORIES = ['Бүгд', 'Хурим', 'Баяр наадам', 'Спорт', 'Соёл', 'Хөгжим', 'Марафон', 'Хурал', 'Портрет', 'Байгаль', 'Мода'];
const LOCATIONS = [
  'Бүгд байршил', 'Улаанбаатар', 'Дархан', 'Эрдэнэт', 'Баянхонгор',
  'Өвөрхангай', 'Архангай', 'Булган', 'Орхон', 'Сэлэнгэ', 'Төв',
  'Дорнод', 'Сүхбаатар', 'Хэнтий', 'Дорноговь', 'Дундговь', 'Өмнөговь',
  'Говьсүмбэр', 'Ховд', 'Баян-Өлгий', 'Увс', 'Завхан', 'Говь-Алтай', 'Хөвсгөл',
];
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800&h=400&fit=crop';

export default function PhotographersPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [photographers, setPhotographers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [activeCategory, setActiveCategory] = useState(searchParams.get('cat') || 'Бүгд');
  const [activeLocation, setActiveLocation] = useState(searchParams.get('loc') || 'Бүгд байршил');

  useEffect(() => { loadPhotographers(); }, []);
  useEffect(() => {
    setSearch(searchParams.get('q') || '');
    setActiveCategory(searchParams.get('cat') || 'Бүгд');
    setActiveLocation(searchParams.get('loc') || 'Бүгд байршил');
  }, [searchParams]);

  async function loadPhotographers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('photographer_profiles').select('*')
      .eq('is_visible', true).order('created_at', { ascending: false });
    if (!error && data) setPhotographers(data);
    setLoading(false);
  }

  function updateParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v && v !== 'Бүгд' && v !== 'Бүгд байршил') next.set(k, v);
      else next.delete(k);
    });
    setSearchParams(next);
  }

  function copyZurId(e: React.MouseEvent, zurId: string, id: string) {
    e.stopPropagation();
    navigator.clipboard.writeText(zurId);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const filtered = photographers.filter(p => {
    const matchesCat = activeCategory === 'Бүгд' || (Array.isArray(p.specialties) && p.specialties.includes(activeCategory));
    const matchesLoc = activeLocation === 'Бүгд байршил' || p.location === activeLocation;
    const matchesSearch = search.trim() === '' ||
      (p.display_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.location ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (Array.isArray(p.specialties) && p.specialties.some((s: string) => s.toLowerCase().includes(search.toLowerCase())));
    return matchesCat && matchesLoc && matchesSearch;
  });

  const hasFilters = activeCategory !== 'Бүгд' || activeLocation !== 'Бүгд байршил' || search.trim() !== '';

  function clearFilters() {
    setSearch(''); setActiveCategory('Бүгд'); setActiveLocation('Бүгд байршил');
    setSearchParams({});
  }

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <Camera className="w-5 h-5 text-stone-950" />
            </div>
            <div><span className="text-white font-bold tracking-tight">Zuragchin</span><span className="text-amber-400 font-bold">.mn</span></div>
          </button>
          {profile
            ? <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium transition-colors">Хяналтын самбар <ChevronRight className="w-4 h-4" /></button>
            : <button onClick={() => navigate('/auth/login')} className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium transition-colors"><LogIn className="w-4 h-4" /> Нэвтрэх</button>
          }
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-white text-3xl font-bold mb-2">Зурагчингууд</h1>
          <p className="text-stone-400">Мэргэжлийн зурагчдын жагсаалт</p>
        </div>

        {/* Search + Location */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-2 flex flex-col sm:flex-row items-stretch gap-2 max-w-2xl mb-5">
          <div className="flex items-center gap-2 flex-1 px-3">
            <Search className="w-4 h-4 text-stone-400 flex-shrink-0" />
            <input type="text" value={search}
              onChange={e => { setSearch(e.target.value); updateParams({ q: e.target.value, cat: activeCategory, loc: activeLocation }); }}
              placeholder="Нэр эсвэл чиглэлээр хайх..."
              className="flex-1 bg-transparent text-white placeholder-stone-500 outline-none text-sm py-2" />
            {search && <button onClick={() => { setSearch(''); updateParams({ q: '', cat: activeCategory, loc: activeLocation }); }} className="text-stone-500 hover:text-white"><X className="w-4 h-4" /></button>}
          </div>
          <div className="hidden sm:block w-px bg-white/10 my-1" />
          <div className="relative flex items-center px-2">
            <MapPin className="absolute left-4 w-4 h-4 text-stone-400 pointer-events-none" />
            <select value={activeLocation}
              onChange={e => { setActiveLocation(e.target.value); updateParams({ q: search, cat: activeCategory, loc: e.target.value }); }}
              className={`bg-transparent pl-8 pr-3 py-2 outline-none text-sm appearance-none cursor-pointer min-w-[150px] ${activeLocation !== 'Бүгд байршил' ? 'text-amber-400' : 'text-stone-300'}`}>
              {LOCATIONS.map(loc => <option key={loc} value={loc} className="bg-stone-900 text-white">{loc}</option>)}
            </select>
          </div>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map(cat => (
            <button key={cat}
              onClick={() => { setActiveCategory(cat); updateParams({ q: search, cat, loc: activeLocation }); }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeCategory === cat ? 'bg-amber-500 text-stone-950' : 'bg-white/5 text-stone-400 hover:text-white border border-white/10'}`}>
              {cat}
            </button>
          ))}
        </div>

        {hasFilters && (
          <div className="flex items-center gap-3 mb-5">
            <span className="text-stone-400 text-sm">{filtered.length} зурагчин олдлоо</span>
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors">
              <X className="w-3 h-3" /> Шүүлтүүр цэвэрлэх
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
            <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4"><Camera className="w-7 h-7 text-stone-500" /></div>
            <p className="text-white font-medium mb-1">Зурагчин олдсонгүй</p>
            <p className="text-stone-500 text-sm mb-4">Хайлт эсвэл шүүлтүүрийг өөрчилж үзнэ үү.</p>
            {hasFilters && <button onClick={clearFilters} className="text-amber-400 hover:text-amber-300 text-sm font-medium">Шүүлтүүр цэвэрлэх</button>}
          </div>
        ) : (
          <>
            {!hasFilters && <p className="text-stone-500 text-sm mb-6">{filtered.length} зурагчин</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map(p => (
                <div key={p.id} onClick={() => navigate(`/photographers/${p.id}`)}
                  className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-amber-500/30 transition-all group cursor-pointer">
                  {/* Cover */}
                  <div className="relative h-36 overflow-hidden bg-stone-900">
                    <img src={p.cover_url || DEFAULT_COVER} alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={e => { (e.target as HTMLImageElement).src = DEFAULT_COVER; }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 to-transparent" />
                    {p.location && (
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg">
                        <MapPin className="w-3 h-3 text-amber-400" /> {p.location}
                      </div>
                    )}
                  </div>

                  <div className="p-4 -mt-8 relative">
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt={p.display_name} className="w-14 h-14 rounded-full border-2 border-stone-950 object-cover mb-3" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : <div className="w-14 h-14 rounded-full border-2 border-stone-950 bg-stone-800 flex items-center justify-center mb-3"><User className="w-6 h-6 text-stone-500" /></div>
                    }

                    {/* Нэр + ZUR-ID хуулах */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-white font-semibold leading-tight">{p.display_name || 'Нэргүй'}</h3>
                      {p.zur_id && (
                        <button
                          onClick={e => copyZurId(e, p.zur_id, p.id)}
                          className="flex items-center gap-1 text-xs text-stone-500 hover:text-amber-400 border border-white/10 hover:border-amber-500/30 px-2 py-0.5 rounded-lg transition-colors flex-shrink-0"
                          title="ZUR-ID хуулах"
                        >
                          {copiedId === p.id
                            ? <><CheckCircle2 className="w-3 h-3 text-green-400" /><span className="text-green-400">Хуулагдлаа</span></>
                            : <><Copy className="w-3 h-3" /><span className="font-mono">{p.zur_id}</span></>
                          }
                        </button>
                      )}
                    </div>

                    <p className="text-stone-400 text-xs mb-2 line-clamp-1">
                      {Array.isArray(p.specialties) && p.specialties.length > 0 ? p.specialties.join(', ') : 'Чиглэл тодорхойгүй'}
                    </p>

                    {p.location && (
                      <div className="flex items-center gap-1 text-stone-500 text-xs mb-1.5">
                        <MapPin className="w-3 h-3 text-amber-500/70 flex-shrink-0" /><span>{p.location}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span className="text-white text-sm font-medium">{p.rating ?? '—'}</span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-3 text-stone-500">
                      {p.phone && <a href={`tel:${p.phone}`} onClick={e => e.stopPropagation()} className="hover:text-white transition-colors"><Phone className="w-3.5 h-3.5" /></a>}
                      {p.instagram && <a href={`https://instagram.com/${p.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hover:text-pink-400 transition-colors"><Instagram className="w-3.5 h-3.5" /></a>}
                      {p.facebook && <a href={p.facebook.startsWith('http') ? p.facebook : `https://${p.facebook}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hover:text-blue-400 transition-colors"><Facebook className="w-3.5 h-3.5" /></a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
