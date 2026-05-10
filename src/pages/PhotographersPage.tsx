import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Search, Star, Phone, Instagram, Facebook, User, ChevronRight, LogIn, MapPin, X } from 'lucide-react';
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
  const [photographers, setPhotographers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Бүгд');
  const [activeLocation, setActiveLocation] = useState('Бүгд байршил');

  useEffect(() => { loadPhotographers(); }, []);

  async function loadPhotographers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('photographer_profiles')
      .select('*')
      .eq('is_visible', true)
      .order('created_at', { ascending: false });
    if (!error && data) setPhotographers(data);
    setLoading(false);
  }

  const filtered = photographers.filter(p => {
    const matchesCategory =
      activeCategory === 'Бүгд' ||
      (Array.isArray(p.specialties) && p.specialties.includes(activeCategory));

    const matchesLocation =
      activeLocation === 'Бүгд байршил' ||
      (p.location && p.location === activeLocation);

    const matchesSearch =
      search.trim() === '' ||
      (p.display_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.location ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (Array.isArray(p.specialties) && p.specialties.some((s: string) =>
        s.toLowerCase().includes(search.toLowerCase())
      ));

    return matchesCategory && matchesLocation && matchesSearch;
  });

  const hasFilters = activeCategory !== 'Бүгд' || activeLocation !== 'Бүгд байршил' || search.trim() !== '';

  function clearFilters() {
    setActiveCategory('Бүгд');
    setActiveLocation('Бүгд байршил');
    setSearch('');
  }

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <Camera className="w-5 h-5 text-stone-950" />
            </div>
            <div>
              <span className="text-white font-bold tracking-tight">Zuragchin</span>
              <span className="text-amber-400 font-bold">.mn</span>
            </div>
          </button>
          <div className="flex items-center gap-3">
            {profile ? (
              <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                Хяналтын самбар <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={() => navigate('/auth/login')} className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                <LogIn className="w-4 h-4" /> Нэвтрэх
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-white text-3xl font-bold mb-2">Зурагчингууд</h1>
          <p className="text-stone-400">Мэргэжлийн зурагчдын жагсаалт</p>
        </div>

        {/* Search + Location row */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          {/* Search */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-2 flex items-center gap-3 flex-1">
            <Search className="w-5 h-5 text-stone-400 ml-3 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Нэр эсвэл чиглэлээр хайх..."
              className="flex-1 bg-transparent text-white placeholder-stone-500 outline-none text-sm py-2"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-stone-500 hover:text-white mr-2">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Location dropdown */}
          <div className="relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none z-10" />
            <select
              value={activeLocation}
              onChange={e => setActiveLocation(e.target.value)}
              className={`bg-white/5 border rounded-2xl pl-10 pr-10 py-3 outline-none text-sm transition-colors appearance-none cursor-pointer min-w-[180px] ${
                activeLocation !== 'Бүгд байршил'
                  ? 'border-amber-500/50 text-amber-400'
                  : 'border-white/10 text-stone-300'
              }`}
            >
              {LOCATIONS.map(loc => (
                <option key={loc} value={loc} className="bg-stone-900 text-white">{loc}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeCategory === cat
                  ? 'bg-amber-500 text-stone-950'
                  : 'bg-white/5 text-stone-400 hover:text-white border border-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Active filters summary */}
        {hasFilters && (
          <div className="flex items-center gap-3 mb-5">
            <span className="text-stone-400 text-sm">{filtered.length} зурагчин олдлоо</span>
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors">
              <X className="w-3 h-3" /> Шүүлтүүр цэвэрлэх
            </button>
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
            <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Camera className="w-7 h-7 text-stone-500" />
            </div>
            <p className="text-white font-medium mb-1">Зурагчин олдсонгүй</p>
            <p className="text-stone-500 text-sm mb-4">Хайлт эсвэл шүүлтүүрийг өөрчилж үзнэ үү.</p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors">
                Шүүлтүүр цэвэрлэх
              </button>
            )}
          </div>
        ) : (
          <>
            {!hasFilters && (
              <p className="text-stone-500 text-sm mb-6">{filtered.length} зурагчин</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map(p => (
                <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-amber-500/30 transition-all group cursor-pointer">
                  {/* Cover */}
                  <div className="relative h-36 overflow-hidden bg-stone-900">
                    <img
                      src={p.cover_url || DEFAULT_COVER}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={e => { (e.target as HTMLImageElement).src = DEFAULT_COVER; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 to-transparent" />
                    {/* Location badge */}
                    {p.location && (
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg">
                        <MapPin className="w-3 h-3 text-amber-400" /> {p.location}
                      </div>
                    )}
                  </div>

                  <div className="p-4 -mt-8 relative">
                    {p.avatar_url ? (
                      <img
                        src={p.avatar_url}
                        alt={p.display_name}
                        className="w-14 h-14 rounded-full border-2 border-stone-950 object-cover mb-3"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full border-2 border-stone-950 bg-stone-800 flex items-center justify-center mb-3">
                        <User className="w-6 h-6 text-stone-500" />
                      </div>
                    )}

                    <h3 className="text-white font-semibold">{p.display_name || 'Нэргүй'}</h3>
                    <p className="text-stone-400 text-xs mb-2 line-clamp-1">
                      {Array.isArray(p.specialties) && p.specialties.length > 0
                        ? p.specialties.join(', ')
                        : 'Чиглэл тодорхойгүй'}
                    </p>

                    <div className="flex items-center gap-1 mb-3">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span className="text-white text-sm font-medium">{p.rating ?? '—'}</span>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center gap-3 text-stone-500">
                      {p.phone && (
                        <a href={`tel:${p.phone}`} onClick={e => e.stopPropagation()} className="hover:text-white transition-colors">
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {p.instagram && (
                        <a href={`https://instagram.com/${p.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hover:text-pink-400 transition-colors">
                          <Instagram className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {p.facebook && (
                        <a href={p.facebook.startsWith('http') ? p.facebook : `https://${p.facebook}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hover:text-blue-400 transition-colors">
                          <Facebook className="w-3.5 h-3.5" />
                        </a>
                      )}
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
