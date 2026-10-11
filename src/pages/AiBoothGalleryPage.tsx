import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Wand2, X, Phone, MessageCircle, QrCode, Users, ShieldCheck, Palette, ChevronLeft, ChevronRight } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { AiTemplatePublic, AI_CATEGORY_GRADIENT, AI_CATEGORY_LABELS, AI_BOOTH_PRICE, fetchAiTemplates } from '../lib/aiTemplates';
import { useSiteContact, normalizeUrl } from '../lib/siteContact';

/** facebook.com/<нэр> → m.me/<нэр> (Messenger-ээр шууд бичих). Тодорхойгүй бол хуудасны линк. */
function messengerUrl(fb?: string): string {
  if (!fb) return '';
  const url = normalizeUrl(fb);
  const m = url.match(/facebook\.com\/(?!profile\.php)([A-Za-z0-9.\-_]+)\/?$/i);
  return m ? `https://m.me/${m[1]}` : url;
}

/** AI бүүтийн бүх загвар — нүүр хуудасны «AI зургийн бүүт» хэсгээс орно */
export default function AiBoothGalleryPage() {
  const navigate = useNavigate();
  const contact = useSiteContact();
  const [templates, setTemplates] = useState<AiTemplatePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>('all');
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  useEffect(() => {
    fetchAiTemplates().then(t => { setTemplates(t); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!loading && window.location.hash === '#order') {
      setTimeout(() => document.getElementById('order')?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [loading]);

  const cats = useMemo(() => {
    const present = [...new Set(templates.map(t => t.category))];
    return present.sort((a, b) => Object.keys(AI_CATEGORY_LABELS).indexOf(a) - Object.keys(AI_CATEGORY_LABELS).indexOf(b));
  }, [templates]);
  const shown = templates.filter(t => cat === 'all' || t.category === cat);
  const viewing = viewIdx !== null ? shown[viewIdx] : null;

  useEffect(() => {
    if (viewIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewIdx(null);
      if (e.key === 'ArrowRight') setViewIdx(i => (i === null ? i : (i + 1) % shown.length));
      if (e.key === 'ArrowLeft') setViewIdx(i => (i === null ? i : (i - 1 + shown.length) % shown.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewIdx, shown.length]);

  const phoneHref = contact.contact_phone ? 'tel:' + contact.contact_phone.replace(/[^\d+]/g, '') : '';
  const msgHref = messengerUrl(contact.social_facebook);

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <header className="border-b border-white/10 sticky top-0 z-40 bg-stone-950/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-stone-400 hover:text-white" title="Нүүр хуудас"><ArrowLeft className="w-5 h-5" /></button>
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 hover:opacity-80">
            <BrandMark className="w-8 h-8 flex-shrink-0" />
            <span><span className="font-brand text-white font-semibold tracking-tight">Zuragchin</span><span className="font-brand text-amber-400 font-semibold">.mn</span></span>
          </button>
          <span className="text-stone-600">/</span>
          <span className="text-amber-300 font-semibold flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> AI бүүт</span>
        </div>
      </header>

      {/* Hero */}
      <section className="relative px-6 pt-16 pb-12 overflow-hidden">
        <div className="pointer-events-none absolute -top-48 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] rounded-full bg-amber-500/15 blur-[130px]" />
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-6xl font-extrabold leading-[1.05] tracking-tight">
            AI зургийн бүүтийн<br />
            <span className="bg-gradient-to-r from-amber-300 via-amber-500 to-orange-500 bg-clip-text text-transparent">загварын цомог</span>
          </h1>
          <p className="text-stone-300 text-lg sm:text-xl leading-relaxed mt-6 max-w-3xl mx-auto">
            Зочид QR уншуулж, загвар сонгоод 1–4 хүн зогсоход хиймэл оюун кино шиг зургийг үүсгэнэ.
            Нүүр царай өөрчлөгдөхгүй, арга хэмжээний лого, нэр автоматаар суугдана.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-8 text-sm">
            <span className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2"><QrCode className="w-4 h-4 text-amber-400" /> QR уншуулна</span>
            <span className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2"><Users className="w-4 h-4 text-amber-400" /> 1–4 хүн</span>
            <span className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2"><ShieldCheck className="w-4 h-4 text-amber-400" /> Нүүр хадгалагдана</span>
            <span className="flex items-center gap-2 bg-amber-500 text-stone-950 font-bold rounded-full px-4 py-2">1 зураг — ₮{AI_BOOTH_PRICE.toLocaleString()}</span>
          </div>
        </div>
      </section>

      {/* Ангилал */}
      <main className="max-w-7xl mx-auto px-6 pb-16">
        {cats.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
            {[{ k: 'all', l: `Бүгд · ${templates.length}` }, ...cats.map(c => ({ k: c, l: `${AI_CATEGORY_LABELS[c] ?? c} · ${templates.filter(t => t.category === c).length}` }))].map(x => (
              <button key={x.k} onClick={() => setCat(x.k)}
                className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${cat === x.k ? 'bg-amber-500 border-amber-500 text-stone-950' : 'bg-white/5 border-white/10 text-stone-300 hover:text-white'}`}>
                {x.l}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24"><div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" /></div>
        ) : shown.length === 0 ? (
          <p className="text-center text-stone-500 py-24">Загвар удахгүй нэмэгдэнэ.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
            {shown.map((t, i) => (
              <button key={t.id} onClick={() => setViewIdx(i)}
                className="group relative aspect-[3/4] rounded-3xl overflow-hidden border border-white/10 hover:border-amber-500/50 transition-all text-left">
                {t.preview_url ? (
                  <img src={t.preview_url} alt={t.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${AI_CATEGORY_GRADIENT[t.category] ?? 'from-stone-700 to-stone-900'} flex items-center justify-center`}>
                    <Wand2 className="w-12 h-12 text-white/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-transparent to-transparent" />
                <span className="absolute top-3 left-3 bg-stone-950/70 backdrop-blur text-[11px] text-stone-200 px-2 py-1 rounded-lg">{AI_CATEGORY_LABELS[t.category] ?? t.category}</span>
                <div className="absolute bottom-0 inset-x-0 p-4">
                  <p className="text-white font-bold">{t.name}</p>
                  {t.description && <p className="text-stone-300 text-xs mt-0.5 line-clamp-2">{t.description}</p>}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Шинэ загвар захиалах */}
        <section id="order" className="relative mt-20 rounded-[2rem] overflow-hidden border border-amber-500/30 bg-gradient-to-br from-stone-900 via-stone-950 to-stone-900 scroll-mt-24">
          <div className="pointer-events-none absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-amber-500/20 blur-[120px]" />
          <div className="relative grid md:grid-cols-[1.4fr_1fr] gap-10 p-8 sm:p-12">
            <div>
              <span className="inline-flex items-center gap-2 text-amber-300 text-sm font-semibold mb-4"><Palette className="w-4 h-4" /> Захиалгат загвар</span>
              <h2 className="text-3xl sm:text-5xl font-extrabold leading-tight">
                Онцгой үйл явдалдаа<br /><span className="text-amber-400">шинэ загвар захиалаарай</span>
              </h2>
              <p className="text-stone-300 text-lg leading-relaxed mt-5">
                Хурим, ойн баяр, байгууллагын үдэшлэг, брэндийн арга хэмжээндээ зориулан өнгө төрх, орчин, хувцаслалт,
                логогоо тусгасан <b className="text-white">зөвхөн танд зориулсан AI загвар</b> бүтээж өгнө.
                Зочид тань тэр загвараар арга хэмжээний дурсамжаа авч, сошиалд хуваалцана.
              </p>
              <ul className="mt-6 space-y-2 text-stone-300">
                <li className="flex gap-2"><span className="text-amber-400">✓</span> Арга хэмжээний сэдэв, өнгө, лого тусгасан загвар</li>
                <li className="flex gap-2"><span className="text-amber-400">✓</span> QR постер, киоск дэлгэцийн тохиргоо</li>
                <li className="flex gap-2"><span className="text-amber-400">✓</span> Бүүтийн орлогын 10% зохион байгуулагчид</li>
              </ul>
            </div>
            <div className="flex flex-col justify-center gap-3">
              <p className="text-stone-400 text-sm">Захиалга, үнийн мэдээлэл авах:</p>
              {phoneHref && (
                <a href={phoneHref} className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-4 rounded-2xl text-lg transition-colors">
                  <Phone className="w-5 h-5" /> {contact.contact_phone}
                </a>
              )}
              {msgHref && (
                <a href={msgHref} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-4 rounded-2xl text-lg transition-colors">
                  <MessageCircle className="w-5 h-5" /> Messenger-ээр бичих
                </a>
              )}
              {contact.contact_email && (
                <a href={`mailto:${contact.contact_email}?subject=${encodeURIComponent('AI бүүтийн загвар захиалга')}`}
                  className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold px-6 py-3.5 rounded-2xl transition-colors">
                  {contact.contact_email}
                </a>
              )}
              {!phoneHref && !msgHref && !contact.contact_email && (
                <button onClick={() => navigate('/auth/register')}
                  className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-4 rounded-2xl text-lg">Бүртгүүлж эхлэх</button>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Томоор харах */}
      {viewing && viewIdx !== null && (
        <div className="fixed inset-0 z-50 bg-stone-950/95 flex items-center justify-center p-4" onClick={() => setViewIdx(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white" onClick={() => setViewIdx(null)}><X className="w-5 h-5" /></button>
          {shown.length > 1 && (
            <>
              <button className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                onClick={e => { e.stopPropagation(); setViewIdx((viewIdx - 1 + shown.length) % shown.length); }}><ChevronLeft className="w-6 h-6" /></button>
              <button className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                onClick={e => { e.stopPropagation(); setViewIdx((viewIdx + 1) % shown.length); }}><ChevronRight className="w-6 h-6" /></button>
            </>
          )}
          <div className="max-w-lg w-full" onClick={e => e.stopPropagation()}>
            {viewing.preview_url ? (
              <img src={viewing.preview_url} alt={viewing.name} className="w-full max-h-[75vh] object-contain rounded-2xl" />
            ) : (
              <div className={`aspect-[3/4] rounded-2xl bg-gradient-to-br ${AI_CATEGORY_GRADIENT[viewing.category] ?? 'from-stone-700 to-stone-900'} flex items-center justify-center`}><Wand2 className="w-16 h-16 text-white/30" /></div>
            )}
            <div className="mt-4 text-center">
              <p className="text-white text-xl font-bold">{viewing.name}</p>
              {viewing.description && <p className="text-stone-400 mt-1">{viewing.description}</p>}
              <p className="text-stone-500 text-sm mt-2">{AI_CATEGORY_LABELS[viewing.category] ?? viewing.category} · 1–{viewing.max_people} хүн</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
