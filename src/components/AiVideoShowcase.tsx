import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clapperboard, Images, MonitorPlay, Play, Sparkles } from 'lucide-react';
import { publicDb } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import YouTubeAutoplay from './YouTubeAutoplay';
import { useHomeVideo } from '../lib/homeVideo';

interface Tpl { id: string; name: string; description: string; emoji: string; sample_video_url: string; preview_url: string; tags: string }

/** Нүүр хуудас: цомгийн зургаас AI видео бүтээх боломжийг танилцуулна (AI бүүтийн хэсгийн доор) */
export default function AiVideoShowcase() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [price, setPrice] = useState(10000);
  const [enabled, setEnabled] = useState(true);
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

  if (!enabled || templates.length === 0) return null;

  // Жишээ видеотой загваруудыг эхэнд нь
  const shown = [...templates].sort((a, b) => Number(!!b.sample_video_url) - Number(!!a.sample_video_url)).slice(0, 8);
  const start = () => navigate(profile ? '/dashboard' : '/auth/login');

  const steps = [
    { icon: <Images className="w-5 h-5" />, title: 'Зургаа сонгоно', text: 'Цомгоо нээгээд дурын зурган доорх «🎬 Видео үүсгэх» товчийг дарна.' },
    { icon: <Sparkles className="w-5 h-5" />, title: 'Загвар сонгоно', text: `${templates.length}+ хөгжилтэй загвар: диско, сансар, дээл, луу, цасан хүн…` },
    { icon: <MonitorPlay className="w-5 h-5" />, title: '1–3 минутад бэлэн', text: 'Видео цомгийн «AI видео» хавтсанд орж, LED дэлгэц, ТВ-д шууд гарна.' },
  ];

  return (
    <section className="relative py-20 px-6 overflow-hidden border-t border-white/5">
      <div className="pointer-events-none absolute -top-32 -left-40 w-[700px] h-[500px] rounded-full bg-fuchsia-600/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 w-[600px] h-[500px] rounded-full bg-amber-500/10 blur-[120px]" />

      <div className="relative max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="inline-flex items-center gap-2 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
            <Clapperboard className="w-4 h-4" /> Шинэ · AI видео
          </span>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.05] tracking-tight">
            Зургаа <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">хөдөлгөөнт видео</span><br />болгоорой
          </h2>
          <p className="text-stone-300 text-lg sm:text-xl leading-relaxed mt-6">
            Цомгийнхоо дурын зургийг сонгоод загвар дарахад AI <b className="text-white">8 секундын хөгжилтэй видео</b> бүтээнэ.
            Эхэндээ таны зураг, дараа нь гайхалтай хувирал — арга хэмжээний дэлгэцэнд гаргахад төгс.
          </p>
        </div>

        {/* Алхмууд */}
        <div className="grid sm:grid-cols-3 gap-4 mb-10">
          {steps.map((s, i) => (
            <div key={s.title} className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-4">
              <div className="w-10 h-10 rounded-xl bg-fuchsia-500/15 text-fuchsia-300 flex items-center justify-center flex-shrink-0">{s.icon}</div>
              <div>
                <p className="text-white font-semibold"><span className="text-fuchsia-300">{i + 1}.</span> {s.title}</p>
                <p className="text-stone-400 text-sm mt-0.5 leading-snug">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Танилцуулга видео (админ YouTube холбоос оруулна) */}
        {introVideo && <div className="mb-10"><YouTubeAutoplay url={introVideo} title="AI видео" /></div>}

        {/* Загваруудын жишээ */}
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 md:gap-3 max-w-5xl mx-auto">
          {shown.map(t => <TemplateTile key={t.id} t={t} />)}
        </div>

        <div className="flex flex-col items-center gap-3 mt-10">
          <button onClick={start}
            className="flex items-center gap-2 bg-gradient-to-r from-fuchsia-500 to-amber-500 hover:brightness-110 text-stone-950 font-bold px-7 py-3.5 rounded-2xl text-base">
            <Clapperboard className="w-5 h-5" /> Цомгоо нээж видео бүтээх <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-stone-500 text-xs text-center">
            Нэг видео ₮{price.toLocaleString()} · Цомгийн эзэн бүтээнэ · Хүүхэд орсон зурагт боломжгүй
          </p>
        </div>
      </div>
    </section>
  );
}

function TemplateTile({ t }: { t: Tpl }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  // Жишээ видео харагдах үед л тоглоно
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.play().catch(() => {}); else el.pause(); }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-fuchsia-400/50 transition-colors bg-gradient-to-br from-fuchsia-900/50 via-stone-900 to-amber-900/30">
      {t.sample_video_url ? (
        <video ref={ref} src={t.sample_video_url} poster={t.preview_url || undefined} muted loop playsInline preload="metadata"
          className="absolute inset-0 w-full h-full object-cover" />
      ) : t.preview_url ? (
        <img src={t.preview_url} alt={t.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-x-0 top-0 bottom-7 flex items-center justify-center">
          <span className="text-2xl sm:text-3xl group-hover:scale-110 transition-transform" aria-hidden>{t.emoji}</span>
        </div>
      )}
      {t.sample_video_url && <Play className="absolute top-2 right-2 w-4 h-4 text-white/80 drop-shadow" />}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950/95 via-stone-950/60 to-transparent px-1.5 pt-4 pb-1.5">
        <p className="text-white font-semibold text-[10px] sm:text-xs leading-tight line-clamp-2 text-center">{t.name}</p>
      </div>
    </div>
  );
}
