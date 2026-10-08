import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { guessLang, Lang, LANGS, translate, useI18n } from '../lib/i18n';

/** Цомгийн линкийг анх нээхэд гарах хэл сонгох цонх. Монгол хамгийн эхэнд. */
export function LanguagePickerModal() {
  const { chosen, setLang } = useI18n();
  const [selected, setSelected] = useState<Lang>(() => guessLang());
  if (chosen) return null;

  // Цонхны бичиг сонгож буй хэлээр шууд солигдоно
  const tt = (mn: string) => translate(selected, mn);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-950/90 backdrop-blur-sm" />
      <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <div className="w-11 h-11 bg-amber-500/15 rounded-xl flex items-center justify-center mb-4">
          <Globe className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="text-white text-xl font-bold mb-1">{tt('Хэлээ сонгоно уу')}</h2>
        <p className="text-stone-400 text-sm mb-5">
          {tt('Сайт сонгосон хэлээр харагдана. Дараа нь дээд буланд сольж болно.')}
        </p>
        <div className="space-y-2 mb-5">
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => setSelected(l.code)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                selected === l.code
                  ? 'border-amber-500 bg-amber-500/10 text-white'
                  : 'border-white/10 text-stone-300 hover:border-white/30'}`}
            >
              <span className="text-xl leading-none">{l.flag}</span>
              <span className="flex-1 font-medium">{l.label}</span>
              {selected === l.code && <Check className="w-4 h-4 text-amber-400" />}
            </button>
          ))}
        </div>
        <button
          onClick={() => setLang(selected)}
          className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl transition-colors"
        >
          {tt('Үргэлжлүүлэх')}
        </button>
      </div>
    </div>
  );
}

/** Толгой хэсэгт байрлах жижиг хэл солих товч. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGS.find(l => l.code === lang) ?? LANGS[0];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        title={t('Хэл')}
        className="flex items-center gap-1.5 text-stone-300 hover:text-white border border-white/10 hover:border-white/30 px-2.5 py-2 rounded-xl text-sm transition-colors"
      >
        <span className="leading-none">{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-40 bg-stone-900 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-white/5 ${
                l.code === lang ? 'text-amber-400' : 'text-stone-300'}`}
            >
              <span>{l.flag}</span>
              <span className="flex-1">{l.label}</span>
              {l.code === lang && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
