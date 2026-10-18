import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { boothApi } from '../lib/aiBooth';
import { fetchAiTemplates } from '../lib/aiTemplates';
import { useI18n } from '../lib/i18n';

interface StripItem { id: string; name: string; preview_url: string }

/**
 * Цомгийн доод хэсэгт AI бүүтийн загваруудыг урсгаж санал болгоно.
 * Цомогт идэвхтэй бүүт байвал тэр бүүтийн загвар руу (сонгосон загвар тодорсон), үгүй бол AI каталог руу.
 */
export default function AiTemplateStrip({ albumId }: { albumId: string }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState<StripItem[]>([]);
  const [boothToken, setBoothToken] = useState('');
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem('zm_ai_strip_hidden') === '1'; } catch { return false; }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: token } = await supabase.rpc('album_booth_token', { p_album_id: albumId });
      if (cancelled) return;
      if (typeof token === 'string' && token) {
        try {
          const info = await boothApi.info(token);
          if (!cancelled && !info.closed && info.templates.length) {
            setBoothToken(token);
            setItems(info.templates);
            return;
          }
        } catch { /* каталог руу шилжинэ */ }
      }
      const list = await fetchAiTemplates();
      if (!cancelled) setItems(list);
    })();
    return () => { cancelled = true; };
  }, [albumId]);

  if (hidden || items.length === 0) return null;

  const open = (id: string) => navigate(boothToken ? `/booth/${boothToken}?t=${id}` : `/ai-booth?t=${id}`);
  const close = () => {
    setHidden(true);
    try { sessionStorage.setItem('zm_ai_strip_hidden', '1'); } catch { /* */ }
  };
  // Урсгал тасралтгүй харагдах ёстой тул жагсаалтыг хоёр дахин давтана
  const loop = items.length < 6 ? [...items, ...items, ...items] : items;
  const duration = Math.max(20, loop.length * 4);

  return (
    <>
      <div className="h-40" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-30 bg-stone-950/95 backdrop-blur border-t border-amber-500/20 shadow-[0_-10px_30px_rgba(0,0,0,.5)]">
        <style>{`
          @keyframes zmStrip { from { transform: translateX(0) } to { transform: translateX(-50%) } }
          .zm-strip:hover .zm-strip-track, .zm-strip:active .zm-strip-track { animation-play-state: paused; }
        `}</style>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 pt-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            <Sparkles className="w-3.5 h-3.5" /> {t('AI зураг авахуулаарай — загвараа сонгоно уу')}
          </p>
          <button onClick={close} aria-label={t('Хаах')} className="text-stone-500 hover:text-white p-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="zm-strip overflow-hidden py-2">
          <div className="zm-strip-track flex gap-3 w-max px-2" style={{ animation: `zmStrip ${duration}s linear infinite` }}>
            {[...loop, ...loop].map((it, i) => (
              <button key={`${it.id}-${i}`} onClick={() => open(it.id)}
                className="relative flex-shrink-0 w-24 sm:w-28 aspect-[3/4] rounded-xl overflow-hidden border border-amber-500/40 hover:border-amber-400 bg-stone-900 text-left group">
                {it.preview_url && <img src={it.preview_url} alt={it.name} loading="lazy" draggable={false}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform" />}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-1.5 pt-4 pb-1 text-[11px] font-semibold text-white leading-tight line-clamp-2">
                  {it.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
