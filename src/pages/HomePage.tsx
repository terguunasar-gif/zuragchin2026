import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Instagram, Facebook, Youtube, Music2, Phone, Mail, MapPin, ChevronRight, Star, User, ChevronDown, LogOut, Settings, Images } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchPublicAlbums, PublicAlbum } from '../lib/listing';
import PublicAlbumCard from '../components/PublicAlbumCard';
import { listVisitedAlbums, VisitedAlbum } from '../lib/visitedAlbums';
import BrandMark from '../components/BrandMark';
import { useSiteContact, normalizeUrl } from '../lib/siteContact';

const categories = ['Бүгд', 'Хурим', 'Баяр наадам', 'Спорт', 'Соёл', 'Хөгжим', 'Марафон', 'Хурал, уулзалт'];

const LOCATIONS = [
  'Бүгд байршил', 'Улаанбаатар', 'Дархан', 'Эрдэнэт', 'Баянхонгор',
  'Өвөрхангай', 'Архангай', 'Булган', 'Орхон', 'Сэлэнгэ', 'Төв',
  'Дорнод', 'Сүхбаатар', 'Хэнтий', 'Дорноговь', 'Дундговь', 'Өмнөговь',
  'Говьсүмбэр', 'Ховд', 'Баян-Өлгий', 'Увс', 'Завхан', 'Говь-Алтай', 'Хөвсгөл',
];

const fallbackPhotographers = [
  { id: 1, name: 'Б. Мөнхбаяр', specialty: 'Хурим, Портрет', rating: 4.9, image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&h=400&fit=crop', cover: 'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800&h=400&fit=crop', location: 'Улаанбаатар' },
  { id: 2, name: 'Д. Энхтуяа', specialty: 'Байгаль, Аялал', rating: 4.8, image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop', cover: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&h=400&fit=crop', location: 'Дархан' },
  { id: 3, name: 'Г. Батбаяр', specialty: 'Спорт, Арга хэмжээ', rating: 4.7, image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop', cover: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&h=400&fit=crop', location: 'Эрдэнэт' },
  { id: 4, name: 'О. Номин', specialty: 'Мода, Портрет', rating: 4.9, image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop', cover: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&h=400&fit=crop', location: 'Улаанбаатар' },
];


const DEFAULT_COVER = 'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800&h=400&fit=crop';

export default function HomePage() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLocation, setSearchLocation] = useState('Бүгд байршил');
  const [activeCategory, setActiveCategory] = useState('Бүгд');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [realPhotographers, setRealPhotographers] = useState<any[]>([]);
  const [loadingPhotographers, setLoadingPhotographers] = useState(true);
  const [publicAlbums, setPublicAlbums] = useState<PublicAlbum[]>([]);
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

  useEffect(() => { loadPhotographers(); }, []);
  useEffect(() => { fetchPublicAlbums({ limit: 6 }).then(setPublicAlbums).catch(() => setPublicAlbums([])); }, []);

  async function loadPhotographers() {
    setLoadingPhotographers(true);
    const { data, error } = await supabase
      .from('photographer_profiles')
      .select('*')
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .limit(8);
    if (!error && data && data.length > 0) setRealPhotographers(data);
    setLoadingPhotographers(false);
  }

  function handleSearch() {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (activeCategory !== 'Бүгд') params.set('cat', activeCategory);
    if (searchLocation !== 'Бүгд байршил') params.set('loc', searchLocation);
    navigate(`/photographers?${params.toString()}`);
  }

  // Filter for homepage preview
  const displayPhotographers = (() => {
    const base = realPhotographers.length > 0 ? realPhotographers : fallbackPhotographers;
    return base.slice(0, 4);
  })();

  return (
    <div className="min-h-screen bg-stone-950 text-white">

      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 z-50 bg-stone-950/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <BrandMark className="w-8 h-8 flex-shrink-0" />
            <div>
              <span className="font-brand text-white font-semibold tracking-tight">Zuragchin</span>
              <span className="font-brand text-amber-400 font-semibold">.mn</span>
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
                        <Settings className="w-4 h-4" /> Dashboard
                      </button>
                      <button onClick={() => { setDropdownOpen(false); signOut(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors text-sm">
                        <LogOut className="w-4 h-4" /> Гарах
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
        {/* «Таны цомог» — өмнө нь линкээр орсон цомог руу буцах (толгой хэсэгтэй хамт дэлгэцэнд үлдэнэ) */}
        <MyAlbumsBar />
      </header>

      {/* Hero */}
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

          {/* Search box — name + location + button */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-2 flex flex-col sm:flex-row items-stretch gap-2 max-w-2xl mx-auto mb-4">
            {/* Name search */}
            <div className="flex items-center gap-2 flex-1 px-3">
              <Search className="w-4 h-4 text-stone-400 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Нэр эсвэл чиглэлээр хайх..."
                className="flex-1 bg-transparent text-white placeholder-stone-500 outline-none text-sm py-2"
              />
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px bg-white/10 my-1" />

            {/* Location dropdown */}
            <div className="relative flex items-center px-2">
              <MapPin className="absolute left-4 w-4 h-4 text-stone-400 pointer-events-none" />
              <select
                value={searchLocation}
                onChange={e => setSearchLocation(e.target.value)}
                className="bg-transparent text-stone-300 pl-8 pr-3 py-2 outline-none text-sm appearance-none cursor-pointer min-w-[150px]"
              >
                {LOCATIONS.map(loc => (
                  <option key={loc} value={loc} className="bg-stone-900 text-white">{loc}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSearch}
              className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm whitespace-nowrap"
            >
              Хайх
            </button>
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeCategory === cat
                    ? 'bg-stone-100 text-stone-950'
                    : 'bg-white/5 text-stone-400 hover:text-white border border-white/10'
                }`}
              >
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
            <button
              onClick={() => navigate('/photographers')}
              className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
            >
              Бүгдийг харах <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {loadingPhotographers ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {displayPhotographers.map((p: any) => (
                <div
                  key={p.id}
                  onClick={() => navigate('/photographers')}
                  className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-amber-500/30 transition-all group cursor-pointer"
                >
                  {/* Cover */}
                  <div className="relative h-32 overflow-hidden bg-stone-900">
                    <img
                      src={p.cover_url || p.cover || DEFAULT_COVER}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={e => { (e.target as HTMLImageElement).src = DEFAULT_COVER; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 to-transparent" />
                  </div>

                  <div className="p-4 -mt-8 relative">
                    {/* Avatar */}
                    {p.avatar_url || p.image ? (
                      <img
                        src={p.avatar_url || p.image}
                        alt={p.display_name || p.name}
                        className="w-14 h-14 rounded-full border-2 border-stone-950 object-cover mb-3"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full border-2 border-stone-950 bg-stone-800 flex items-center justify-center mb-3">
                        <User className="w-6 h-6 text-stone-500" />
                      </div>
                    )}

                    <h3 className="text-white font-semibold">{p.display_name || p.name}</h3>
                    <p className="text-stone-400 text-xs mb-2 line-clamp-1">
                      {Array.isArray(p.specialties) ? p.specialties.join(', ') : (p.specialty || '—')}
                    </p>

                    {/* Location — одны дээд хэсэгт */}
                    {(p.location) && (
                      <div className="flex items-center gap-1 text-stone-500 text-xs mb-1.5">
                        <MapPin className="w-3 h-3 text-amber-500/70 flex-shrink-0" />
                        <span>{p.location}</span>
                      </div>
                    )}

                    {/* Rating */}
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span className="text-white text-sm font-medium">{p.rating ?? '—'}</span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-3 text-stone-500">
                      {p.phone && (
                        <button onClick={e => e.stopPropagation()} className="hover:text-white transition-colors">
                          <Phone className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {p.instagram && (
                        <button onClick={e => e.stopPropagation()} className="hover:text-pink-400 transition-colors">
                          <Instagram className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {p.facebook && (
                        <button onClick={e => e.stopPropagation()} className="hover:text-blue-400 transition-colors">
                          <Facebook className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Цомгууд — зөвхөн төлбөртэй нийтлэгдсэн жинхэнэ цомгууд */}
      {publicAlbums.length > 0 && (
        <section className="py-16 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold">Зургийн цомгууд</h2>
              <button onClick={() => navigate('/explore')} className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors">
                Бүгдийг харах <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicAlbums.map(album => <PublicAlbumCard key={album.id} album={album} />)}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <BrandMark className="w-8 h-8 flex-shrink-0" />
                <div>
                  <span className="font-brand text-white font-semibold tracking-tight">Zuragchin</span>
                  <span className="font-brand text-amber-400 font-semibold">.mn</span>
                </div>
              </div>
              <p className="text-stone-500 text-sm leading-relaxed">Зурагчид болон зохион байгуулагчдыг холбогч Монголын тэргүүлэх платформ.</p>
            </div>
            <FooterContact />
          </div>
          <div className="border-t border-white/10 pt-6 text-center text-stone-600 text-sm">
            © {new Date().getFullYear()} Zuragchin.mn — Бүх эрх хуулиар хамгаалагдсан
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Энэ төхөөрөмжөөс үзсэн цомгууд руу буцах товч (нүүр хуудасны толгой хэсэгт) */
function MyAlbumsBar() {
  const navigate = useNavigate();
  const [albums] = useState<VisitedAlbum[]>(() => listVisitedAlbums());
  const [open, setOpen] = useState(false);
  if (albums.length === 0) return null;
  const last = albums[0];
  return (
    <div className="border-t border-white/5 bg-stone-950/95">
      <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-end gap-2 relative">
        <button onClick={() => navigate(`/album/${last.link}`)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-semibold text-sm pl-1.5 pr-3 py-1.5 rounded-xl transition-colors min-w-0 max-w-[75vw]">
          {last.cover
            ? <img src={last.cover} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
            : <Images className="w-5 h-5 flex-shrink-0 ml-1" />}
          <span className="flex-shrink-0">Таны цомог</span>
          <span className="font-normal truncate hidden sm:inline">· {last.name}</span>
        </button>
        {albums.length > 1 && (
          <button onClick={() => setOpen(o => !o)} title="Бусад цомог"
            className="w-9 h-9 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-stone-300">
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
        {open && (
          <div className="absolute right-6 top-full mt-1 w-72 max-w-[calc(100vw-3rem)] bg-stone-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden z-50">
            {albums.map(a => (
              <button key={a.id} onClick={() => { setOpen(false); navigate(`/album/${a.link}`); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-left">
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

/** Нүүр хуудасны доод хэсгийн холбоо барих мэдээлэл — Админ → Платформ хэсгээс засна */
function FooterContact() {
  const c = useSiteContact();
  const socials = [
    { url: c.social_facebook, icon: <Facebook className="w-4 h-4" />, label: 'Facebook', cls: 'hover:bg-blue-500/20 hover:border-blue-500/30 hover:text-blue-400' },
    { url: c.social_instagram, icon: <Instagram className="w-4 h-4" />, label: 'Instagram', cls: 'hover:bg-pink-500/20 hover:border-pink-500/30 hover:text-pink-400' },
    { url: c.social_tiktok, icon: <Music2 className="w-4 h-4" />, label: 'TikTok', cls: 'hover:bg-white/15 hover:border-white/30 hover:text-white' },
    { url: c.social_youtube, icon: <Youtube className="w-4 h-4" />, label: 'YouTube', cls: 'hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400' },
  ].filter(s => !!s.url);
  const phoneHref = c.contact_phone ? 'tel:' + c.contact_phone.replace(/[^\d+]/g, '') : '';
  return (
    <>
      <div>
        <h4 className="text-white font-semibold mb-4">Холбоо барих</h4>
        <div className="space-y-2">
          {c.contact_phone && (
            <a href={phoneHref} className="flex items-center gap-2 text-stone-400 hover:text-white text-sm"><Phone className="w-4 h-4" /><span>{c.contact_phone}</span></a>
          )}
          {c.contact_email && (
            <a href={`mailto:${c.contact_email}`} className="flex items-center gap-2 text-stone-400 hover:text-white text-sm"><Mail className="w-4 h-4" /><span>{c.contact_email}</span></a>
          )}
          <div className="flex items-center gap-2 text-stone-400 text-sm"><MapPin className="w-4 h-4" /><span>{c.contact_address || 'Улаанбаатар, Монгол'}</span></div>
        </div>
      </div>
      {socials.length > 0 && (
        <div>
          <h4 className="text-white font-semibold mb-4">Сошиал хаяг</h4>
          <div className="flex gap-3">
            {socials.map(s => (
              <a key={s.label} href={normalizeUrl(s.url!)} target="_blank" rel="noopener noreferrer" title={s.label} aria-label={s.label}
                className={`w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-stone-400 transition-all ${s.cls}`}>
                {s.icon}
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
