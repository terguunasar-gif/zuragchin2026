import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Camera, Instagram, Facebook, Twitter, Phone, Mail, MapPin, ChevronRight, Star, Image, User, ChevronDown, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const categories = ['Бүгд', 'Хурим', 'Баяр наадам', 'Спорт', 'Соёл', 'Хөгжим', 'Марафон', 'Хурал, уулзалт'];

const fallbackPhotographers = [
  { id: 1, name: 'Б. Мөнхбаяр', specialty: 'Хурим, Портрет', rating: 4.9, reviews: 124, price: '₮150,000', image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&h=400&fit=crop', cover: 'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800&h=400&fit=crop' },
  { id: 2, name: 'Д. Энхтуяа', specialty: 'Байгаль, Аялал', rating: 4.8, reviews: 89, price: '₮120,000', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop', cover: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&h=400&fit=crop' },
  { id: 3, name: 'Г. Батбаяр', specialty: 'Спорт, Арга хэмжээ', rating: 4.7, reviews: 67, price: '₮100,000', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop', cover: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&h=400&fit=crop' },
  { id: 4, name: 'О. Номин', specialty: 'Мода, Портрет', rating: 4.9, reviews: 156, price: '₮180,000', image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop', cover: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&h=400&fit=crop' },
];

const featuredAlbums = [
  { id: 1, title: 'Зуны хурим 2024', photographer: 'Б. Мөнхбаяр', photos: 48, price: '₮25,000', image: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=600&h=400&fit=crop' },
  { id: 2, title: 'Наадам 2024', photographer: 'Г. Батбаяр', photos: 120, price: '₮15,000', image: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=600&h=400&fit=crop' },
  { id: 3, title: 'Горхи аялал', photographer: 'Д. Энхтуяа', photos: 85, price: '₮20,000', image: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&h=400&fit=crop' },
  { id: 4, title: 'Загварын шоу', photographer: 'О. Номин', photos: 200, price: '₮30,000', image: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=400&fit=crop' },
  { id: 5, title: 'Марафон 2024', photographer: 'Г. Батбаяр', photos: 300, price: '₮10,000', image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600&h=400&fit=crop' },
  { id: 6, title: 'Хөгжмийн шөнө', photographer: 'Д. Энхтуяа', photos: 95, price: '₮18,000', image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&h=400&fit=crop' },
];

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800&h=400&fit=crop';

export default function HomePage() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Бүгд');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [realPhotographers, setRealPhotographers] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    loadPhotographers();
  }, []);

  async function loadPhotographers() {
    const { data } = await supabase
      .from('photographer_profiles')
      .select('*')
      .eq('is_visible', true)
      .limit(4);
    if (data && data.length > 0) setRealPhotographers(data);
  }

  const displayPhotographers = realPhotographers.length > 0 ? realPhotographers : fallbackPhotographers;

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <header className="border-b border-white/10 sticky top-0 z-50 bg-stone-950/95 backdrop-blur-sm">
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
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(o => !o)}
                  className="flex items-center gap-2 text-stone-300 hover:text-white transition-colors bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-1.5"
                >
                  <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <span className="hidden sm:block text-sm font-medium max-w-[120px] truncate">{profile.name || profile.email}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-stone-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden z-30">
                    <div className="px-4 py-3 border-b border-white/10">
                      <p className="text-white text-sm font-medium truncate">{profile.name}</p>
                      <p className="text-stone-500 text-xs truncate">{profile.email}</p>
                    </div>
                    <div className="py-1">
                      <button onClick={() => { setDropdownOpen(false); navigate('/dashboard'); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-stone-300 hover:text-white hover:bg-white/5 transition-colors text-sm">
                        <Settings className="w-4 h-4" />Dashboard
                      </button>
                      <button onClick={() => { setDropdownOpen(false); signOut(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors text-sm">
                        <LogOut className="w-4 h-4" />Гарах
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button onClick={() => navigate('/auth/login')} className="text-stone-400 hover:text-white text-sm transition-colors px-4 py-2">Нэвтрэх</button>
                <button onClick={() => navigate('/auth/register')} className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm px-4 py-2 rounded-xl transition-colors">Бүртгүүлэх</button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative py-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Таны үйл ажиллагаа,<br />
            <span className="text-amber-400">гоёор дүрслэгдсэн</span>
          </h1>
          <p className="text-stone-400 text-lg mb-10 max-w-2xl mx-auto">
            Зурагчид, зохион байгуулагчид болон дурсамжийг холбогч платформ
          </p>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-2 flex items-center gap-3 max-w-2xl mx-auto mb-6">
            <Search className="w-5 h-5 text-stone-400 ml-3 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Нэр байршил огноо..."
              className="flex-1 bg-transparent text-white placeholder-stone-500 outline-none text-sm py-2"
            />
            <button className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">Хайх</button>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeCategory === cat ? 'bg-stone-100 text-stone-950' : 'bg-white/5 text-stone-400 hover:text-white border border-white/10'}`}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Зурагчингууд */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold">Зурагчингууд</h2>
            <button onClick={() => navigate('/listings')} className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors">
              Бүгдийг харах <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {displayPhotographers.map((p: any) => (
              <div key={p.id} onClick={() => navigate('/listings')}
                className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-amber-500/30 transition-all group cursor-pointer">
                {/* Cover зураг */}
                <div className="relative h-32 overflow-hidden">
                  <img
                    src={p.cover_url || p.cover || DEFAULT_COVER}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 to-transparent" />
                </div>
                <div className="p-4 -mt-8 relative">
                  {/* Профайл зураг */}
                  {p.avatar_url || p.image ? (
                    <img
                      src={p.avatar_url || p.image}
                      alt={p.display_name || p.name}
                      className="w-14 h-14 rounded-full border-2 border-stone-950 object-cover mb-3"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full border-2 border-stone-950 bg-stone-800 flex items-center justify-center mb-3">
                      <User className="w-6 h-6 text-stone-500" />
                    </div>
                  )}
                  <h3 className="text-white font-semibold">{p.display_name || p.name}</h3>
                  <p className="text-stone-400 text-xs mb-2">
                    {Array.isArray(p.specialties) ? p.specialties.join(', ') : p.specialty}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span className="text-white text-sm font-medium">{p.rating ?? '—'}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-3 text-stone-500">
                    {p.phone && <button onClick={e => e.stopPropagation()} className="hover:text-white transition-colors"><Phone className="w-3.5 h-3.5" /></button>}
                    {p.instagram && <button onClick={e => e.stopPropagation()} className="hover:text-pink-400 transition-colors"><Instagram className="w-3.5 h-3.5" /></button>}
                    {p.facebook && <button onClick={e => e.stopPropagation()} className="hover:text-blue-400 transition-colors"><Facebook className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Цомгууд */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold">Зургийн цомгууд</h2>
            <button onClick={() => navigate('/albums')} className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors">
              Бүгдийг харах <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredAlbums.map(album => (
              <div key={album.id} onClick={() => navigate('/albums')} className="group cursor-pointer">
                <div className="relative rounded-2xl overflow-hidden mb-3 aspect-video">
                  <img src={album.image} alt={album.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                    <div>
                      <p className="text-white font-semibold text-sm">{album.title}</p>
                      <p className="text-stone-300 text-xs">{album.photographer}</p>
                    </div>
                    <div className="bg-amber-500 text-stone-950 font-bold text-xs px-2.5 py-1 rounded-lg">{album.price}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-stone-500 text-xs">
                  <Image className="w-3.5 h-3.5" />
                  <span>{album.photos} зураг</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                  <Camera className="w-5 h-5 text-stone-950" />
                </div>
                <div>
                  <span className="text-white font-bold">Zuragchin</span>
                  <span className="text-amber-400 font-bold">.mn</span>
                </div>
              </div>
              <p className="text-stone-500 text-sm leading-relaxed">Зурагчид болон зохион байгуулагчдыг холбогч Монголын тэргүүлэх платформ.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Холбоо барих</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-stone-400 text-sm"><Phone className="w-4 h-4" /><span>+976 9911-2233</span></div>
                <div className="flex items-center gap-2 text-stone-400 text-sm"><Mail className="w-4 h-4" /><span>info@zuragchin.mn</span></div>
                <div className="flex items-center gap-2 text-stone-400 text-sm"><MapPin className="w-4 h-4" /><span>Улаанбаатар, Монгол</span></div>
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Сошиал хаяг</h4>
              <div className="flex gap-3">
                <button className="w-10 h-10 bg-white/5 hover:bg-pink-500/20 border border-white/10 hover:border-pink-500/30 rounded-xl flex items-center justify-center text-stone-400 hover:text-pink-400 transition-all"><Instagram className="w-4 h-4" /></button>
                <button className="w-10 h-10 bg-white/5 hover:bg-blue-500/20 border border-white/10 hover:border-blue-500/30 rounded-xl flex items-center justify-center text-stone-400 hover:text-blue-400 transition-all"><Facebook className="w-4 h-4" /></button>
                <button className="w-10 h-10 bg-white/5 hover:bg-sky-500/20 border border-white/10 hover:border-sky-500/30 rounded-xl flex items-center justify-center text-stone-400 hover:text-sky-400 transition-all"><Twitter className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 text-center text-stone-600 text-sm">
            © 2024 Zuragchin.mn — Бүх эрх хуулиар хамгаалагдсан
          </div>
        </div>
      </footer>
    </div>
  );
}
