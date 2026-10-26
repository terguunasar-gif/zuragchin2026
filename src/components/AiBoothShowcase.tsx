import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Wand2 } from 'lucide-react';
import { AiTemplatePublic, AI_CATEGORY_GRADIENT, fetchAiTemplates } from '../lib/aiTemplates';
import YouTubeAutoplay from './YouTubeAutoplay';
import { useHomeVideo } from '../lib/homeVideo';

/** Нүүр хуудасны «AI зургийн бүүт» — том урьдчилан харалт, загварын жижиг зураг, CTA */
export default function AiBoothShowcase() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<AiTemplatePublic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const introVideo = useHomeVideo('home_booth_youtube');

  useEffect(() => { fetchAiTemplates().then(setTemplates); }, []);

  const shown = [...templates].sort((a, b) => Number(!!b.preview_url) - Number(!!a.preview_url)).slice(0, 8);
  const active = shown.find(t => t.id === activeId) ?? shown[0] ?? null;
  const open = () => navigate('/ai-booth');

  return (
    <section className="relative px-4 sm:px-6 py-10 sm:py-14 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 right-0 w-72 h-72 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="relative max-w-6xl mx-auto lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center">
        <div>
          <p className="inline-flex items-center gap-1.5 text-amber-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" /> AI зургийн бүүт
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold leading-[1.1] tracking-tight">
            Онцгой үйл явдалдаа<br />
            <span className="bg-gradient-to-r from-amber-300 via-amber-500 to-orange-500 bg-clip-text text-transparent">өөрийн AI загвар</span>
          </h2>
          <p className="hidden lg:block text-stone-400 text-sm sm:text-base leading-relaxed mt-4">
            Хурим, шинэ жил, төгсөлт, байгууллагын арга хэмжээндээ зориулан AI бүүтийн шинэ загвар захиалан ашиглана.
            Зочид QR уншуулаад зургаа тэр дор нь утсандаа авна.
          </p>
          <div className="hidden lg:flex flex-wrap gap-3 mt-6">
            <BoothActions count={templates.length} onOpen={open} onOrder={() => navigate('/ai-booth#order')} />
          </div>
        </div>

        <div className="mt-5 lg:mt-0">
          {introVideo ? (
            <YouTubeAutoplay url={introVideo} title="AI зургийн бүүт" />
          ) : (
            <button
              type="button"
              onClick={open}
              className="relative block w-full aspect-[4/3] rounded-3xl overflow-hidden border border-white/10 bg-stone-900 text-left"
            >
              {active?.preview_url ? (
                <img src={active.preview_url} alt={active.name} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className={`absolute inset-0 bg-gradient-to-br ${AI_CATEGORY_GRADIENT[active?.category ?? ''] ?? 'from-stone-800 to-stone-950'} flex flex-col items-center justify-center gap-2 px-6 text-center`}>
                  <Wand2 className="w-8 h-8 text-white/40" />
                  <p className="text-stone-300 text-sm">AI загварын жишээ энд гарна</p>
                </div>
              )}
              {active && (
                <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-stone-950/90 to-transparent px-4 py-3 text-white font-semibold text-sm">
                  {active.name}
                </span>
              )}
            </button>
          )}

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(shown.length > 0 ? shown : Array.from({ length: 5 }, () => null)).map((t, i) => (
              <button
                key={t?.id ?? `ph-${i}`}
                type="button"
                onClick={() => (t ? setActiveId(t.id) : open())}
                className={`relative flex-shrink-0 w-16 h-20 sm:w-20 sm:h-24 rounded-xl overflow-hidden border ${
                  t && t.id === active?.id ? 'border-amber-400' : 'border-white/10'
                }`}
              >
                {t?.preview_url ? (
                  <img src={t.preview_url} alt={t.name} className="w-full h-full object-cover" />
                ) : (
                  <span className={`absolute inset-0 bg-gradient-to-br ${AI_CATEGORY_GRADIENT[t?.category ?? ''] ?? 'from-stone-700 to-stone-900'}`} />
                )}
              </button>
            ))}
          </div>
        </div>

        <p className="lg:hidden text-stone-400 text-sm leading-relaxed mt-4">
          Хурим, шинэ жил, төгсөлт, байгууллагын арга хэмжээндээ зориулан AI бүүтийн шинэ загвар захиалан ашиглана.
          Зочид QR уншуулаад зургаа тэр дор нь утсандаа авна.
        </p>
        <div className="lg:hidden flex flex-col gap-2 mt-4">
          <BoothActions count={templates.length} onOpen={open} onOrder={() => navigate('/ai-booth#order')} />
        </div>
      </div>
    </section>
  );
}

function BoothActions({ count, onOpen, onOrder }: { count: number; onOpen: () => void; onOrder: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-5 py-3 rounded-2xl text-sm"
      >
        Бүх загварыг үзэх{count > 0 ? ` (${count})` : ''} <ArrowRight className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onOrder}
        className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold px-5 py-3 rounded-2xl text-sm"
      >
        <Wand2 className="w-4 h-4 text-amber-400" /> Шинэ загвар захиалах
      </button>
    </>
  );
}
