import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, ChevronLeft, ChevronRight, LayoutGrid, Loader2, Maximize, Minimize, ScanLine, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { albumLockState } from '../lib/albumLock';
import AlbumPinGate from '../components/AlbumPinGate';
import BrandMark from '../components/BrandMark';

/**
 * Томоор үзүүлэх дэлгэц (киоск) — арга хэмжээн дээр ТВ / монитор / таблет дээр цомгийн зургийг
 * нэг нэгээр нь бүтэн дэлгэцээр (тамгатай preview) гүйлгэж үзнэ.
 * Зураг бүрийн хажууд тухайн зургийн QR: утасны камераар уншуулахад zuragchin.mn-ийн сагсанд шууд орно,
 * дараагийн зургийг сагсны «QR уншуулах» товчоор нэмнэ.
 */

interface KPhoto { id: string; url: string; folder_id: string | null; source: string | null }
interface Folder { id: string; name: string }

export default function AlbumKioskPage() {
  const { shareLink = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const folder = params.get('f') || 'all';

  const [album, setAlbum] = useState<{ id: string; name: string } | null>(null);
  const [state, setState] = useState<'loading' | 'notfound' | 'locked' | 'ready'>('loading');
  const [photos, setPhotos] = useState<KPhoto[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [idx, setIdx] = useState(0);
  const [grid, setGrid] = useState(false);
  const tokenRef = useRef('');

  const load = useCallback(async () => {
    setState('loading');
    const byLink = `share_link.eq./album/${shareLink},share_link.eq.${shareLink},id.eq.${shareLink}`;
    const { data } = await supabase.from('albums').select('id, name, title, status').or(byLink).maybeSingle();
    if (!data || data.status !== 'active') { setState('notfound'); return; }
    setAlbum({ id: data.id, name: data.title || data.name });
    const lock = await albumLockState(data.id);
    if (lock.state === 'locked') { setState('locked'); return; }
    tokenRef.current = lock.state === 'ok' ? lock.token : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: any[] | null = null;
    if (tokenRef.current) {
      ({ data: rows } = await supabase.rpc('locked_album_photos', { p_album_id: data.id, p_token: tokenRef.current }));
    } else {
      const res = await supabase.from('photo_uploads').select('id, preview_url, source, folder_id, hidden_at')
        .eq('album_id', data.id).is('hidden_at', null).order('created_at', { ascending: true }).limit(3000);
      rows = res.error
        ? (await supabase.from('photo_uploads').select('id, preview_url, source, folder_id')
            .eq('album_id', data.id).order('created_at', { ascending: true }).limit(3000)).data
        : res.data;
    }
    setPhotos((rows ?? []).filter(r => r.preview_url).map(r => ({
      id: r.id, url: r.preview_url, folder_id: r.folder_id ?? null, source: r.source ?? null,
    })));
    const { data: f } = await supabase.from('album_folders').select('id, name').eq('album_id', data.id).order('sort_order', { ascending: true });
    setFolders((f ?? []) as Folder[]);
    setState('ready');
  }, [shareLink]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => photos.filter(p =>
    folder === 'all' ? true : folder === 'ai' ? p.source === 'ai_booth' : p.folder_id === folder), [photos, folder]);
  useEffect(() => { setIdx(0); }, [folder]);

  const count = shown.length;
  const cur = shown[Math.min(idx, Math.max(count - 1, 0))];
  const go = useCallback((d: number) => setIdx(i => (count ? (i + d + count) % count : 0)), [count]);

  // Гар: ← → , Home/End
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') setIdx(0);
      else if (e.key === 'End') setIdx(Math.max(count - 1, 0));
      else if (e.key === 'Escape') setGrid(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, count]);

  // Хуруугаар шударч гүйлгэх
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  };

  // Хөрш зургуудыг урьдчилан ачаална
  useEffect(() => {
    for (const d of [1, 2, -1]) {
      const p = shown[(idx + d + count) % (count || 1)];
      if (p) { const img = new Image(); img.src = p.url; }
    }
  }, [idx, shown, count]);

  // Дэлгэц унтрахаас сэргийлнэ
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lock: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    const req = () => nav.wakeLock?.request('screen').then((l: unknown) => { lock = l; }).catch(() => {});
    req();
    const onVis = () => { if (document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.(); };
  }, []);

  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const f = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const [jump, setJump] = useState('');
  const doJump = () => {
    const n = parseInt(jump, 10);
    if (n >= 1 && n <= count) setIdx(n - 1);
    setJump('');
  };

  const setFolder = (v: string) => {
    const p = new URLSearchParams(params);
    if (v === 'all') p.delete('f'); else p.set('f', v);
    setParams(p, { replace: true });
  };

  if (state === 'loading') {
    return <div className="fixed inset-0 bg-black flex items-center justify-center"><Loader2 className="w-10 h-10 text-amber-400 animate-spin" /></div>;
  }
  if (state === 'notfound') {
    return <div className="fixed inset-0 bg-black text-stone-400 flex items-center justify-center">Цомог олдсонгүй</div>;
  }
  if (state === 'locked' && album) {
    return <AlbumPinGate albumId={album.id} albumName={album.name} onUnlocked={load} />;
  }

  const addUrl = cur ? `${window.location.origin}/album/${shareLink}?add=${cur.id}` : '';
  const hasAi = photos.some(p => p.source === 'ai_booth');

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col select-none">
      {/* Дээд мөр */}
      <div className="flex items-center gap-2 px-3 py-2 bg-stone-950/95 border-b border-white/10 text-sm flex-wrap">
        <button onClick={() => navigate(-1)} title="Буцах" className="p-2 rounded-lg hover:bg-white/10"><ArrowLeft className="w-4 h-4" /></button>
        <BrandMark className="w-7 h-7" />
        <p className="font-bold truncate max-w-[40vw]">{album?.name}</p>
        <div className="flex-1" />
        <select value={folder} onChange={e => setFolder(e.target.value)}
          className="bg-stone-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none">
          <option value="all">Бүх зураг</option>
          {hasAi && <option value="ai">✨ AI бүүт</option>}
          {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <form onSubmit={e => { e.preventDefault(); doJump(); }} className="flex items-center gap-1">
          <input value={jump} onChange={e => setJump(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="№"
            className="w-16 bg-stone-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none text-center" />
          <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15">Очих</button>
        </form>
        <button onClick={() => setGrid(true)} title="Бүх зураг" className="p-2 rounded-lg hover:bg-white/10"><LayoutGrid className="w-4 h-4" /></button>
        <button onClick={toggleFull} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 rounded-lg px-3 py-1.5">
          {isFull ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />} <span className="hidden sm:inline">{isFull ? 'Гарах' : 'Бүтэн дэлгэц'}</span>
        </button>
      </div>

      {count === 0 ? (
        <div className="flex-1 flex items-center justify-center text-stone-500 text-xl">Зураг алга</div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col landscape:flex-row">
          {/* Зураг */}
          <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <img key={`bg-${cur.id}`} src={cur.url} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-30" />
            <img key={cur.id} src={cur.url} alt="" draggable={false} onContextMenu={e => e.preventDefault()}
              className="absolute inset-0 w-full h-full object-contain p-2" />
            <button onClick={() => go(-1)} aria-label="Өмнөх"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-14 h-14 md:w-16 md:h-16 rounded-full bg-black/50 hover:bg-black/70 border border-white/20 flex items-center justify-center">
              <ChevronLeft className="w-8 h-8" />
            </button>
            <button onClick={() => go(1)} aria-label="Дараах"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-14 h-14 md:w-16 md:h-16 rounded-full bg-black/50 hover:bg-black/70 border border-white/20 flex items-center justify-center">
              <ChevronRight className="w-8 h-8" />
            </button>
            <span className="absolute left-3 top-3 bg-black/70 border border-white/15 rounded-xl px-3 py-1.5 text-lg md:text-2xl font-extrabold">
              №{idx + 1}<span className="text-stone-400 text-sm md:text-base font-semibold"> / {count}</span>
            </span>
          </div>

          {/* QR — сагсанд нэмэх */}
          <div className="flex-shrink-0 bg-white text-stone-900 flex landscape:flex-col items-center justify-center gap-3 md:gap-4 p-3 md:p-5 landscape:w-[min(34vw,380px)]">
            <QRCodeSVG value={addUrl} size={512} level="M"
              className="w-32 h-32 sm:w-40 sm:h-40 landscape:w-[min(28vw,320px)] landscape:h-[min(28vw,320px)] flex-shrink-0" />
            <div className="landscape:text-center">
              <p className="font-extrabold text-lg md:text-2xl leading-tight flex items-center gap-2 landscape:justify-center">
                <ScanLine className="w-6 h-6 text-amber-500" /> Энэ зургийг авах уу?
              </p>
              <p className="text-stone-600 text-sm md:text-base mt-1.5 leading-snug">
                Утасныхаа камераар уншуулахад<br className="hidden landscape:inline" /> зураг <b>сагсанд</b> орно.
              </p>
              <p className="text-stone-500 text-xs md:text-sm mt-2 leading-snug">
                Дараагийн зургийг сагсан дахь<br className="hidden landscape:inline" /> «QR уншуулах» товчоор нэмнэ.
              </p>
              <p className="text-amber-600 font-brand font-bold text-sm mt-2">zuragchin.mn</p>
            </div>
          </div>
        </div>
      )}

      {/* Жижиг зургийн тор — хүссэн зураг руу шууд очих */}
      {grid && (
        <div className="fixed inset-0 z-50 bg-stone-950/97 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <p className="font-semibold">{count} зураг — дарж очно</p>
            <button onClick={() => setGrid(false)} className="p-2 rounded-lg hover:bg-white/10"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-2 content-start">
            {shown.map((p, i) => (
              <button key={p.id} onClick={() => { setIdx(i); setGrid(false); }}
                className={`relative aspect-square rounded-lg overflow-hidden bg-stone-900 ${i === idx ? 'ring-4 ring-amber-400' : ''}`}>
                <img src={p.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                <span className="absolute left-1 bottom-1 bg-black/70 rounded px-1.5 text-xs font-bold">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
