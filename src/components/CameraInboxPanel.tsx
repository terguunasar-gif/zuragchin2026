import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, AlertCircle, Loader2, Pause, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * 📷 Камераас шууд — Sony камер FTP → Couchdrop → хувийн `camera-inbox/<album_id>/` bucket.
 * Энэ самбар нээлттэй байх хугацаанд inbox-ыг 4 сек тутам шалгаж, шинэ зураг бүрийг ердийн байршуулалтын
 * дарааллаар (тамга, preview, thumb, квот, царай) боловсруулаад цомогт нэмж, inbox-оос устгана.
 * Хоёр төхөөрөмж зэрэг нээлттэй байсан ч `camera_inbox_claim` нэг файлыг нэг л удаа авна.
 */

const BUCKET = 'camera-inbox';
const POLL_MS = 4000;
const MAX_BYTES = 80 * 1024 * 1024;
const MAX_TRIES = 3;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

interface InboxFile { id: string; path: string; name: string; size: number; created: string }
interface LogItem { key: string; name: string; status: 'working' | 'done' | 'error' | 'skip'; msg?: string; at: number }

export interface CameraInboxPanelProps {
  albumId: string;
  /** Нэг файлыг боловсруулж цомогт нэмнэ. Амжилттай бол photo_uploads.id буцаана. */
  process: (file: File, onProgress: (p: number) => void) => Promise<string | null>;
}

async function listAll(albumId: string): Promise<InboxFile[]> {
  // Storage list API нь S3-ээр орсон файлыг заримдаа харуулдаггүй тул DB-ээс шууд авна
  const { data, error } = await supabase.rpc('camera_inbox_list', { p_album_id: albumId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; name: string; size: number; created_at: string }[]).map(o => ({
    id: o.id,
    path: o.name,
    name: o.name.split('/').pop() ?? o.name,
    size: Number(o.size ?? 0),
    created: o.created_at ?? '',
  }));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function CameraInboxPanel({ albumId, process }: CameraInboxPanelProps) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState<{ name: string; progress: number } | null>(null);
  const [queued, setQueued] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [log, setLog] = useState<LogItem[]>([]);
  const [fatal, setFatal] = useState('');
  const [lastCheck, setLastCheck] = useState<number | null>(null);

  const processRef = useRef(process);
  processRef.current = process;
  const onRef = useRef(on);
  onRef.current = on;
  const tries = useRef<Map<string, number>>(new Map());

  const pushLog = (item: Omit<LogItem, 'at'>) =>
    setLog(prev => [{ ...item, at: Date.now() }, ...prev.filter(l => l.key !== item.key)].slice(0, 30));

  // Дэлгэц унтахаас сэргийлнэ (зөөврийн компьютер/утсан дээр)
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () => navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => null);
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => null); };
  }, [on]);

  // Хуудсыг санамсаргүй хаахаас сэргийлнэ
  useEffect(() => {
    if (!on) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [on]);

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    setFatal('');
    (async () => {
      while (!cancelled && onRef.current) {
        try {
          const files = (await listAll(albumId))
            .filter(f => (tries.current.get(f.id) ?? 0) < MAX_TRIES);
          setLastCheck(Date.now());
          setQueued(files.length);
          for (const f of files) {
            if (cancelled || !onRef.current) break;
            if (!IMAGE_EXT.test(f.name)) {
              tries.current.set(f.id, MAX_TRIES);
              pushLog({ key: f.id, name: f.name, status: 'skip', msg: 'JPEG биш (RAW/видео) — алгаслаа' });
              continue;
            }
            if (f.size > MAX_BYTES) {
              tries.current.set(f.id, MAX_TRIES);
              pushLog({ key: f.id, name: f.name, status: 'skip', msg: '80 MB-аас том' });
              continue;
            }
            const { data: claimed, error: claimErr } = await supabase.rpc('camera_inbox_claim', { p_object_id: f.id, p_name: f.path });
            if (claimErr) throw new Error(claimErr.message);
            if (!claimed) continue; // өөр төхөөрөмж боловсруулж байна / аль хэдийн орсон

            setBusy({ name: f.name, progress: 0 });
            pushLog({ key: f.id, name: f.name, status: 'working' });
            try {
              const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(f.path);
              if (dlErr || !blob) throw new Error(dlErr?.message ?? 'Татаж чадсангүй');
              const type = /\.png$/i.test(f.name) ? 'image/png' : /\.webp$/i.test(f.name) ? 'image/webp' : 'image/jpeg';
              const file = new File([blob], f.name, { type, lastModified: Date.parse(f.created) || Date.now() });
              const photoId = await processRef.current(file, p => setBusy({ name: f.name, progress: p }));
              await supabase.rpc('camera_inbox_done', { p_object_id: f.id, p_photo_id: photoId, p_error: null });
              await supabase.storage.from(BUCKET).remove([f.path]);
              tries.current.delete(f.id);
              setDoneCount(n => n + 1);
              pushLog({ key: f.id, name: f.name, status: 'done' });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              tries.current.set(f.id, (tries.current.get(f.id) ?? 0) + 1);
              await supabase.rpc('camera_inbox_done', { p_object_id: f.id, p_photo_id: null, p_error: msg });
              pushLog({ key: f.id, name: f.name, status: 'error', msg });
              // Квот/багц дүүрсэн бол цааш оролдох нь утгагүй — зогсооно
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
  }, [on, albumId]);

  return (
    <div className={`rounded-2xl p-5 border ${on ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-white font-semibold flex items-center gap-2">
            <Camera className="w-4 h-4 text-amber-400" /> Камераас шууд (FTP)
            {on && <span className="ml-1 inline-flex items-center gap-1 text-xs text-emerald-300"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> идэвхтэй</span>}
          </p>
          <p className="text-stone-400 text-sm mt-1">
            Камераас FTP-ээр ирсэн зураг тамга, хэвлэх үнэ, хавтасны тохиргоогоор автоматаар цомогт орно.
            Энэ хуудсыг <b className="text-stone-200">нээлттэй</b> байлгана (дэлгэц унтахгүй).
          </p>
        </div>
        <button onClick={() => setOn(v => !v)}
          className={`flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${on ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-amber-500 text-stone-950 hover:bg-amber-400'}`}>
          {on ? <><Pause className="w-4 h-4" /> Зогсоох</> : <><Play className="w-4 h-4" /> Эхлүүлэх</>}
        </button>
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

      {fatal && (
        <p className="mt-3 text-sm text-red-300 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {fatal}</p>
      )}

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

      <p className="mt-3 text-[11px] text-stone-500 break-all">Inbox: {BUCKET}/{albumId}/</p>
    </div>
  );
}
