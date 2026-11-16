import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, MessageCircle, Send } from 'lucide-react';
import type { AlbumData, PhotoData } from '../pages/PublicAlbumPage';
import { isAndroid, isIOS, socialInAppName } from '../lib/browserEnv';
import {
  askHelpBot, clearGuide, loadGuide, markGuidePaid, normalizeMnPhone, ruleReply, saveGuide, setAlbumGuideActive, syncGuideLead,
  type GuideCartLine, type GuideChoice, type GuideMsg, type GuideSession, type GuideStep,
} from '../lib/albumGuide';

const PRINT_LABEL: Record<string, string> = {
  '10x15': '10×15 см', '13x18': '13×18 см', '15x21': '15×21 см',
  '20x30': '20×30 см', '30x40': '30×40 см', 'A4': 'A4', '21x30': '21×30 см',
};

function dlPrice(photo: PhotoData, album: AlbumData, aiPrice: number): number {
  if (photo.source === 'ai_booth') return aiPrice;
  if (album.is_free) return 0;
  if (photo.download_price !== null && photo.download_price !== undefined) return Number(photo.download_price);
  return Number(album.download_price ?? 0);
}

function printOptions(photo: PhotoData): [string, number][] {
  return Object.entries(photo.print_prices || {}).filter(([, p]) => Number(p) > 0) as [string, number][];
}

function money(n: number) {
  return `₮${Math.round(n).toLocaleString('mn-MN')}`;
}

export default function AlbumPurchaseGuide({
  album, photos, folders, aiPrice, paidInvoice, onCheckout, onClose,
}: {
  album: AlbumData;
  photos: PhotoData[];
  folders: { id: string; name: string }[];
  aiPrice: number;
  paidInvoice: string | null;
  onCheckout: (lines: GuideCartLine[]) => void;
  onClose: () => void;
}) {
  const [session, setSession] = useState<GuideSession>(() => loadGuide(album.id));
  const [draft, setDraft] = useState('');
  const [name, setName] = useState(() => loadGuide(album.id).name);
  const [phone, setPhone] = useState(() => loadGuide(album.id).phone);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlNote, setDlNote] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const paidOnce = useRef(false);
  const inApp = typeof navigator !== 'undefined' && !!socialInAppName(navigator.userAgent || '');

  const named = useMemo(() => folders.filter(f => photos.some(p => p.folder_id === f.id)), [folders, photos]);

  function commit(next: GuideSession, persist = true) {
    setSession(next);
    if (persist && next.step !== 'done') saveGuide(album.id, next);
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [session.messages, session.step, chatOpen]);

  useEffect(() => { setChatOpen(false); }, [session.step]);
  useLayoutEffect(() => {
    setAlbumGuideActive(true);
    return () => setAlbumGuideActive(false);
  }, []);

  useEffect(() => {
    if (session.step === 'done' || !session.phone) return;
    const t = setTimeout(() => { syncGuideLead(album.id, session); }, 700);
    return () => clearTimeout(t);
  }, [album.id, session]);

  useEffect(() => {
    if (!paidInvoice || paidOnce.current) return;
    paidOnce.current = true;
    const n = session.choices.filter(c => c.download).length;
    const m = session.choices.filter(c => c.print).length;
    const messages: GuideMsg[] = [
      ...session.messages,
      { role: 'bot', text: `Таны татах зургууд: ${n}` },
      { role: 'bot', text: `Таны угаалгах зургууд: ${m}` },
      ...(n > 0 ? [{ role: 'bot' as const, text: `Таны татах зураг ${n} ширхэг байна. Татах уу?` }] : []),
    ];
    setSession(s => ({ ...s, step: 'done', messages }));
    clearGuide(album.id);
    markGuidePaid(album.id, session.token, paidInvoice);
  }, [paidInvoice, album.id, session.choices, session.messages, session.token]);

  function go(step: GuideStep, extra: Partial<GuideSession> = {}, bot?: string) {
    const messages = bot ? [...session.messages, { role: 'bot' as const, text: bot }] : session.messages;
    commit({ ...session, ...extra, step, messages });
  }

  function welcome() {
    const nm = name.trim();
    const ph = normalizeMnPhone(phone);
    if (nm.length < 2) { setFormErr('Нэрээ оруулна уу'); return; }
    if (!ph) { setFormErr('8 оронтой утасны дугаар оруулна уу'); return; }
    setFormErr('');
    const greet = `Сайн байна уу, ${nm}! Та «${album.name}» цомогт нэвтэрлээ. Зураг үзэх үү?`;
    commit({ ...session, name: nm, phone: ph, step: 'greet', messages: [{ role: 'bot', text: greet }] });
  }

  function acceptYes() {
    if (named.length > 0) {
      const list = named.map(f => f.name).join(', ');
      go('topics', {}, `Энэ цомогт ийм сэдвүүдээр ангилсан зураг байна: ${list}. Алийг нь сонирхож байна?`);
    } else {
      go('browse', { folderId: null }, 'Бүх зургийг харууллаа. Хүссэн зургаа тэмдэглээд «Сонгож дууслаа» дарна уу.');
    }
  }

  function openFolder(id: string | null, label: string) {
    go('browse', { folderId: id }, `«${label}» зургууд. Сонгоод үргэлжлүүлнэ үү.`);
  }

  async function onFreeText(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setDraft('');
    const ruled = ruleReply(q, named);
    const messages: GuideMsg[] = [...session.messages, { role: 'user', text: q }];
    if (ruled?.action === 'no') {
      commit({ ...session, messages: [...messages, { role: 'bot', text: ruled.reply }], declined: true });
      onClose();
      return;
    }
    if (ruled?.action === 'yes') {
      if (named.length > 0) {
        const list = named.map(f => f.name).join(', ');
        commit({ ...session, messages: [...messages, { role: 'bot', text: `Энэ цомогт ийм сэдвүүдээр ангилсан зураг байна: ${list}. Алийг нь сонирхож байна?` }], step: 'topics' });
      } else {
        commit({ ...session, messages: [...messages, { role: 'bot', text: 'Бүх зургийг харууллаа. Хүссэн зургаа тэмдэглээд «Сонгож дууслаа» дарна уу.' }], step: 'browse', folderId: null });
      }
      return;
    }
    if (ruled?.action === 'folder' && ruled.folderId) {
      commit({ ...session, messages: [...messages, { role: 'bot', text: ruled.reply }], step: 'browse', folderId: ruled.folderId });
      return;
    }
    setBusy(true);
    commit({ ...session, messages });
    const ai = await askHelpBot(q, window.location.pathname);
    const reply = ai || 'Та «Тийм» гэж дарвал зураг гарна. Зургийг тэмдэглээд «Сонгож дууслаа» дарна уу.';
    setSession(s => {
      const next = { ...s, messages: [...s.messages, { role: 'bot' as const, text: reply }] };
      saveGuide(album.id, next);
      return next;
    });
    setBusy(false);
  }

  function togglePhoto(id: string) {
    const selected = session.selected.includes(id)
      ? session.selected.filter(x => x !== id)
      : [...session.selected, id];
    commit({ ...session, selected });
  }

  const visible = session.folderId
    ? photos.filter(p => p.folder_id === session.folderId)
    : photos;
  const selectedPhotos = photos.filter(p => session.selected.includes(p.id));
  const running = selectedPhotos.reduce((s, p) => s + dlPrice(p, album, aiPrice), 0);

  function finishSelect() {
    if (!session.selected.length) return;
    const choices: GuideChoice[] = session.selected.map(id => {
      const prev = session.choices.find(c => c.photoId === id);
      const photo = photos.find(p => p.id === id);
      const opts = photo ? printOptions(photo) : [];
      return prev ?? { photoId: id, download: false, print: false, printSize: opts[0]?.[0] };
    });
    go('choices', { choices }, 'Сонгосон зураг бүрээ татах уу, угаалгах уу, эсвэл хоёуланг нь уу?');
  }

  function setChoice(id: string, patch: Partial<GuideChoice>) {
    const choices = session.choices.map(c => c.photoId === id ? { ...c, ...patch } : c);
    commit({ ...session, choices });
  }

  const lines: GuideCartLine[] = [];
  for (const c of session.choices) {
    const p = photos.find(x => x.id === c.photoId);
    if (!p) continue;
    if (c.download) {
      const price = dlPrice(p, album, aiPrice);
      if (price > 0) lines.push({
        photoId: p.id, photographerId: p.photographer_id, previewUrl: p.watermarked_url,
        filename: p.title || p.id, type: 'download', price,
      });
    }
    if (c.print && c.printSize) {
      const price = Number(p.print_prices?.[c.printSize] ?? 0);
      if (price > 0) lines.push({
        photoId: p.id, photographerId: p.photographer_id, previewUrl: p.watermarked_url,
        filename: p.title || p.id, type: 'print', printSize: c.printSize, price,
      });
    }
  }
  const total = lines.reduce((s, l) => s + l.price, 0);
  const ready = session.choices.length > 0 && session.choices.every(c => c.download || c.print);

  async function downloadPaid() {
    if (!paidInvoice) return;
    setDlBusy(true);
    setDlNote('');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay/signed-urls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ invoiceId: paidInvoice }),
      });
      const body = await res.json().catch(() => ({}));
      const urls = (body.signedUrls ?? []) as { signedUrl?: string; filename?: string; type?: string; expired?: boolean }[];
      const files: File[] = [];
      for (const u of urls) {
        if (u.type !== 'download' || !u.signedUrl || u.expired) continue;
        const blob = await (await fetch(u.signedUrl)).blob();
        const raw = u.filename || 'zurag.jpg';
        const name = /\.(jpe?g|png|webp)$/i.test(raw) ? raw : `${raw}.jpg`;
        const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
        files.push(file);
        if (!isIOS) {
          const href = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = href; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(href), 60000);
          await new Promise(r => setTimeout(r, 350));
        }
      }
      if (!files.length) { setDlNote('Татах холбоос хараахан бэлэн биш. Хэдэн секундийн дараа дахин дарна уу.'); return; }
      if (isIOS) {
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        if (nav.canShare?.({ files }) || 'share' in navigator) {
          try {
            await navigator.share({ files });
            setDlNote('Нээгдсэн цонхноос «Save Image»-ийг дарж Photos руу хадгална уу.');
            return;
          } catch { /* fallback */ }
        }
        for (const file of files) {
          const href = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = href; a.download = file.name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(href), 60000);
        }
      }
      setDlNote(isAndroid
        ? 'Зургууд татагдлаа. Утасны Галерей эсвэл Downloads хавтсаас харна уу.'
        : 'Таталт эхэллээ.');
    } catch {
      setDlNote('Татаж чадсангүй. Баримтын хуудаснаас дахин оролдоно уу.');
    } finally {
      setDlBusy(false);
    }
  }

  const others = named.filter(f => f.id !== session.folderId);
  const shownMessages = chatOpen ? session.messages : session.messages.slice(-1);

  return (
    <div className={`fixed inset-x-0 bottom-0 z-[45] bg-stone-950 text-white flex flex-col ${inApp ? 'top-24' : 'top-0'}`}>
      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold truncate">Zuragchin.mn-д тавтай морил</p>
          <p className="text-stone-400 text-xs truncate">{album.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {session.messages.length > 1 && (
            <button type="button" onClick={() => setChatOpen(o => !o)} aria-pressed={chatOpen} aria-label="Чат"
              className={`p-2 rounded-lg ${chatOpen ? 'bg-white/15 text-white' : 'bg-white/10 text-white'}`}>
              <MessageCircle className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={() => { commit({ ...session, declined: true }); onClose(); }} className="text-stone-400 text-xs underline">Энгийн харагдац</button>
        </div>
      </header>

      {session.step === 'browse' && named.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-white/10 shrink-0 [scrollbar-width:none]">
          <button type="button" onClick={() => openFolder(null, 'Бүх зураг')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${session.folderId === null ? 'bg-amber-500 text-stone-950' : 'bg-white/10 text-white'}`}>
            Бүгд
          </button>
          {named.map(f => (
            <button key={f.id} type="button" onClick={() => openFolder(f.id, f.name)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${session.folderId === f.id ? 'bg-amber-500 text-stone-950' : 'bg-white/10 text-white'}`}>
              {f.name}
            </button>
          ))}
        </div>
      )}

      {shownMessages.length > 0 && (
        <div ref={listRef} className={`px-4 py-2 space-y-2 shrink-0 ${chatOpen ? 'overflow-y-auto max-h-[34dvh]' : ''}`}>
          {shownMessages.map((m, i) => (
            <div key={i} className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-snug ${
              m.role === 'bot' ? 'bg-white/10' : 'bg-amber-500 text-stone-950 ml-auto'
            }`}>{m.text}</div>
          ))}
          {busy && <div className="text-stone-500 text-xs flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> ...</div>}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3">
        {session.step === 'welcome' && (
          <form onSubmit={e => { e.preventDefault(); welcome(); }} className="space-y-3 max-w-md mx-auto pt-2">
            <p className="text-stone-300 text-sm">Нэр, утасаа үлдээгээд зургаа үзээрэй. Төлбөр дуустал энэ төхөөрөмж дээр хадгалагдана.</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Нэр" autoComplete="name"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-amber-500" />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Утасны дугаар" inputMode="numeric" autoComplete="tel"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-amber-500" />
            {formErr && <p className="text-red-300 text-sm">{formErr}</p>}
            <button type="submit" className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl py-3.5">Зураг үзэх</button>
          </form>
        )}

        {session.step === 'greet' && (
          <div className="flex gap-2 max-w-md mx-auto">
            <button type="button" onClick={acceptYes} className="flex-1 bg-amber-500 text-stone-950 font-bold rounded-xl py-3">Тийм</button>
            <button type="button" onClick={() => { commit({ ...session, declined: true }); onClose(); }} className="flex-1 bg-white/10 rounded-xl py-3">Үгүй</button>
          </div>
        )}

        {session.step === 'topics' && (
          <div className="flex flex-wrap gap-2 max-w-lg mx-auto">
            {named.map(f => (
              <button key={f.id} type="button" onClick={() => openFolder(f.id, f.name)}
                className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-full px-4 py-2 text-sm">{f.name}</button>
            ))}
            <button type="button" onClick={() => openFolder(null, 'Бүх зураг')}
              className="bg-amber-500/20 border border-amber-500/40 rounded-full px-4 py-2 text-sm">Бүгдийг</button>
          </div>
        )}

        {session.step === 'browse' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {visible.map(p => {
                const on = session.selected.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => togglePhoto(p.id)}
                    className={`relative aspect-[3/4] rounded-xl overflow-hidden bg-stone-900 text-left ${on ? 'ring-2 ring-amber-400' : ''}`}>
                    <img src={p.watermarked_url} alt="" className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover" />
                    <span className={`pointer-events-none absolute top-2 left-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border-2 shadow-md ${on ? 'border-amber-300 bg-amber-500 text-stone-950' : 'border-white bg-black/80 text-white'}`}>
                      {on ? <Check className="w-4 h-4" strokeWidth={3} /> : <span className="block h-3.5 w-3.5 rounded-sm border border-white/80" />}
                    </span>
                    <span className="absolute bottom-1.5 right-1.5 bg-black/70 rounded px-1.5 text-[11px]">{money(dlPrice(p, album, aiPrice))}</span>
                  </button>
                );
              })}
            </div>
            {others.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold mb-2">Бусад сэдэвтэй зургууд</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {others.map(f => (
                    <button key={f.id} type="button" onClick={() => openFolder(f.id, f.name)}
                      className="shrink-0 bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-sm">{f.name}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {session.step === 'choices' && (
          <div className="space-y-3 max-w-lg mx-auto">
            {session.choices.map(c => {
              const p = photos.find(x => x.id === c.photoId);
              if (!p) return null;
              const prints = printOptions(p);
              const dlp = dlPrice(p, album, aiPrice);
              return (
                <div key={c.photoId} className="flex gap-3 bg-white/5 border border-white/10 rounded-2xl p-2">
                  <img src={p.watermarked_url} alt="" className="w-16 h-20 object-cover rounded-lg shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{p.name || p.title}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <button type="button" onClick={() => setChoice(c.photoId, { download: !c.download })}
                        className={`text-xs rounded-full px-3 py-1.5 border ${c.download ? 'bg-amber-500 text-stone-950 border-amber-500' : 'border-white/15'}`}>
                        Татах · {money(dlp)}
                      </button>
                      {prints.length > 0 && (
                        <button type="button" onClick={() => setChoice(c.photoId, { print: !c.print, printSize: c.printSize || prints[0][0] })}
                          className={`text-xs rounded-full px-3 py-1.5 border ${c.print ? 'bg-amber-500 text-stone-950 border-amber-500' : 'border-white/15'}`}>
                          Угаалгах · {money(Number(p.print_prices[c.printSize || prints[0][0]] || prints[0][1]))}
                        </button>
                      )}
                    </div>
                    {c.print && prints.length > 1 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {prints.map(([size, price]) => (
                          <button key={size} type="button" onClick={() => setChoice(c.photoId, { printSize: size, print: true })}
                            className={`text-[11px] rounded-lg px-2 py-1 ${c.printSize === size ? 'bg-white text-stone-950' : 'bg-white/10'}`}>
                            {PRINT_LABEL[size] || size} {money(price)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-right font-bold">Нийт {money(total)}</p>
            <button type="button" disabled={!ready || total <= 0} onClick={() => onCheckout(lines)}
              className="w-full bg-amber-500 disabled:opacity-40 text-stone-950 font-bold rounded-xl py-3.5">
              {total > 0 ? `QPay-ээр төлөх · ${money(total)}` : 'Үнэ байхгүй'}
            </button>
          </div>
        )}

        {session.step === 'done' && (
          <div className="max-w-md mx-auto space-y-3">
            {session.choices.some(c => c.download) && (
              <button type="button" onClick={downloadPaid} disabled={dlBusy}
                className="w-full bg-amber-500 disabled:opacity-50 text-stone-950 font-bold rounded-xl py-3.5 flex items-center justify-center gap-2">
                {dlBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Татах
              </button>
            )}
            {dlNote && <p className="text-sm text-stone-300">{dlNote}</p>}
            {paidInvoice && (
              <a href={`/receipt/${paidInvoice}`} className="block text-center text-amber-300 text-sm underline">Баримт үзэх</a>
            )}
          </div>
        )}
      </div>

      {session.step !== 'welcome' && session.step !== 'done' && session.step !== 'browse' && session.step !== 'choices' && (
        <form onSubmit={e => { e.preventDefault(); onFreeText(draft); }} className="shrink-0 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex gap-2 border-t border-white/10">
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Бичих..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none" />
          <button type="submit" className="bg-white/10 rounded-xl px-3" aria-label="Илгээх"><Send className="w-4 h-4" /></button>
        </form>
      )}

      {session.step === 'browse' && (
        <div className="shrink-0 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 flex items-center gap-3 bg-stone-950">
          <p className="text-sm flex-1">{session.selected.length} зураг · {money(running)}</p>
          <button type="button" onClick={finishSelect} disabled={!session.selected.length}
            className="bg-amber-500 disabled:opacity-40 text-stone-950 font-bold rounded-xl px-4 py-3 text-sm">
            Сонгож дууслаа
          </button>
        </div>
      )}
    </div>
  );
}
