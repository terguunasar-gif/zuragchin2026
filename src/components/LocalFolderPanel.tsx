import { useEffect, useRef, useState } from 'react';
import { FolderOpen, CheckCircle2, AlertCircle, Loader2, Pause, Play } from 'lucide-react';

/**
 * 📁 Компьютерийн хавтаснаас шууд — Sony камер FTP-ээр ЭНЭ компьютер дээрх FTP сервер (FileZilla Server)
 * рүү зураг илгээнэ → тэр хавтсыг энэ самбар 3 сек тутам шалгаж, шинэ зураг бүрийг ердийн байршуулалтын
 * дарааллаар (тамга, preview, thumb, квот, царай) цомогт нэмнэ. Файлыг устгахгүй — орсон файлуудыг
 * энэ төхөөрөмж дээр (localStorage) тэмдэглэж, дахин оруулахгүй. Chrome / Edge шаардана.
 */

const POLL_MS = 3000;
const MAX_BYTES = 80 * 1024 * 1024;
const MAX_TRIES = 3;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/* eslint-disable @typescript-eslint/no-explicit-any */
type DirHandle = any;

interface LogItem { key: string; name: string; status: 'working' | 'done' | 'error' | 'skip'; msg?: string }

export interface LocalFolderPanelProps {
  albumId: string;
  process: (file: File, onProgress: (p: number) => void) => Promise<string | null>;
}

const storeKey = (albumId: string) => `zm_local_done_${albumId}`;
function loadDone(albumId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(storeKey(albumId)) ?? '[]')); } catch { return new Set(); }
}
function saveDone(albumId: string, s: Set<string>) {
  try { localStorage.setItem(storeKey(albumId), JSON.stringify([...s].slice(-20000))); } catch { /* ignore */ }
}

async function walk(dir: DirHandle, path = '', depth = 0, out: { key: string; handle: any; name: string }[] = []) {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith('.') || name.startsWith('~')) continue;
    if (h.kind === 'directory') { if (depth < 4) await walk(h, `${path}${name}/`, depth + 1, out); continue; }
    if (IMAGE_EXT.test(name)) out.push({ key: `${path}${name}`, handle: h, name });
  }
  return out;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function LocalFolderPanel({ albumId, process }: LocalFolderPanelProps) {
  const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  const [dir, setDir] = useState<DirHandle | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState<{ name: string; progress: number } | null>(null);
  const [queued, setQueued] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [log, setLog] = useState<LogItem[]>([]);
  const [fatal, setFatal] = useState('');
  const [lastCheck, setLastCheck] = useState<number | null>(null);

  const processRef = useRef(process); processRef.current = process;
  const onRef = useRef(on); onRef.current = on;
  const tries = useRef<Map<string, number>>(new Map());
  const seen = useRef<Map<string, string>>(new Map()); // key -> "size|mtime" (бичигдэж дууссан эсэх)

  const pushLog = (item: LogItem) => setLog(prev => [item, ...prev.filter(l => l.key !== item.key)].slice(0, 30));

  async function pickFolder() {
    setFatal('');
    try {
      const h = await (window as any).showDirectoryPicker({ id: 'zm-camera', mode: 'read' });
      setDir(h);
      setOn(true);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setFatal((e as Error).message);
    }
  }

  // Дэлгэц унтахаас сэргийлнэ
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () => navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => null);
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => null); };
  }, [on]);

  useEffect(() => {
    if (!on) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [on]);

  useEffect(() => {
    if (!on || !dir) return;
    let cancelled = false;
    const done = loadDone(albumId);
    (async () => {
      while (!cancelled && onRef.current) {
        try {
          const entries = await walk(dir);
          const pending: { key: string; file: File }[] = [];
          for (const e of entries) {
            if ((tries.current.get(e.key) ?? 0) >= MAX_TRIES) continue;
            const file: File = await e.handle.getFile();
            const sig = `${file.size}|${file.lastModified}`;
            const doneKey = `${e.key}|${sig}`;
            if (done.has(doneKey)) continue;
            // FTP бичиж дуусаагүй файлыг алгасна: 2 удаа дараалан ижил хэмжээтэй байх ёстой
            const prev = seen.current.get(e.key);
            seen.current.set(e.key, sig);
            if (prev !== sig || file.size === 0) continue;
            pending.push({ key: e.key, file });
          }
          pending.sort((a, b) => a.file.lastModified - b.file.lastModified);
          setLastCheck(Date.now());
          setQueued(pending.length);

          for (const p of pending) {
            if (cancelled || !onRef.current) break;
            const sig = `${p.file.size}|${p.file.lastModified}`;
            if (p.file.size > MAX_BYTES) {
              tries.current.set(p.key, MAX_TRIES);
              pushLog({ key: p.key, name: p.file.name, status: 'skip', msg: '80 MB-аас том' });
              continue;
            }
            setBusy({ name: p.file.name, progress: 0 });
            pushLog({ key: p.key, name: p.file.name, status: 'working' });
            try {
              const type = /\.png$/i.test(p.file.name) ? 'image/png' : /\.webp$/i.test(p.file.name) ? 'image/webp' : 'image/jpeg';
              const f = new File([p.file], p.file.name, { type, lastModified: p.file.lastModified });
              await processRef.current(f, pr => setBusy({ name: p.file.name, progress: pr }));
              done.add(`${p.key}|${sig}`);
              saveDone(albumId, done);
              tries.current.delete(p.key);
              setDoneCount(n => n + 1);
              setQueued(q => Math.max(0, q - 1));
              pushLog({ key: p.key, name: p.file.name, status: 'done' });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              tries.current.set(p.key, (tries.current.get(p.key) ?? 0) + 1);
              pushLog({ key: p.key, name: p.file.name, status: 'error', msg });
              if (/хязгаар|quota/i.test(msg)) { setFatal(msg); setOn(false); break; }
            } finally {
              setBusy(null);
            }
          }
        } catch (err) {
          setFatal(err instanceof Error ? err.message : String(err));
        }
        await sleep(POLL_MS);
      }
    })();
    return () => { cancelled = true; };
  }, [on, dir, albumId]);

  if (!supported) {
    return (
      <div className="rounded-2xl p-5 border bg-white/5 border-white/10 text-sm text-stone-400">
        <p className="text-white font-semibold flex items-center gap-2 mb-1"><FolderOpen className="w-4 h-4 text-amber-400" /> Компьютерийн хавтаснаас шууд</p>
        Энэ горим зөвхөн компьютерийн <b className="text-stone-200">Chrome</b> эсвэл <b className="text-stone-200">Edge</b> дээр ажиллана.
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-5 border ${on ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-white font-semibold flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-amber-400" /> Компьютерийн хавтаснаас шууд
            {on && <span className="ml-1 inline-flex items-center gap-1 text-xs text-emerald-300"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> идэвхтэй</span>}
          </p>
          <p className="text-stone-400 text-sm mt-1">
            Камер FTP-ээр энэ компьютер рүү илгээсэн зураг (FileZilla Server-ийн хавтас) тамга, хэвлэх үнэ, хавтасны
            тохиргоогоор автоматаар цомогт орно. Хуудсыг <b className="text-stone-200">нээлттэй</b> байлгана.
          </p>
          {dir && <p className="text-[11px] text-stone-500 mt-1">Хавтас: {dir.name}</p>}
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          {!dir ? (
            <button onClick={pickFolder}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-stone-950 hover:bg-amber-400">
              <FolderOpen className="w-4 h-4" /> Хавтас сонгох
            </button>
          ) : (
            <>
              <button onClick={() => setOn(v => !v)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${on ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-amber-500 text-stone-950 hover:bg-amber-400'}`}>
                {on ? <><Pause className="w-4 h-4" /> Зогсоох</> : <><Play className="w-4 h-4" /> Эхлүүлэх</>}
              </button>
              {!on && <button onClick={pickFolder} className="text-xs text-stone-400 hover:text-white">Өөр хавтас</button>}
            </>
          )}
        </div>
      </div>

      {(on || doneCount > 0) && (
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="bg-black/20 rounded-xl py-2"><p className="text-white text-lg font-bold">{doneCount}</p><p className="text-stone-400 text-xs">цомогт орсон</p></div>
          <div className="bg-black/20 rounded-xl py-2"><p className="text-white text-lg font-bold">{queued}</p><p className="text-stone-400 text-xs">хүлээгдэж буй</p></div>
          <div className="bg-black/20 rounded-xl py-2"><p className="text-white text-lg font-bold">{lastCheck ? new Date(lastCheck).toLocaleTimeString('mn-MN') : '—'}</p><p className="text-stone-400 text-xs">сүүлд шалгасан</p></div>
        </div>
      )}

      {busy && (
        <div className="mt-3 flex items-center gap-2 text-sm text-stone-200">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span className="truncate">{busy.name}</span>
          <span className="ml-auto text-stone-400">{busy.progress}%</span>
        </div>
      )}

      {fatal && <p className="mt-3 text-sm text-red-300 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {fatal}</p>}

      {log.length > 0 && (
        <ul className="mt-3 max-h-48 overflow-auto space-y-1 text-xs">
          {log.map(l => (
            <li key={l.key} className="flex items-center gap-2 text-stone-300">
              {l.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              {l.status === 'working' && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />}
              {(l.status === 'error' || l.status === 'skip') && <AlertCircle className={`w-3.5 h-3.5 ${l.status === 'error' ? 'text-red-400' : 'text-stone-500'}`} />}
              <span className="truncate">{l.name}</span>
              {l.msg && <span className="text-stone-500 truncate">— {l.msg}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
