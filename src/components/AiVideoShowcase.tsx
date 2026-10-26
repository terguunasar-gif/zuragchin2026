import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clapperboard, Images, MonitorPlay, Play, Sparkles } from 'lucide-react';
import { publicDb } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import YouTubeAutoplay from './YouTubeAutoplay';
import { useHomeVideo } from '../lib/homeVideo';

interface Tpl { id: string; name: string; description: string; emoji: string; sample_video_url: string; preview_url: string; tags: string }

/** Нүүр хуудас: зургаас хөдөлгөөнт видео — алхам, урьдчилан харалт, загвар, CTA */
export default function AiVideoShowcase() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [price, setPrice] = useState(10000);
  const [enabled, setEnabled] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const introVideo = useHomeVideo('home_ai_video_youtube');

  useEffect(() => {
    publicDb.from('ai_video_templates').select('id, name, description, emoji, sample_video_url, preview_url, tags')
      .eq('is_active', true).order('sort_order', { ascending: true })
      .then(({ data }) => setTemplates((data ?? []) as Tpl[]));
    publicDb.from('platform_settings').select('key, value').in('key', ['album_video_price', 'album_video_enabled'])
      .then(({ data }) => {
        for (const r of data ?? []) {
          if (r.key === 'album_video_price' && Number(r.value) > 0) setPrice(Number(r.value));
          if (r.key === 'album_video_enabled' && (r.value === false || r.value === 'false')) setEnabled(false);
        }
      });
  }, []);

  const shown = [...templates].sort((a, b) => Number(!!b.sample_video_url) - Number(!!a.sample_video_url)).slice(0, 8);
  const active = shown.find(t => t.id === activeId) ?? shown[0] ?? null;
  const start = () => navigate(profile ? '/dashboard' : '/auth/login');

  const steps = [
    { icon: <Images className="w-5 h-5" />, title: 'Зургаа сонгоно', text: 'Цомгоо нээгээд дурын зурган доорх «🎬 Видео үүсгэх» товчийг дарна.' },
    { icon: <Sparkles className="w-5 h-5" />, title: 'Загвар сонгоно', text: templates.length > 0 ? `${templates.length}+ хөгжилтэй загвар: диско, сансар, дээл, луу, цасан хүн…` : 'Диско, сансар, дээл, луу, цасан хүн зэрэг загвараас сонгоно.' },
    { icon: <MonitorPlay className="w-5 h-5" />, title: '1–3 минутад бэлэн', text: 'Видео цомгийн «AI видео» хавтсанд орж, LED дэлгэц, ТВ-д шууд гарна.' },
  ];

  return (
    <section className="relative px-4 sm:px-6 py-10 sm:py-14 overflow-hidden border-t border-white/5">
      <div className="pointer-events-none absolute -top-24 left-0 w-72 h-72 rounded-full bg-fuchsia-600/10 blur-3xl" />
      <div className="relative max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-1.5 text-fuchsia-300 text-xs font-semibold mb-3">
            <Clapperboard className="w-3.5 h-3.5" /> Шинэ · AI видео
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold leading-[1.1] tracking-tight">
            Зургаа <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">хөдөлгөөнт видео</span> болгоорой
          </h2>
          <p className="text-stone-400 text-sm sm:text-base leading-relaxed mt-3">
            Цомгийнхоо дурын зургийг сонгоод загвар дарахад AI 8 секундын хөгжилтэй видео бүтээнэ.
          </p>
        </div>

        <ol className="mt-5 grid gap-2 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
              <div className="w-9 h-9 rounded-xl bg-fuchsia-500/15 text-fuchsia-300 flex items-center justify-center flex-shrink-0">{s.icon}</div>
              <div>
                <p className="text-white font-semibold text-sm"><span className="text-fuchsia-300">{i + 1}.</span> {s.title}</p>
                <p className="text-stone-400 text-xs mt-0.5 leading-snug">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 max-w-3xl">
          {introVideo ? (
            <YouTubeAutoplay url={introVideo} title="AI видео" />
          ) : active?.sample_video_url ? (
            <video
              key={active.id}
              src={active.sample_video_url}
              poster={active.preview_url || undefined}
              muted
              loop
              autoPlay
              playsInline
              className="w-full aspect-video rounded-3xl object-cover border border-white/10 bg-stone-900"
            />
          ) : active?.preview_url ? (
            <img src={active.preview_url} alt={active.name} className="w-full aspect-video rounded-3xl object-cover border border-white/10" />
          ) : (
            <div className="w-full aspect-video rounded-3xl border border-dashed border-white/15 bg-white/[0.03] flex flex-col items-center justify-center gap-2 text-center px-6">
              <Clapperboard className="w-8 h-8 text-fuchsia-300/70" />
              <p className="text-stone-300 text-sm font-medium">Жишээ видео энд гарна</p>
              <p className="text-stone-500 text-xs">Цомгийн зургаасаа хөдөлгөөнт видео бүтээнэ</p>
            </div>
          )}
        </div>

        {shown.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {shown.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                className={`w-20 sm:w-24 flex-shrink-0 rounded-xl ${t.id === active?.id ? 'ring-2 ring-fuchsia-400' : ''}`}
              >
                <TemplateTile t={t} />
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col items-start gap-2 mt-6">
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-fuchsia-500 to-amber-500 hover:brightness-110 text-stone-950 font-bold px-5 py-3 rounded-2xl text-sm"
          >
            <Clapperboard className="w-4 h-4" /> Цомгоо нээж видео бүтээх <ArrowRight className="w-4 h-4" />
          </button>
          {enabled && templates.length > 0 && (
            <p className="text-stone-500 text-xs">
              Нэг видео ₮{price.toLocaleString()} · Цомгийн эзэн бүтээнэ · Хүүхэд орсон зурагт боломжгүй
            </p>
          )}
          {!enabled && (
            <p className="text-stone-500 text-xs">Одоогоор энэ боломж түр хаагдсан. Нэвтрээд цомгоосоо шалгана уу.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function TemplateTile({ t }: { t: Tpl }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.play().catch(() => {}); else el.pause(); }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-gradient-to-br from-fuchsia-900/50 via-stone-900 to-amber-900/30">
      {t.sample_video_url ? (
        <video ref={ref} src={t.sample_video_url} poster={t.preview_url || undefined} muted loop playsInline preload="metadata"
          className="absolute inset-0 w-full h-full object-cover" />
      ) : t.preview_url ? (
        <img src={t.preview_url} alt={t.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-x-0 top-0 bottom-7 flex items-center justify-center">
          <span className="text-2xl group-hover:scale-110 transition-transform" aria-hidden>{t.emoji}</span>
        </div>
      )}
      {t.sample_video_url && <Play className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-white/80 drop-shadow" />}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950/95 via-stone-950/60 to-transparent px-1 pt-3 pb-1">
        <p className="text-white font-semibold text-[10px] leading-tight line-clamp-2 text-center">{t.name}</p>
      </div>
    </div>
  );
}
