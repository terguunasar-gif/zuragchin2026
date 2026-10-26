import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Facebook, Instagram, MapPin, Pencil, Phone, Store } from 'lucide-react';
import SearchMap from '../components/map/SearchMap';
import StudioChrome from '../components/StudioChrome';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../seo/head';
import {
  DEFAULT_STUDIO_COVER,
  facebookHref,
  fetchStudioBySlug,
  hasCoordinates,
  instagramHref,
  isPublicStudio,
  STUDIO_STATUS_LABEL,
  studioPlace,
  type Studio,
} from '../lib/studios';

export default function StudioDetailPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [studio, setStudio] = useState<Studio | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    fetchStudioBySlug(slug)
      .then(row => {
        if (cancelled) return;
        setStudio(row);
        setMissing(!row);
      })
      .catch(() => { if (!cancelled) { setStudio(null); setMissing(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const name = studio?.name ?? '';
  const path = `/studios/${studio?.slug || slug}`;
  usePageMeta(!loading && studio ? {
    title: `${name} — Фото студи — Zuragchin.mn`,
    description: studio.description || `${name} фото студи. ${studioPlace(studio) || 'Байршил, холбоо барих'}`.trim(),
    path,
    robots: isPublicStudio(studio) ? 'index,follow' : 'noindex,nofollow',
  } : !loading && missing ? {
    title: 'Студи олдсонгүй — Zuragchin.mn',
    description: 'Энэ студийн хуудас олдсонгүй.',
    path: `/studios/${slug}`,
    robots: 'noindex,nofollow',
  } : null);

  if (loading) {
    return (
      <StudioChrome backTo="/studios" backLabel="Студи">
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
        </div>
      </StudioChrome>
    );
  }

  if (!studio) {
    return (
      <StudioChrome backTo="/studios" backLabel="Студи">
        <div className="max-w-xl mx-auto px-6 py-24 text-center">
          <Store className="w-12 h-12 text-stone-600 mx-auto mb-4" />
          <p className="text-lg font-semibold mb-2">Студи олдсонгүй</p>
          <p className="text-stone-500 text-sm mb-5">Нуусан, батлагдаагүй эсвэл буруу холбоос байж болно.</p>
          <button onClick={() => navigate('/studios')} className="text-amber-400 hover:text-amber-300 text-sm">
            Хайлт руу буцах
          </button>
        </div>
      </StudioChrome>
    );
  }

  const isOwner = !!profile && profile.id === studio.owner_user_id;
  const place = studioPlace(studio);
  const coords = hasCoordinates(studio) ? { lat: studio.latitude, lng: studio.longitude } : null;

  return (
    <StudioChrome backTo="/studios" backLabel="Студи">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {!isPublicStudio(studio) && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Энэ студи олон нийтийн хайлтад хараахан гараагүй. Төлөв: {STUDIO_STATUS_LABEL[studio.status]}
            {!studio.is_visible && studio.status === 'approved' ? ' · нуугдсан' : ''}.
          </div>
        )}

        <div className="relative rounded-2xl overflow-hidden mb-6">
          <div className="h-56 md:h-72 bg-stone-900">
            <img
              src={studio.cover_url || DEFAULT_STUDIO_COVER}
              alt=""
              className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).src = DEFAULT_STUDIO_COVER; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/30 to-transparent" />
          </div>
          <div className="absolute bottom-4 left-4 right-4 flex items-end gap-4">
            {studio.logo_url ? (
              <img src={studio.logo_url} alt="" className="w-16 h-16 rounded-2xl border-2 border-stone-950 object-cover bg-stone-800" />
            ) : (
              <div className="w-16 h-16 rounded-2xl border-2 border-stone-950 bg-stone-800 flex items-center justify-center">
                <Store className="w-7 h-7 text-stone-400" />
              </div>
            )}
            <div className="min-w-0 pb-1">
              <h1 className="text-2xl font-bold leading-tight">{studio.name}</h1>
              {place && (
                <p className="flex items-center gap-1 text-stone-300 text-sm mt-1">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" /> {place}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {isOwner && (
            <button
              onClick={() => navigate(`/studios/${studio.slug}/edit`)}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm px-4 py-2 rounded-xl"
            >
              <Pencil className="w-4 h-4" /> Засах
            </button>
          )}
          {studio.specialties.map(tag => (
            <button
              key={tag}
              onClick={() => navigate(`/studios?tag=${encodeURIComponent(tag)}`)}
              className="px-3 py-1.5 rounded-full text-xs bg-white/5 border border-white/10 text-stone-300 hover:text-white"
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="md:col-span-3 space-y-4">
            {studio.description && (
              <section className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h2 className="font-semibold mb-2">Танилцуулга</h2>
                <p className="text-stone-300 text-sm leading-relaxed whitespace-pre-wrap">{studio.description}</p>
              </section>
            )}
            <section className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h2 className="font-semibold mb-3">Байршил</h2>
              {studio.address && <p className="text-stone-300 text-sm mb-3">{studio.address}</p>}
              {coords ? (
                <>
                  <SearchMap center={coords} className="h-56" />
                  <a
                    href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 text-sm mt-3"
                  >
                    <MapPin className="w-4 h-4" /> Газрын зураг дээр нээх
                  </a>
                </>
              ) : (
                <p className="text-stone-500 text-sm">Газрын зургийн цэг оруулаагүй.</p>
              )}
            </section>
          </div>

          <aside className="md:col-span-2">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h2 className="font-semibold mb-4">Холбоо барих</h2>
              <div className="space-y-3">
                {studio.phone && (
                  <a href={`tel:${studio.phone}`} className="flex items-center gap-3 hover:bg-white/5 rounded-xl p-1 -m-1">
                    <span className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center"><Phone className="w-4 h-4 text-stone-300" /></span>
                    <span>
                      <span className="block text-stone-500 text-xs">Утас</span>
                      <span className="text-sm">{studio.phone}</span>
                    </span>
                  </a>
                )}
                {studio.instagram && (
                  <a href={instagramHref(studio.instagram)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:bg-white/5 rounded-xl p-1 -m-1">
                    <span className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center"><Instagram className="w-4 h-4 text-pink-400" /></span>
                    <span className="min-w-0">
                      <span className="block text-stone-500 text-xs">Instagram</span>
                      <span className="text-sm truncate block">{studio.instagram}</span>
                    </span>
                  </a>
                )}
                {studio.facebook && (
                  <a href={facebookHref(studio.facebook)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:bg-white/5 rounded-xl p-1 -m-1">
                    <span className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center"><Facebook className="w-4 h-4 text-blue-400" /></span>
                    <span className="min-w-0">
                      <span className="block text-stone-500 text-xs">Facebook</span>
                      <span className="text-sm truncate block">{studio.facebook}</span>
                    </span>
                  </a>
                )}
                {!studio.phone && !studio.instagram && !studio.facebook && (
                  <p className="text-stone-500 text-sm">Холбоо барих мэдээлэл байхгүй</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </StudioChrome>
  );
}
