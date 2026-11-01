import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search, Star, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import HomeAlbumsSection from '../components/HomeAlbumsSection';
import AiBoothShowcase from '../components/AiBoothShowcase';
import AiVideoShowcase from '../components/AiVideoShowcase';
import HomeHeader from '../components/home/HomeHeader';
import HomeStudiosSections from '../components/home/HomeStudiosSections';
import HomeFooter from '../components/home/HomeFooter';

/** Профайл дээрх чиглэлтэй таарна — шүүлт бодит өгөгдөл дээр ажиллана */
const CATEGORIES = ['Бүгд', 'Хурим', 'Баяр наадам', 'Спорт', 'Соёл', 'Хөгжим', 'Марафон', 'Хурал', 'Портрет', 'Байгаль', 'Мода'];

const CITIES = [
  'Улаанбаатар', 'Дархан', 'Эрдэнэт', 'Баянхонгор',
  'Өвөрхангай', 'Архангай', 'Булган', 'Орхон', 'Сэлэнгэ', 'Төв',
  'Дорнод', 'Сүхбаатар', 'Хэнтий', 'Дорноговь', 'Дундговь', 'Өмнөговь',
  'Говьсүмбэр', 'Ховд', 'Баян-Өлгий', 'Увс', 'Завхан', 'Говь-Алтай', 'Хөвсгөл',
];

const DISTRICTS = [
  'Баянгол', 'Баянзүрх', 'Хан-Уул', 'Чингэлтэй',
  'Сонгинохайрхан', 'Налайх', 'Багануур', 'Багахангай',
];

const ALL_PLACES = 'Бүгд байршил';

const fallbackPhotographers = [
  { id: 'fallback-1', name: 'Б. Мөнхбаяр', specialty: 'Хурим, Портрет', rating: 4.9, image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&h=400&fit=crop', location: 'Улаанбаатар', real: false },
  { id: 'fallback-2', name: 'Д. Энхтуяа', specialty: 'Байгаль, Аялал', rating: 4.8, image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop', location: 'Дархан', real: false },
  { id: 'fallback-3', name: 'Г. Батбаяр', specialty: 'Спорт, Арга хэмжээ', rating: 4.7, image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop', location: 'Эрдэнэт', real: false },
  { id: 'fallback-4', name: 'О. Номин', specialty: 'Мода, Портрет', rating: 4.9, image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop', location: 'Улаанбаатар', real: false },
];

interface PhotographerCard {
  id: string;
  name: string;
  specialty: string;
  rating: number | null;
  image: string | null;
  location: string;
  real: boolean;
}

function normalizePhotographer(row: Record<string, unknown>): PhotographerCard {
  const specialties = Array.isArray(row.specialties) ? row.specialties.filter((s): s is string => typeof s === 'string') : [];
  const rating = typeof row.rating === 'number' ? row.rating : null;
  return {
    id: String(row.id ?? ''),
    name: String(row.display_name || row.name || 'Нэргүй'),
    specialty: specialties.join(', '),
    rating,
    image: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    location: typeof row.location === 'string' ? row.location : '',
    real: true,
  };
}

/**
 * Нүүр хуудас — гар утасны макетийн дараалал:
 * толгой, хайлт, ойр орчмын газар, студи, зурагчид, цомог, AI загвар, видео, хөл.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const [draftQuery, setDraftQuery] = useState('');
  const [draftPlace, setDraftPlace] = useState(ALL_PLACES);
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState(ALL_PLACES);
  const [activeCategory, setActiveCategory] = useState('Бүгд');
  const [photographers, setPhotographers] = useState<PhotographerCard[]>([]);
  const [loadingPhotographers, setLoadingPhotographers] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('photographer_profiles')
          .select('*')
          .eq('is_visible', true)
          .order('created_at', { ascending: false })
          .limit(24);
        if (cancelled) return;
        if (!error && data && data.length > 0) {
          setPhotographers(data.map(row => normalizePhotographer(row as Record<string, unknown>)));
        }
      } finally {
        if (!cancelled) setLoadingPhotographers(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleSearch(e?: FormEvent) {
    e?.preventDefault();
    const nextQuery = draftQuery.trim();
    setQuery(nextQuery);
    setPlace(draftPlace);
    document.getElementById('near-places')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openPhotographers() {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (place !== ALL_PLACES) params.set('loc', place);
    if (activeCategory !== 'Бүгд') params.set('cat', activeCategory);
    const qs = params.toString();
    navigate(qs ? `/photographers?${qs}` : '/photographers');
  }

  const source = photographers.length > 0 ? photographers : (!loadingPhotographers ? fallbackPhotographers : []);
  const needle = query.toLowerCase();
  const visiblePhotographers = source.filter(p => {
    const catOk = activeCategory === 'Бүгд' || p.specialty.toLowerCase().includes(activeCategory.toLowerCase());
    const placeOk = place === ALL_PLACES || p.location.toLowerCase().includes(place.toLowerCase());
    const queryOk = !needle
      || p.name.toLowerCase().includes(needle)
      || p.specialty.toLowerCase().includes(needle)
      || p.location.toLowerCase().includes(needle);
    return catOk && placeOk && queryOk;
  }).slice(0, 16);

  const filtering = Boolean(query || place !== ALL_PLACES || activeCategory !== 'Бүгд');

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <HomeHeader />

      <section className="px-4 sm:px-6 pt-8 pb-4 sm:pt-14 sm:pb-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-[2.05rem] leading-[1.12] sm:text-5xl md:text-6xl font-extrabold tracking-tight">
            Гэрэл зургаараа<br />
            ашиг олох{' '}
            <br className="md:hidden" />
            <span className="text-amber-400">шинэ боломж</span>
          </h1>
          <p className="mt-3 text-stone-400 text-sm sm:text-base max-w-xl">
            Зурагчид, зохион байгуулагчид болон дурсамжийг холбогч платформ
          </p>

          <form onSubmit={handleSearch} className="mt-6 flex flex-col gap-3 md:grid md:grid-cols-2">
            <label className="block rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3 focus-within:border-amber-500/50">
              <span className="flex items-center gap-1.5 text-xs text-stone-500">
                <Search className="w-3.5 h-3.5 text-amber-400" /> Сэдэв, студи, зурагчин
              </span>
              <input
                value={draftQuery}
                onChange={e => setDraftQuery(e.target.value)}
                placeholder="Юу хайж байна?"
                className="mt-1 w-full bg-transparent text-white text-base font-medium placeholder-stone-400 outline-none"
              />
            </label>
            <label className="block rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3 focus-within:border-amber-500/50">
              <span className="flex items-center gap-1.5 text-xs text-stone-500">
                <MapPin className="w-3.5 h-3.5 text-amber-400" /> Хот, дүүрэг
              </span>
              <select
                value={draftPlace}
                onChange={e => setDraftPlace(e.target.value)}
                aria-label="Хот, дүүрэг"
                className="mt-1 w-full bg-transparent text-white text-base font-medium outline-none"
              >
                <option value={ALL_PLACES} className="bg-stone-900">Хаана?</option>
                <optgroup label="Хот" className="bg-stone-900">
                  {CITIES.map(city => <option key={city} value={city}>{city}</option>)}
                </optgroup>
                <optgroup label="Дүүрэг" className="bg-stone-900">
                  {DISTRICTS.map(district => <option key={district} value={district}>{district}</option>)}
                </optgroup>
              </select>
            </label>
            <button
              type="submit"
              className="md:col-span-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-base py-3.5 rounded-2xl transition-colors"
            >
              Хайх
            </button>
          </form>
          {filtering && (
            <button
              type="button"
              onClick={() => { setQuery(''); setPlace(ALL_PLACES); setDraftQuery(''); setDraftPlace(ALL_PLACES); setActiveCategory('Бүгд'); }}
              className="mt-3 text-xs text-stone-500 hover:text-white"
            >
              Хайлт арилгах
            </button>
          )}
        </div>
      </section>

      <HomeStudiosSections heroQuery={query} heroPlace={place} />

      <section id="photographers" className="scroll-mt-20 px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between gap-3 mb-4">
            <h2 className="text-xl sm:text-2xl font-bold">Гэрэл зурагчид</h2>
            <button
              type="button"
              onClick={openPhotographers}
              className="text-amber-400 hover:text-amber-300 text-sm font-medium whitespace-nowrap"
            >
              Бүгдийг үзэх
            </button>
          </div>

          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium ${
                  activeCategory === cat
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-white/5 text-stone-300 border border-white/10 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {loadingPhotographers ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : visiblePhotographers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
              <p className="text-stone-300 text-sm">Зурагчин олдсонгүй</p>
              <button type="button" onClick={openPhotographers} className="mt-2 text-amber-400 text-sm">
                Бүтэн жагсаалт
              </button>
            </div>
          ) : (
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visiblePhotographers.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(p.real ? `/photographers/${p.id}` : '/photographers')}
                  className="flex-shrink-0 w-[5.75rem] sm:w-24 text-center group"
                >
                  <div className="mx-auto w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-white/10 bg-stone-800 group-hover:border-amber-400 transition-colors">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center">
                        <User className="w-6 h-6 text-stone-500" />
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-medium text-white leading-tight line-clamp-2">{p.name}</p>
                  {p.rating != null && (
                    <p className="mt-0.5 text-[11px] text-amber-400 flex items-center justify-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-400" /> {p.rating}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <HomeAlbumsSection />
      <AiBoothShowcase />
      <AiVideoShowcase />
      <HomeFooter />
    </div>
  );
}
