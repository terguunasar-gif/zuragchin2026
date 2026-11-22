import { useEffect, useRef, useState } from 'react';
import { Loader2, Printer, Power } from 'lucide-react';
import { printPurchaseSilently } from '../lib/printPhoto';

export interface AutoPrintItem { id: string; label: string }

const POLL_MS = 12000;

/**
 * «Автомат принт»: асаалттай үед хуудас 12 сек тутам шинэ төлөгдсөн угаах захиалга шалгаж,
 * ирмэгц өөрөө хэвлэнэ. Асаах үед байсан (хуучин) захиалгыг хэвлэхгүй — зөвхөн шинээр ирснийг.
 * Тохиргоо энэ төхөөрөмж дээр хадгалагдана (хуудас дахин ачаалсан ч асаалттай үлдэнэ).
 */
export default function AutoPrintBar({ storageKey, fetchPending, onPrinted }: {
  /** Төхөөрөмж дээр асаалттай эсэхийг хадгалах түлхүүр */
  storageKey: string;
  /** Төлөгдсөн, хэвлээгүй угаах захиалгууд (шинэ нь эхэндээ) */
  fetchPending: () => Promise<AutoPrintItem[]>;
  onPrinted?: (id: string) => void;
}) {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(storageKey) === '1'; } catch { return false; } });
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<{ t: string; text: string; ok: boolean }[]>([]);
  const [queued, setQueued] = useState(0);
  const seen = useRef<Set<string> | null>(null); // асаах үед байсан захиалгууд
  const queue = useRef<AutoPrintItem[]>([]);
  const running = useRef(false);
  const fetchRef = useRef(fetchPending);
  fetchRef.current = fetchPending;
  const printedRef = useRef(onPrinted);
  printedRef.current = onPrinted;

  function addLog(text: string, ok = true) {
    const t = new Date().toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    setLog(prev => [{ t, text, ok }, ...prev].slice(0, 8));
  }

  async function drain() {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length) {
        const item = queue.current.shift()!;
        setQueued(queue.current.length);
        setBusy(item.label);
        try {
          await printPurchaseSilently(item.id);
          printedRef.current?.(item.id);
          addLog(`Хэвлэлээ: ${item.label}`);
        } catch (e) {
          addLog(`Алдаа (${item.label}): ${e instanceof Error ? e.message : 'хэвлэж чадсангүй'} — «Принт» товчоор дахин хэвлэнэ үү`, false);
        }
      }
    } finally {
      running.current = false;
      setBusy(null);
      setQueued(0);
    }
  }

  useEffect(() => {
    if (!on) { seen.current = null; return; }
    let stop = false;
    const tick = async () => {
      let items: AutoPrintItem[];
      try { items = await fetchRef.current(); } catch { return; }
      if (stop) return;
      if (!seen.current) {
        // Эхний удаа: одоо байгаа хэвлээгүй захиалгыг «харсан» гэж тэмдэглэнэ (хуучныг бөөнөөр хэвлэхгүй)
        seen.current = new Set(items.map(i => i.id));
        addLog(items.length
          ? `Асаалаа. Өмнөх ${items.length} хэвлээгүй захиалгыг «Принт» товчоор гараар хэвлэнэ. Шинэ захиалга хүлээж байна…`
          : 'Асаалаа. Шинэ захиалга хүлээж байна…');
        return;
      }
      const fresh = items.filter(i => !seen.current!.has(i.id)).reverse(); // хуучнаас нь эхэлж
      if (!fresh.length) return;
      fresh.forEach(i => seen.current!.add(i.id));
      queue.current.push(...fresh);
      setQueued(queue.current.length);
      void drain();
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => { stop = true; window.clearInterval(id); };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    const next = !on;
    setOn(next);
    try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* */ }
    if (!next) { queue.current = []; setQueued(0); addLog('Унтраалаа.'); }
  }

  return (
    <div className={`rounded-xl border p-3 mb-4 ${on ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <Printer className={`w-5 h-5 ${on ? 'text-emerald-400' : 'text-stone-500'}`} />
        <div className="flex-1 min-w-[200px]">
          <p className="text-white text-sm font-semibold">
            Автомат принт {on ? <span className="text-emerald-400">· асаалттай</span> : <span className="text-stone-500">· унтраалттай</span>}
          </p>
          <p className="text-stone-400 text-xs">
            {on
              ? (busy ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Хэвлэж байна: {busy}{queued ? ` · дараалалд ${queued}` : ''}</span>
                : 'Шинэ төлөгдсөн угаах захиалга ирмэгц энэ компьютерийн принтерээр өөрөө хэвлэнэ. Хуудсыг нээлттэй байлгана уу.')
              : 'Асаавал төлбөр төлөгдмөгц угаах зураг шууд хэвлэгдэнэ. Зөвхөн хэвлэдэг нэг компьютер дээр асаана уу.'}
          </p>
        </div>
        <button type="button" onClick={toggle}
          className={`flex items-center gap-1.5 text-sm font-bold px-3 py-2 rounded-lg ${on ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-emerald-500 text-stone-950 hover:bg-emerald-400'}`}>
          <Power className="w-4 h-4" /> {on ? 'Унтраах' : 'Асаах'}
        </button>
      </div>
      {on && (
        <p className="text-stone-500 text-[11px] mt-2">
          Хэвлэх цонх асуулгүй шууд хэвлүүлэх бол Chrome-ыг <code className="text-stone-300">--kiosk-printing</code> тохиргоотой нээж, принтерээ «Default» болгоно.
        </p>
      )}
      {log.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {log.map((l, k) => (
            <li key={k} className={`text-[11px] ${l.ok ? 'text-stone-400' : 'text-red-300'}`}>{l.t} — {l.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
