import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Clapperboard, Play, Sparkles, X } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { publicDb } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Tpl {
  id: string; slug: string; name: string; description: string; emoji: string;
  sample_video_url: string; preview_url: string; tags: string; style?: 'action' | 'glam';
}

type Filter = 'all' | 'glam' | 'action';

/** Цомгийн AI видеоны бүх загвар — нүүр хуудасны «AI видео» хэсгээс орно. ?t=<slug|id> бол тэр загварыг шууд нээнэ. */
export default function AiVideoTemplatesPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState(10000);
  const [filter, setFilter] = useState<Filter>('all');
  const [viewId, setViewId] = useState<string | null>(null);

  useEffect(() => {
    // style багана (update-84) байхгүй хуучин DB-д ч ажиллана
    publicDb.from('ai_video_templates')
      .select('id, slug, name, description, emoji, sample_video_url, preview_url, tags, style')
      .eq('is_active', true).order('sort_order', { ascending: true })
      .then(async ({ data, error }) => {
        let rows = (data ?? []) as Tpl[];
        if (error) {
          const r = await publicDb.from('ai_video_templates')
            .select('id, slug, name, description, emoji, sample_video_url, preview_url, tags')
            .eq('is_active', true).order('sort_order', { ascending: true });
          rows = (r.data ?? []) as Tpl[];
        }
        setTemplates(rows);
        setLoading(false);
        const want = new URLSearchParams(window.location.search).get('t');
        const hit = want ? rows.find(t => t.slug === want || t.id === want) : undefined;
        if (hit) setViewId(hit.id);
      });
    publicDb.from('platform_settings').select('key, value').eq('key', 'album_video_price')
      .then(({ data }) => { const v = Number(data?.[0]?.value); if (v > 0) setPrice(v); });
  }, []);

  const hasGlam = templates.some(t => t.style === 'glam');
  const shown = useMemo(
    () => templates.filter(t => filter === 'all' || (filter === 'glam' ? t.style === 'glam' : t.style !== 'glam')),
    [templates, filter],
  );
  const viewIdx = viewId ? shown.findIndex(t => t.id === viewId) : -1;
  const viewing = viewIdx >= 0 ? shown[viewIdx] : null;

  // URL-ийг сонгосон загвартай тааруулна (хуваалцах боломжтой)
  useEffect(() => {
    if (loading) return;
    const url = new URL(window.location.href);
    if (viewing) url.searchParams.set('t', viewing.slug || viewing.id); else url.searchParams.delete('t');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [viewing, loading]);

  useEffect(() => {
    if (!viewing) return;
    const go = (d: number) => setViewId(shown[(viewIdx + d + shown.length) % shown.length].id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewId(null);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [viewing, viewIdx, shown]);

  const start = () => navigate(profile ? '/dashboard' : '/auth/login');
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: `Бүгд ${templates.length}` },
    ...(hasGlam ? [
      { key: 'glam' as Filter, label: `✨ Glam Motion ${templates.filter(t => t.style === 'glam').length}` },
      { key: 'action' as Filter, label: `🎬 Хөгжилтэй ${templates.filter(t => t.style !== 'glam').length}` },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <header className="border-b border-white/10 sticky top-0 z-40 bg-stone-950/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-stone-400 hover:text-white" title="Нүүр хуудас"><ArrowLeft className="w-5 h-5" /></button>
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 hover:opacity-80 min-w-0">
            <BrandMark className="w-8 h-8 flex-shrink-0" />
            <span className="hidden sm:inline"><span className="font-brand text-white font-semibold tracking-tight">Zuragchin</span><span className="font-brand text-amber-400 font-semibold">.mn</span></span>
          </button>
          <span className="text-stone-600">/</span>
          <span className="text-fuchsia-300 font-semibold flex items-center gap-1.5"><Clapperboard className="w-4 h-4" /> AI видео загвар</span>
        </div>
      </header>

      <section className="relative px-4 sm:px-6 pt-10 sm:pt-14 pb-6 overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-fuchsia-600/15 blur-[130px]" />
        <div className="relative max-w-7xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-extrabold leading-[1.05] tracking-tight">
            Зургаа <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">хөдөлгөөнт видео</span> болгох загварууд
          </h1>
          <p className="text-stone-400 text-sm sm:text-base mt-3 max-w-2xl">
            Цомгийнхоо дурын зургийг сонгоод загвар дарахад AI богино видео бүтээнэ.
            {hasGlam && <> <b className="text-amber-300">✨ Glam Motion</b> — Glambot маягийн удаашруулсан кино камер, <b className="text-fuchsia-300">🎬 Хөгжилтэй</b> — зураг хөдөлгөөнд орж гайхалтай зүйл болно.</>}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button onClick={start}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-fuchsia-500 to-amber-500 hover:brightness-110 text-stone-950 font-bold px-5 py-3 rounded-2xl text-sm">
              <Clapperboard className="w-4 h-4" /> Цомгоо нээж видео бүтээх <ArrowRight className="w-4 h-4" />
            </button>
            <span className="text-stone-500 text-xs">Нэг видео ₮{price.toLocaleString()} · Цомгийн эзэн бүтээнэ · Хүүхэд орсон зурагт боломжгүй</span>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        {filters.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 mb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filters.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm border ${filter === f.key ? 'bg-white text-stone-950 border-white font-semibold' : 'border-white/15 text-stone-300 hover:bg-white/5'}`}>
                {f.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        ) : shown.length === 0 ? (
          <p className="text-stone-500 text-center py-20">Одоогоор загвар алга.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {shown.map(t => <Card key={t.id} t={t} onOpen={() => setViewId(t.id)} />)}
          </div>
        )}
      </main>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={viewing.name}>
          <div className="absolute inset-0 bg-stone-950/90 backdrop-blur-sm" onClick={() => setViewId(null)} />
          <div className="relative w-full max-w-4xl bg-stone-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[92vh]">
            <div className="relative bg-black md:w-3/5 flex items-center justify-center min-h-[240px]">
              {viewing.sample_video_url ? (
                <video key={viewing.id} src={viewing.sample_video_url} poster={viewing.preview_url || undefined}
                  autoPlay loop playsInline controls className="w-full max-h-[60vh] md:max-h-[85vh] object-contain" />
              ) : viewing.preview_url ? (
                <img src={viewing.preview_url} alt={viewing.name} className="w-full max-h-[60vh] md:max-h-[85vh] object-contain" />
              ) : (
                <div className="py-16 flex flex-col items-center gap-2 text-stone-500">
                  <span className="text-6xl" aria-hidden>{viewing.emoji}</span>
                  <span className="text-xs">Жишээ видео удахгүй</span>
                </div>
              )}
              {shown.length > 1 && (
                <>
                  <button onClick={() => setViewId(shown[(viewIdx - 1 + shown.length) % shown.length].id)} aria-label="Өмнөх"
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
                  <button onClick={() => setViewId(shown[(viewIdx + 1) % shown.length].id)} aria-label="Дараах"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"><ChevronRight className="w-5 h-5" /></button>
                </>
              )}
            </div>
            <div className="p-5 sm:p-6 md:w-2/5 flex flex-col gap-3 overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  {viewing.style === 'glam'
                    ? <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30 mb-2">✨ GLAM MOTION</span>
                    : <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-fuchsia-400/15 text-fuchsia-300 border border-fuchsia-400/30 mb-2">🎬 ХӨГЖИЛТЭЙ</span>}
                  <h2 className="text-xl sm:text-2xl font-bold">{viewing.emoji} {viewing.name}</h2>
                </div>
                <button onClick={() => setViewId(null)} className="text-stone-400 hover:text-white" aria-label="Хаах"><X className="w-6 h-6" /></button>
              </div>
              {viewing.description && <p className="text-stone-300 text-sm leading-relaxed">{viewing.description}</p>}
              {viewing.tags && (
                <div className="flex flex-wrap gap-1.5">
                  {viewing.tags.split(',').map(s => s.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-md bg-white/5 text-stone-400 border border-white/10">{tag}</span>
                  ))}
                </div>
              )}
              <ol className="text-stone-400 text-xs space-y-1 mt-1">
                <li>1. Цомгоо нээгээд зурган доорх <b className="text-stone-200">🎬 Видео үүсгэх</b> дарна</li>
                <li>2. <b className="text-stone-200">{viewing.name}</b> загварыг сонгоно</li>
                <li>3. 1–3 минутад видео цомгийн <b className="text-stone-200">AI видео</b> хавтсанд орно</li>
              </ol>
              <div className="mt-auto pt-3">
                <button onClick={start}
                  className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-fuchsia-500 to-amber-500 hover:brightness-110 text-stone-950 font-bold px-5 py-3 rounded-2xl text-sm">
                  <Sparkles className="w-4 h-4" /> Энэ загвараар бүтээх · ₮{price.toLocaleString()}
                </button>
                <p className="text-stone-500 text-[11px] text-center mt-2">{viewIdx + 1} / {shown.length}<span className="hidden sm:inline"> · ← → товчоор гүйлгэнэ</span></p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ t, onOpen }: { t: Tpl; onOpen: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.play().catch(() => {}); else el.pause(); }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <button type="button" onClick={onOpen}
      className="group text-left relative aspect-[3/4] rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-fuchsia-900/50 via-stone-900 to-amber-900/30 hover:border-fuchsia-400/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400">
      {t.sample_video_url ? (
        <video ref={ref} src={t.sample_video_url} poster={t.preview_url || undefined} muted loop playsInline preload="metadata"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      ) : t.preview_url ? (
        <img src={t.preview_url} alt={t.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pb-16">
          <span className="text-5xl group-hover:scale-110 transition-transform" aria-hidden>{t.emoji}</span>
        </div>
      )}
      <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${t.style === 'glam' ? 'bg-amber-400 text-stone-950' : 'bg-fuchsia-500 text-white'}`}>
        {t.style === 'glam' ? 'GLAM' : 'ХӨГЖИЛТЭЙ'}
      </span>
      {t.sample_video_url && <Play className="absolute top-2 right-2 w-4 h-4 text-white/90 drop-shadow" />}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950 via-stone-950/80 to-transparent p-3 pt-10">
        <p className="text-white font-bold text-sm leading-tight">{t.emoji} {t.name}</p>
        {t.description && <p className="text-stone-400 text-[11px] leading-snug mt-1 line-clamp-2">{t.description}</p>}
      </div>
    </button>
  );
}
