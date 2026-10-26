import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocateFixed, MapPin, Search, Store } from 'lucide-react';
import SearchMap from '../map/SearchMap';
import { useAuth } from '../../contexts/AuthContext';
import {
  DEFAULT_STUDIO_COVER,
  fetchPublicStudios,
  filterStudios,
  formatDistance,
  hasCoordinates,
  requestCurrentPosition,
  studioPlace,
  type Studio,
} from '../../lib/studios';

/** Нүүр хуудасны радиус — макетийн 1км / 3км / 5км / Бүгд. /studios хуудас өөрийн RADIUS_STOPS-оо хадгална. */
const HOME_RADIUS = [
  { meters: 1000, label: '1км' },
  { meters: 3000, label: '3км' },
  { meters: 5000, label: '5км' },
  { meters: Number.POSITIVE_INFINITY, label: 'Бүгд' },
] as const;

interface Props {
  /** Hero хайлтын нэр — «Нэрээр хайх» таб руу шилжүүлнэ */
  heroQuery: string;
  /** Hero хайлтын хот/дүүрэг */
  heroPlace: string;
}

/**
 * Макетийн 3–4-р хэсэг: ойр орчмын газрын зураг + студийн хэвтээ картууд.
 * Шүүлт нь /studios-той ижил fetchPublicStudios / filterStudios / SearchMap дээр сууна.
 */
export default function HomeStudiosSections({ heroQuery, heroPlace }: Props) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [studios, setStudios] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'place' | 'name'>('place');
  const [nameQuery, setNameQuery] = useState('');
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusIndex, setRadiusIndex] = useState(1);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const [flyNonce, setFlyNonce] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  const radiusMeters = HOME_RADIUS[radiusIndex].meters;
  const radiusPct = (radiusIndex / (HOME_RADIUS.length - 1)) * 100;
  const placeLabel = heroPlace && heroPlace !== 'Бүгд байршил' ? heroPlace : '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPublicStudios()
      .then(rows => { if (!cancelled) { setStudios(rows); setError(''); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Студи ачааллахад алдаа гарлаа'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setNameQuery(heroQuery);
  }, [heroQuery]);

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(`home-studio-${activeId}`)?.scrollIntoView({
      behavior: 'smooth', inline: 'center', block: 'nearest',
    });
  }, [activeId]);

  const hits = useMemo(() => {
    const geo = mode === 'place';
    let rows = filterStudios(studios, {
      q: mode === 'name' ? nameQuery : heroQuery,
      specialty: 'Бүгд',
      origin: geo ? origin : null,
      radiusMeters: geo ? radiusMeters : Number.POSITIVE_INFINITY,
    });
    if (placeLabel) {
      const needle = placeLabel.toLowerCase();
      rows = rows.filter(studio =>
        `${studio.city} ${studio.district} ${studio.address}`.toLowerCase().includes(needle),
      );
    }
    return rows;
  }, [studios, mode, nameQuery, heroQuery, origin, radiusMeters, placeLabel]);

  const markers = hits.filter(hasCoordinates).map(studio => ({
    id: studio.id,
    lat: studio.latitude,
    lng: studio.longitude,
  }));

  async function locate() {
    setLocating(true);
    setLocateError('');
    try {
      const pos = await requestCurrentPosition();
      setOrigin(pos);
      setMode('place');
      setFlyNonce(n => n + 1);
    } catch (err) {
      setLocateError(err instanceof Error ? err.message : 'Байршил авах боломжгүй.');
    } finally {
      setLocating(false);
    }
  }

  function openAllStudios() {
    const params = new URLSearchParams();
    if (mode === 'name' && nameQuery.trim()) params.set('q', nameQuery.trim());
    else if (placeLabel) params.set('q', placeLabel);
    if (mode === 'place' && origin) {
      params.set('lat', origin.lat.toFixed(6));
      params.set('lng', origin.lng.toFixed(6));
      // /studios has no «Бүгд» stop; send its widest radius so the pin is not snapped back to 2км.
      params.set('r', String(Number.isFinite(radiusMeters) ? radiusMeters : 10000));
    }
    const qs = params.toString();
    navigate(qs ? `/studios?${qs}` : '/studios');
  }

  return (
    <>
      <section id="near-places" className="scroll-mt-20 px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="leading-tight">
            <span className="block text-base sm:text-lg text-white font-medium">Өөрт хамгийн ойр</span>
            <span className="block text-lg sm:text-2xl font-extrabold tracking-wide text-amber-400">
              ГЭРЭЛ ЗУРГИЙН ГАЗАР ХАЙХ
            </span>
          </h2>

          <div className="grid grid-cols-2 gap-2 mt-4 max-w-xl">
            <button
              type="button"
              onClick={() => setMode('place')}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                mode === 'place'
                  ? 'bg-amber-500 text-stone-950'
                  : 'border border-white/15 text-stone-300 hover:text-white'
              }`}
            >
              <MapPin className="w-4 h-4" /> Байршлаар хайх
            </button>
            <button
              type="button"
              onClick={() => setMode('name')}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                mode === 'name'
                  ? 'bg-amber-500 text-stone-950'
                  : 'border border-white/15 text-stone-300 hover:text-white'
              }`}
            >
              <Search className="w-4 h-4" /> Нэрээр хайх
            </button>
          </div>

          {mode === 'place' ? (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
                <button
                  type="button"
                  onClick={locate}
                  disabled={locating}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-400 hover:text-amber-300 disabled:opacity-60"
                >
                  <LocateFixed className="w-4 h-4" />
                  {locating ? 'Хайж байна…' : 'Одоогийн байршил'}
                </button>
                {origin && (
                  <>
                    <span className="text-xs font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      Байршил тогтоогдсон
                    </span>
                    <button type="button" onClick={() => setOrigin(null)} className="text-sm text-stone-400 hover:text-white">
                      Арилгах
                    </button>
                  </>
                )}
              </div>

              <SearchMap
                center={origin}
                radiusMeters={origin && Number.isFinite(radiusMeters) ? radiusMeters : undefined}
                markers={markers}
                flyNonce={flyNonce}
                className="h-56 sm:h-80"
                onPick={(lat, lng) => {
                  setOrigin({ lat, lng });
                  setLocateError('');
                }}
                onMarkerClick={id => setActiveId(id)}
              />
              <p className="text-stone-500 text-xs mt-2">Газрын зураг дээр дарж байршлаа тэмдэглэнэ үү</p>

              <div className="mt-4 max-w-xl">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-sm text-stone-200">Хайлтын радиус</p>
                  <p className="text-sm font-medium text-amber-400">{HOME_RADIUS[radiusIndex].label}</p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={HOME_RADIUS.length - 1}
                  step={1}
                  value={radiusIndex}
                  aria-label="Хайлтын радиус"
                  onChange={e => setRadiusIndex(Number(e.target.value))}
                  className="radius-slider w-full"
                  style={{ background: `linear-gradient(to right, #f59e0b ${radiusPct}%, rgba(255,255,255,0.12) ${radiusPct}%)` }}
                />
                <div className="flex justify-between text-xs mt-2">
                  {HOME_RADIUS.map((stop, index) => (
                    <button
                      key={stop.label}
                      type="button"
                      onClick={() => setRadiusIndex(index)}
                      className={index === radiusIndex ? 'text-amber-400 font-medium' : 'text-stone-500 hover:text-stone-300'}
                    >
                      {stop.label}
                    </button>
                  ))}
                </div>
              </div>
              {locateError && <p className="text-red-400 text-xs mt-2">{locateError}</p>}
              {!origin && Number.isFinite(radiusMeters) && (
                <p className="text-stone-500 text-xs mt-2">
                  Байршил сонгоогүй тул бүх батлагдсан студи харагдана. Цэг тавихад радиус доторх студи үлдэнэ.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3 max-w-xl">
              <label className="flex items-center gap-2 rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3 focus-within:border-amber-500/50">
                <Search className="w-4 h-4 text-stone-400 flex-shrink-0" />
                <input
                  value={nameQuery}
                  onChange={e => setNameQuery(e.target.value)}
                  placeholder="Студи, газрын нэрээр хайх…"
                  className="flex-1 bg-transparent text-white placeholder-stone-500 outline-none text-sm"
                />
              </label>
              <p className="text-stone-500 text-xs mt-2">
                {loading ? 'Ачааллаж байна…' : `${hits.length} студи`}
              </p>
            </div>
          )}

          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>
      </section>

      <section id="studios-home" className="scroll-mt-20 px-4 sm:px-6 pb-8 sm:pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between gap-3 mb-4">
            <h2 className="text-xl sm:text-2xl font-bold">Гэрэл зургийн студи</h2>
            <button
              type="button"
              onClick={openAllStudios}
              className="text-amber-400 hover:text-amber-300 text-sm font-medium whitespace-nowrap"
            >
              Бүгдийг үзэх
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : hits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
              <Store className="w-6 h-6 text-stone-500 mx-auto mb-2" />
              <p className="text-stone-300 text-sm">Студи олдсонгүй</p>
              <p className="text-stone-500 text-xs mt-1">Радиусаа томруулж эсвэл өөр нэрээр хайна уу.</p>
            </div>
          ) : (
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {hits.map(studio => {
                const place = studioPlace(studio);
                const active = activeId === studio.id;
                return (
                  <button
                    key={studio.id}
                    id={`home-studio-${studio.id}`}
                    type="button"
                    onClick={() => navigate(`/studios/${studio.slug}`)}
                    className={`flex-shrink-0 w-40 sm:w-52 snap-start text-left rounded-2xl focus:outline-none ${
                      active ? 'ring-2 ring-amber-400' : ''
                    }`}
                  >
                    <div className="relative h-28 sm:h-36 rounded-2xl overflow-hidden border border-white/10 bg-stone-900">
                      <img
                        src={studio.cover_url || DEFAULT_STUDIO_COVER}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = DEFAULT_STUDIO_COVER; }}
                      />
                      {studio.distanceMeters != null && (
                        <span className="absolute top-2 right-2 text-[11px] bg-black/70 text-amber-300 px-1.5 py-0.5 rounded-md">
                          {formatDistance(studio.distanceMeters)}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-white line-clamp-1">{studio.name}</p>
                    <p className="text-xs text-stone-400 line-clamp-1">
                      {place || (studio.specialties[0] ?? 'Фото студи')}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate(profile ? '/studios/new' : '/auth/login')}
            className="mt-3 text-xs text-stone-500 hover:text-amber-400"
          >
            Студи бүртгүүлэх
          </button>
        </div>
      </section>
    </>
  );
}
