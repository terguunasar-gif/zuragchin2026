import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Crosshair, LocateFixed, MapPin, Search, Store, X } from 'lucide-react';
import SearchMap from '../components/map/SearchMap';
import StudioChrome from '../components/StudioChrome';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_RADIUS_METERS,
  DEFAULT_STUDIO_COVER,
  fetchPublicStudios,
  filterStudios,
  formatDistance,
  hasCoordinates,
  nearestRadius,
  RADIUS_STOPS,
  radiusLabel,
  readMapOrigin,
  requestCurrentPosition,
  STUDIO_SPECIALTIES,
  studioPlace,
  type Studio,
} from '../lib/studios';

export default function StudiosPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [studios, setStudios] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const [mapOpen, setMapOpen] = useState(true);
  const [flyNonce, setFlyNonce] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  const search = searchParams.get('q') ?? '';
  const tagParam = searchParams.get('tag');
  const specialty = tagParam && STUDIO_SPECIALTIES.includes(tagParam) ? tagParam : 'Бүгд';
  const latParam = searchParams.get('lat');
  const lngParam = searchParams.get('lng');
  const origin = useMemo(() => readMapOrigin(latParam, lngParam), [latParam, lngParam]);
  const radiusMeters = nearestRadius(Number(searchParams.get('r')) || DEFAULT_RADIUS_METERS);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPublicStudios()
      .then(rows => { if (!cancelled) { setStudios(rows); setError(''); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Студи ачааллахад алдаа гарлаа'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace: true });
  }

  const hits = useMemo(
    () => filterStudios(studios, { q: search, specialty, origin, radiusMeters }),
    [studios, search, specialty, origin, radiusMeters],
  );

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
      updateParams({
        lat: pos.lat.toFixed(6),
        lng: pos.lng.toFixed(6),
        r: String(radiusMeters),
      });
      setFlyNonce(n => n + 1);
      setMapOpen(true);
    } catch (err) {
      setLocateError(err instanceof Error ? err.message : 'Байршил авах боломжгүй.');
    } finally {
      setLocating(false);
    }
  }

  function clearLocation() {
    updateParams({ lat: null, lng: null });
    setLocateError('');
  }

  const radiusIndex = Math.max(0, RADIUS_STOPS.findIndex(stop => stop.meters === radiusMeters));
  const radiusPct = (radiusIndex / (RADIUS_STOPS.length - 1)) * 100;

  return (
    <StudioChrome>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-white text-3xl font-bold mb-1">Хайлтын үр дүн</h1>
            <p className="text-stone-400 text-sm">Фото студи — байршил, радиусаар</p>
          </div>
          <button
            onClick={() => navigate(profile ? '/studios/new' : '/auth/login')}
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm px-4 py-2 rounded-xl"
          >
            <Store className="w-4 h-4" /> Студи бүртгүүлэх
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => navigate('/photographers')}
            className="px-4 py-2 rounded-full text-sm font-medium bg-white/5 text-stone-300 border border-white/10 hover:text-white"
          >
            Зурагчин
          </button>
          <span className="px-4 py-2 rounded-full text-sm font-semibold bg-amber-500 text-stone-950">Студи</span>
          {profile && (
            <button
              onClick={() => navigate('/studios/mine')}
              className="px-4 py-2 rounded-full text-sm font-medium bg-white/5 text-stone-300 border border-white/10 hover:text-white"
            >
              Миний студи
            </button>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-2 flex flex-col sm:flex-row gap-2 mb-4">
          <div className="flex items-center gap-2 flex-1 px-3">
            <Search className="w-4 h-4 text-stone-400 flex-shrink-0" />
            <input
              value={search}
              onChange={e => updateParams({ q: e.target.value || null })}
              placeholder="Нэр, чиглэл хайх..."
              className="flex-1 bg-transparent text-white placeholder-stone-500 outline-none text-sm py-2"
            />
            {search && (
              <button onClick={() => updateParams({ q: null })} className="text-stone-500 hover:text-white" aria-label="Хайлт арилгах">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => document.getElementById('studio-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl text-sm"
          >
            Хайх
          </button>
        </div>

        <section className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 mb-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex items-center gap-2 text-white font-medium mr-auto">
              <Crosshair className="w-4 h-4 text-amber-400" />
              Байршлаар хайх
            </div>
            {origin && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                Байршил тогтоогдсон
              </span>
            )}
            <button
              onClick={locate}
              disabled={locating}
              className="inline-flex items-center gap-1.5 text-sm text-stone-200 hover:text-white disabled:opacity-60"
            >
              <LocateFixed className="w-4 h-4 text-amber-400" />
              {locating ? 'Хайж байна…' : 'Одоогийн байршил'}
            </button>
            {origin && (
              <button onClick={clearLocation} className="text-sm text-stone-400 hover:text-white">
                × Арилгах
              </button>
            )}
            <button onClick={() => setMapOpen(open => !open)} className="text-sm text-stone-400 hover:text-white">
              {mapOpen ? 'Газрын зураг хаах' : 'Газрын зураг нээх'}
            </button>
          </div>

          {mapOpen && (
            <SearchMap
              center={origin}
              radiusMeters={origin ? radiusMeters : undefined}
              markers={markers}
              flyNonce={flyNonce}
              className="h-64 sm:h-80 mb-3"
              onPick={(lat, lng) => {
                updateParams({ lat: lat.toFixed(6), lng: lng.toFixed(6), r: String(radiusMeters) });
                setLocateError('');
              }}
              onMarkerClick={id => {
                setActiveId(id);
                document.getElementById(`studio-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />
          )}

          <p className="text-stone-500 text-xs mb-4">Газрын зураг дээр дарж байршлаа тэмдэглэнэ үү</p>

          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-sm text-stone-200">Хайлтын радиус</p>
            <p className="text-sm font-medium text-amber-400">{radiusLabel(radiusMeters)}</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={RADIUS_STOPS.length - 1}
              step={1}
              value={radiusIndex}
              aria-label="Хайлтын радиус"
              onChange={e => updateParams({ r: String(RADIUS_STOPS[Number(e.target.value)].meters) })}
              className="radius-slider flex-1"
              style={{ background: `linear-gradient(to right, #f59e0b ${radiusPct}%, rgba(255,255,255,0.12) ${radiusPct}%)` }}
            />
            <button
              onClick={locate}
              disabled={locating}
              title="Одоогийн байршил"
              aria-label="Одоогийн байршил"
              className="w-12 h-12 rounded-full bg-amber-400 hover:bg-amber-300 text-stone-950 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/20 disabled:opacity-60"
            >
              <LocateFixed className="w-5 h-5" />
            </button>
          </div>
          <div className="flex justify-between text-[11px] sm:text-xs mt-1 pr-14">
            {RADIUS_STOPS.map(stop => (
              <button
                key={stop.meters}
                type="button"
                onClick={() => updateParams({ r: String(stop.meters) })}
                className={`whitespace-nowrap ${stop.meters === radiusMeters ? 'text-amber-400 font-medium' : 'text-stone-500 hover:text-stone-300'}`}
              >
                {stop.label}
              </button>
            ))}
          </div>
          {locateError && <p className="text-red-400 text-xs mt-2">{locateError}</p>}
          {!origin && <p className="text-stone-500 text-xs mt-2">Байршил сонгоогүй тул бүх батлагдсан студи харагдана. Цэг тавихад радиус доторх студи үлдэнэ.</p>}
        </section>

        <div className="flex flex-wrap gap-2 mb-5">
          {['Бүгд', ...STUDIO_SPECIALTIES].map(tag => (
            <button
              key={tag}
              onClick={() => updateParams({ tag: tag === 'Бүгд' ? null : tag })}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium ${
                specialty === tag
                  ? 'bg-amber-500 text-stone-950'
                  : 'bg-white/5 text-stone-400 hover:text-white border border-white/10'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div id="studio-results" className="scroll-mt-24">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <p className="text-white font-medium mb-1">Студи ачааллахад алдаа гарлаа</p>
              <p className="text-stone-500 text-sm">{error}</p>
            </div>
          ) : hits.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
              <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Store className="w-7 h-7 text-stone-500" />
              </div>
              <p className="text-white font-medium mb-1">Студи олдсонгүй</p>
              <p className="text-stone-500 text-sm">
                {origin ? 'Энэ радиус дотор студи алга. Радиусаа томруулж эсвэл өөр цэг сонгоно уу.' : 'Хайлт эсвэл чиглэлээ өөрчилж үзнэ үү.'}
              </p>
            </div>
          ) : (
            <>
              <p className="text-stone-400 text-sm mb-4">{hits.length} студи олдлоо</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {hits.map(studio => {
                  const place = studioPlace(studio);
                  return (
                    <article
                      id={`studio-${studio.id}`}
                      key={studio.id}
                      onClick={() => navigate(`/studios/${studio.slug}`)}
                      className={`bg-white/5 border rounded-2xl overflow-hidden cursor-pointer transition-colors ${
                        activeId === studio.id ? 'border-amber-400/60' : 'border-white/10 hover:border-amber-500/30'
                      }`}
                    >
                      <div className="relative h-32 bg-stone-900">
                        <img
                          src={studio.cover_url || DEFAULT_STUDIO_COVER}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).src = DEFAULT_STUDIO_COVER; }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 to-transparent" />
                        {studio.distanceMeters != null && (
                          <span className="absolute top-2 right-2 text-xs bg-black/60 text-amber-300 px-2 py-1 rounded-lg">
                            {formatDistance(studio.distanceMeters)}
                          </span>
                        )}
                      </div>
                      <div className="p-4 -mt-7 relative flex gap-3">
                        {studio.logo_url ? (
                          <img src={studio.logo_url} alt="" className="w-12 h-12 rounded-xl border-2 border-stone-950 object-cover bg-stone-800" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl border-2 border-stone-950 bg-stone-800 flex items-center justify-center">
                            <Store className="w-5 h-5 text-stone-500" />
                          </div>
                        )}
                        <div className="min-w-0 pt-1">
                          <h2 className="text-white font-semibold leading-tight">{studio.name}</h2>
                          <p className="text-stone-400 text-xs mt-1 line-clamp-1">
                            {studio.specialties.length > 0 ? studio.specialties.join(', ') : 'Чиглэл тодорхойгүй'}
                          </p>
                          {place && (
                            <p className="flex items-center gap-1 text-stone-500 text-xs mt-1.5">
                              <MapPin className="w-3 h-3 text-amber-500/80 flex-shrink-0" />
                              <span className="truncate">{place}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </StudioChrome>
  );
}
