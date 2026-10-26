import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Зочдод (цомог үзэх, худалдан авах, бүртгүүлэх) зориулсан 4 хэл.
// Түлхүүр нь монгол текст өөрөө — орчуулга олдохгүй бол монголоор харагдана.

export type Lang = 'mn' | 'ru' | 'zh' | 'en';

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'mn', label: 'Монгол', flag: '🇲🇳' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🌐' },
];

export const LOCALE: Record<Lang, string> = { mn: 'mn-MN', ru: 'ru-RU', zh: 'zh-CN', en: 'en-US' };

const STORAGE_KEY = 'zuragchin_lang';

type Dict = Record<string, string>;

const cache: Partial<Record<Lang, Dict>> = { mn: {} };

const LOADERS: Record<Exclude<Lang, 'mn'>, () => Promise<{ default: Dict }>> = {
  ru: () => import('./locales/ru'),
  zh: () => import('./locales/zh'),
  en: () => import('./locales/en'),
};

/** Монгол түлхүүр хэл. Бусад хэлний орчуулгыг сонгосон үед л ачаална. */
export function ensureDict(lang: Lang): Promise<void> {
  if (lang === 'mn' || cache[lang]) return Promise.resolve();
  return LOADERS[lang]().then(mod => {
    cache[lang] = mod.default;
  });
}

function dictFor(lang: Lang): Dict {
  return cache[lang] ?? {};
}


function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'mn' || v === 'ru' || v === 'zh' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

export function translate(lang: Lang, mn: string, vars?: Record<string, string | number>): string {
  let s = dictFor(lang)[mn] ?? mn;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

interface I18nValue {
  lang: Lang;
  /** Хэрэглэгч хэлээ өөрөө сонгосон эсэх (сонгоогүй бол цомгийн линк дээр асууна) */
  chosen: boolean;
  setLang: (l: Lang) => void;
  t: (mn: string, vars?: Record<string, string | number>) => string;
  locale: string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const stored = readStored();
  const [lang, setLangState] = useState<Lang>(stored ?? 'mn');
  const [chosen, setChosen] = useState<boolean>(!!stored);
  const [dictTick, setDictTick] = useState(0);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    setChosen(true);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* хувийн цонх гэх мэт */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  }, [lang]);

  useEffect(() => {
    let on = true;
    ensureDict(lang).then(() => { if (on) setDictTick(n => n + 1); });
    return () => { on = false; };
  }, [lang]);

  const value = useMemo<I18nValue>(() => ({
    lang, chosen, setLang,
    t: (mn, vars) => {
      // dictTick changes when a locale chunk finishes loading.
      void dictTick;
      return translate(lang, mn, vars);
    },
    locale: LOCALE[lang],
  }), [lang, chosen, setLang, dictTick]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Provider-гүй үед (тест гэх мэт) монголоор ажиллана
    return { lang: 'mn', chosen: true, setLang: () => {}, t: (mn, vars) => translate('mn', mn, vars), locale: LOCALE.mn };
  }
  return ctx;
}
