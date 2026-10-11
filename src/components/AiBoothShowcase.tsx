import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Wand2 } from 'lucide-react';
import { AiTemplatePublic, AI_CATEGORY_GRADIENT, fetchAiTemplates } from '../lib/aiTemplates';

/** Нүүр хуудасны «AI зургийн бүүт» хэсэг — загваруудын жишээ, бүх цомог руу орох, шинэ загвар захиалах */
export default function AiBoothShowcase() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<AiTemplatePublic[]>([]);

  useEffect(() => { fetchAiTemplates().then(setTemplates); }, []);

  // Жишээ зурагтай загваруудыг эхэнд нь
  const shown = [...templates].sort((a, b) => Number(!!b.preview_url) - Number(!!a.preview_url)).slice(0, 4);
  const open = () => navigate('/ai-booth');

  return (
    <section className="relative py-20 px-6 overflow-hidden">
      {/* Арын гэрэл */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-amber-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-fuchsia-600/10 blur-[120px]" />

      <div className="relative max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
            <Sparkles className="w-4 h-4" /> AI зургийн бүүт
          </span>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.05] tracking-tight">
            Онцгой үйл явдалдаа<br />
            <span className="bg-gradient-to-r from-amber-300 via-amber-500 to-orange-500 bg-clip-text text-transparent">өөрийн AI загвар</span>
          </h2>
          <p className="text-stone-300 text-lg sm:text-xl leading-relaxed mt-6">
            Хурим, шинэ жил, төгсөлт, байгууллагын арга хэмжээндээ зориулан AI бүүтийн <b className="text-white">шинэ загвар захиалан</b> ашиглах боломжтой.
            Зочид QR уншуулаад кино шиг тансаг зургаа тэр дор нь утсандаа авна.
          </p>
        </div>

        {/* Загваруудын жишээ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          {(shown.length > 0 ? shown : Array.from({ length: 4 }, () => null)).map((t, i) => (
            <button key={t?.id ?? i} onClick={open}
              className="group relative aspect-[3/4] rounded-3xl overflow-hidden border border-white/10 hover:border-amber-500/50 transition-all text-left">
              {t?.preview_url ? (
                <img src={t.preview_url} alt={t.name} loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              ) : (
                <div className={`absolute inset-0 bg-gradient-to-br ${AI_CATEGORY_GRADIENT[t?.category ?? ''] ?? 'from-stone-700 via-stone-800 to-stone-900'} flex items-center justify-center`}>
                  <Wand2 className="w-12 h-12 text-white/30" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/10 to-transparent" />
              {t && (
                <div className="absolute bottom-0 inset-x-0 p-4">
                  <p className="text-white font-bold text-sm sm:text-base">{t.name}</p>
                  {t.description && <p className="text-stone-300 text-xs mt-0.5 line-clamp-1">{t.description}</p>}
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
          <button onClick={open}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-7 py-3.5 rounded-2xl text-base transition-colors">
            Бүх загварыг үзэх{templates.length > 0 ? ` (${templates.length})` : ''} <ArrowRight className="w-5 h-5" />
          </button>
          <button onClick={() => navigate('/ai-booth#order')}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold px-7 py-3.5 rounded-2xl text-base transition-colors">
            <Wand2 className="w-5 h-5 text-amber-400" /> Шинэ загвар захиалах
          </button>
        </div>
      </div>
    </section>
  );
}
