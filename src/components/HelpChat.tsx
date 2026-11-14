import { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, X, Send, RotateCcw, ThumbsUp, ThumbsDown, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../lib/i18n';
import { hasRole } from '../lib/supabase';

/**
 * Сайтын ухаалаг туслах (update-92).
 * «Цомгоо нүүр хуудаснаас яаж нуух вэ?» гэх мэт асуултад сайтын зам, товчны нэрээр хариулна.
 * Хариултыг Edge Function `help-bot` (Gemini) өгнө.
 */

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-bot`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const MSG_KEY = 'zuragchin_help_msgs';
const SID_KEY = 'zuragchin_help_sid';

interface ChatMsg { role: 'user' | 'model'; text: string; id?: string | null; vote?: boolean }

// ── Хадгалалт (хувийн цонхонд алдаа гаргаж болзошгүй тул try/catch) ──
function readMsgs(): ChatMsg[] {
  try { const v = JSON.parse(sessionStorage.getItem(MSG_KEY) ?? '[]'); return Array.isArray(v) ? v.slice(-30) : []; } catch { return []; }
}
function saveMsgs(m: ChatMsg[]) {
  try { sessionStorage.setItem(MSG_KEY, JSON.stringify(m.slice(-30))); } catch { /* */ }
}
function sessionId(): string {
  try {
    let s = localStorage.getItem(SID_KEY);
    if (!s) { s = crypto.randomUUID().replace(/-/g, ''); localStorage.setItem(SID_KEY, s); }
    return s;
  } catch {
    return (window as unknown as { __hsid?: string }).__hsid ??= Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/** Туслах харагдах ёсгүй хуудсууд (дэлгэцийн слайдшоу, AI бүүтийн kiosk) */
function hiddenOn(path: string) {
  return /^\/album\/[^/]+\/(screen|kiosk)/.test(path) || path.startsWith('/booth/');
}

export default function HelpChat() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const { t, lang } = useI18n();

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>(readMsgs);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { saveMsgs(msgs); }, [msgs]);
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  // Утсан дээр бүтэн дэлгэцээр нээгдэхэд арын хуудас гүйлгэгдэхгүй
  useEffect(() => {
    if (!open || window.innerWidth >= 640) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const suggestions = useMemo(() => {
    if (hasRole(profile, 'organizer')) return [
      'Шинэ цомог яаж үүсгэх вэ?',
      'Цомгоо нүүр хуудаснаас яаж нуух вэ?',
      'Цомгийн хугацааг яаж сунгах вэ?',
      'AI бүүтийг яаж асаах вэ?',
    ];
    if (hasRole(profile, 'photographer')) return [
      'Цомогт яаж нэгдэж зураг оруулах вэ?',
      'Зураг бүрт үнэ яаж тавих вэ?',
      'Орлогоо яаж татах вэ?',
      'Профайлаа нүүр хуудсанд яаж гаргах вэ?',
    ];
    return [
      'Өөрийн зургийг цомгоос яаж олох вэ?',
      'Зураг яаж худалдаж авах вэ?',
      'Худалдаж авсан зургаа хаанаас татах вэ?',
      'Зурагчин болж цомог үүсгэх вэ?',
    ];
  }, [profile]);

  if (hiddenOn(pathname)) return null;
  const onAlbum = pathname.startsWith('/album/');

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: ChatMsg[] = [...msgs, { role: 'user', text: q }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${session?.access_token ?? ANON_KEY}`,
        },
        body: JSON.stringify({
          session_id: sessionId(),
          lang,
          path: pathname,
          messages: next.slice(-12).map(m => ({ role: m.role, text: m.text })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      const answer = typeof j.answer === 'string' && j.answer
        ? j.answer
        : t('Уучлаарай, яг одоо хариулж чадсангүй. Дахин оролдоно уу.');
      setMsgs(m => [...m, { role: 'model', text: answer, id: j.id ?? null }]);
    } catch {
      setMsgs(m => [...m, { role: 'model', text: t('Сүлжээ удаан байна. Дахин оролдоно уу.') }]);
    } finally {
      setBusy(false);
    }
  }

  async function vote(i: number, helpful: boolean) {
    const m = msgs[i];
    if (!m?.id || m.vote !== undefined) return;
    setMsgs(arr => arr.map((x, k) => (k === i ? { ...x, vote: helpful } : x)));
    fetch(`${FN_URL}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ session_id: sessionId(), id: m.id, helpful }),
    }).catch(() => { /* */ });
  }

  function go(href: string) {
    if (window.innerWidth < 640) setOpen(false);
    navigate(href);
  }

  return (
    <>
      {/* Хөвөгч товч */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={t('Туслах')}
          className={`fixed z-40 ${onAlbum ? 'left-4 bottom-20 sm:bottom-6' : 'right-4 bottom-4 sm:right-6 sm:bottom-6'}
            flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold
            shadow-[0_8px_30px_rgba(245,158,11,.35)] h-12 pl-3.5 pr-4 transition-transform hover:scale-105 print:hidden`}>
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm hidden sm:inline">{t('Туслах')}</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={t('Zuragchin туслах')}
          className={`fixed z-[60] inset-0 sm:inset-auto ${onAlbum ? 'sm:left-6' : 'sm:right-6'} sm:bottom-6
            sm:w-[380px] sm:h-[min(620px,calc(100vh-3rem))] flex flex-col bg-stone-950 sm:rounded-2xl
            border border-white/10 shadow-2xl overflow-hidden print:hidden`}>
          {/* Толгой */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-gradient-to-r from-amber-500/15 to-transparent">
            <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-stone-950" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold text-sm leading-tight">{t('Zuragchin туслах')}</p>
              <p className="text-stone-400 text-[11px] leading-tight">{t('Сайтыг ашиглах заавар — хаана, яаж')}</p>
            </div>
            {msgs.length > 0 && (
              <button onClick={() => setMsgs([])} title={t('Шинэ яриа')} aria-label={t('Шинэ яриа')}
                className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-white/10">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setOpen(false)} aria-label={t('Хаах')}
              className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Яриа */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 overscroll-contain">
            <Bubble role="model">
              {t('Сайн байна уу! Би Zuragchin.mn-ийн туслах. Сайт дээр юу хийх гэж байгаагаа асуугаарай — аль хуудас, аль товчийг дарахыг зааж өгье.')}
            </Bubble>

            {msgs.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map(s => (
                  <button key={s} onClick={() => ask(t(s))}
                    className="text-left text-xs text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 rounded-xl px-3 py-2">
                    {t(s)}
                  </button>
                ))}
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i}>
                <Bubble role={m.role}>
                  {m.role === 'model' ? <Markdown text={m.text} onLink={go} /> : m.text}
                </Bubble>
                {m.role === 'model' && m.id && (
                  <div className="flex items-center gap-1 mt-1 ml-1 text-stone-500">
                    {m.vote === undefined ? (
                      <>
                        <span className="text-[11px] mr-1">{t('Тус болсон уу?')}</span>
                        <button onClick={() => vote(i, true)} aria-label={t('Тийм')} className="p-1 rounded hover:text-emerald-400 hover:bg-white/5"><ThumbsUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => vote(i, false)} aria-label={t('Үгүй')} className="p-1 rounded hover:text-red-400 hover:bg-white/5"><ThumbsDown className="w-3.5 h-3.5" /></button>
                      </>
                    ) : (
                      <span className="text-[11px]">{m.vote ? t('Баярлалаа!') : t('Баярлалаа — сайжруулахад ашиглана.')}</span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <Bubble role="model">
                <span className="inline-flex items-center gap-2 text-stone-400"><Loader2 className="w-4 h-4 animate-spin" />{t('Бодож байна…')}</span>
              </Bubble>
            )}
          </div>

          {/* Бичих хэсэг */}
          <form onSubmit={e => { e.preventDefault(); ask(input); }}
            className="border-t border-white/10 p-3 flex items-end gap-2 bg-stone-950"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value.slice(0, 1000))}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
              rows={1}
              placeholder={t('Асуултаа бичнэ үү…')}
              className="flex-1 resize-none max-h-32 bg-white/5 border border-white/10 focus:border-amber-500/50 outline-none rounded-xl px-3 py-2.5 text-[16px] sm:text-sm text-white placeholder:text-stone-500"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label={t('Илгээх')}
              className="h-11 w-11 flex-shrink-0 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Bubble({ role, children }: { role: 'user' | 'model'; children: ReactNode }) {
  return role === 'user' ? (
    <div className="flex justify-end">
      <div className="max-w-[85%] bg-amber-500 text-stone-950 rounded-2xl rounded-br-md px-3.5 py-2 text-sm whitespace-pre-wrap break-words">{children}</div>
    </div>
  ) : (
    <div className="flex justify-start">
      <div className="max-w-[92%] bg-white/[0.06] border border-white/10 text-stone-200 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed break-words">{children}</div>
    </div>
  );
}

// ── Энгийн, аюулгүй markdown (HTML оруулахгүй): линк, **тод**, жагсаалт ──
function inline(text: string, onLink: (href: string) => void, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|«([^»]+)»/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${k++}`;
    if (m[1] !== undefined) {
      const label = m[1];
      const href = m[2];
      if (href.startsWith('/') && !href.startsWith('//') && !href.includes('<')) {
        out.push(
          <a key={key} href={href} onClick={e => { e.preventDefault(); onLink(href); }}
            className="text-amber-300 underline underline-offset-2 hover:text-amber-200 font-medium">{label}</a>,
        );
      } else if (/^https:\/\//.test(href)) {
        out.push(<a key={key} href={href} target="_blank" rel="noreferrer noopener" className="text-amber-300 underline underline-offset-2">{label}</a>);
      } else {
        out.push(label);
      }
    } else if (m[3] !== undefined) {
      out.push(<strong key={key} className="text-white font-semibold">{m[3]}</strong>);
    } else {
      // «Товчны нэр» — товч шиг тодруулна
      out.push(<span key={key} className="text-white font-medium">«{m[4]}»</span>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text, onLink }: { text: string; onLink: (href: string) => void }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const L = list;
    const Tag = L.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`l${blocks.length}`} className={`${L.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1 my-1.5 marker:text-amber-400`}>
        {L.items.map((it, i) => <li key={i}>{inline(it, onLink, `l${blocks.length}-${i}`)}</li>)}
      </Tag>,
    );
    list = null;
  };

  lines.forEach((raw, i) => {
    const line = raw.replace(/^#{1,6}\s+/, '').trimEnd();
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ol || ul) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((ol ?? ul)![1]);
      return;
    }
    flush();
    if (!line.trim()) return;
    blocks.push(<p key={`p${i}`} className="my-1">{inline(line, onLink, `p${i}`)}</p>);
  });
  flush();
  return <Fragment>{blocks}</Fragment>;
}
