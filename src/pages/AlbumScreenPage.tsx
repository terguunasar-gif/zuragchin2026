import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Grid2x2, Loader2, Maximize, Minimize, Square, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { albumLockState } from '../lib/albumLock';
import AlbumPinGate from '../components/AlbumPinGate';
import BrandMark from '../components/BrandMark';
import { albumVideoApi, fetchAlbumVideos } from '../lib/albumVideo';

/**
 * Дэлгэцийн горим — LED дэлгэц, хүлээлгийн танхимын ТВ-д цомгийн зургийг урсган харуулна.
 * Буланд цомгийн QR (үнэ харуулахгүй) — уншуулсан хүн цомог руу орж худалдаж авна.
 * Шинэ зураг 30 секунд тутам автоматаар нэмэгдэнэ.
 * Цомгийн AI видео (эзэн «Дэлгэцэнд» гэж тэмдэглэсэн) зургийн дунд бүтнээрээ тоглогдоно.
 */

interface ScreenPhoto { id: string; url: string; source: string | null; folder_id: string | null; created_at: string; video?: string }
interface Folder { id: string; name: string }

const POLL_MS = 30_000;
const SPEEDS = [4, 6, 10];

export default function AlbumScreenPage() {
  const { shareLink = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const speed = SPEEDS.includes(Number(params.get('s'))) ? Number(params.get('s')) : 6;
  const folder = params.get('f') || 'all';
  const mode = params.get('m') === 'grid' ? 'grid' : 'single';

  const [album, setAlbum] = useState<{ id: string; name: string } | null>(null);
  const [state, setState] = useState<'loading' | 'notfound' | 'locked' | 'ready'>('loading');
  const [photos, setPhotos] = useState<ScreenPhoto[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const tokenRef = useRef('');
  const knownRef = useRef<Set<string>>(new Set());

  const albumUrl = `${window.location.origin}/album/${shareLink}`;

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };

  // ── Цомог олох + түгжээ шалгах ──
  const load = useCallback(async () => {
    setState('loading');
    const byLink = `share_link.eq./album/${shareLink},share_link.eq.${shareLink},id.eq.${shareLink}`;
    const { data } = await supabase.from('albums').select('id, name, title, status').or(byLink).maybeSingle();
    if (!data || data.status !== 'active') { setState('notfound'); return; }
    setAlbum({ id: data.id, name: data.title || data.name });
    const lock = await albumLockState(data.id);
    if (lock.state === 'locked') { setState('locked'); return; }
    tokenRef.current = lock.state === 'ok' ? lock.token : '';
    const { data: f } = await supabase.from('album_folders').select('id, name').eq('album_id', data.id).order('sort_order', { ascending: true });
    setFolders((f ?? []) as Folder[]);
    setState('ready');
  }, [shareLink]);

  useEffect(() => { load(); }, [load]);

  // ── Зураг татах (эхний удаа + 30 секунд тутам шинийг нэмнэ) ──
  const fetchPhotos = useCallback(async (initial: boolean) => {
    if (!album) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: any[] | null = null;
    if (tokenRef.current) {
      ({ data: rows } = await supabase.rpc('locked_album_photos', { p_album_id: album.id, p_token: tokenRef.current }));
    } else {
      const res = await supabase.from('photo_uploads').select('id, preview_url, source, folder_id, created_at, hidden_at')
        .eq('album_id', album.id).is('hidden_at', null).order('created_at', { ascending: false }).limit(1000);
      rows = res.error
        ? (await supabase.from('photo_uploads').select('id, preview_url, source, folder_id, created_at')
            .eq('album_id', album.id).order('created_at', { ascending: false }).limit(1000)).data
        : res.data;
    }
    const photoList: ScreenPhoto[] = (rows ?? []).filter(r => r.preview_url).map(r => ({
      id: r.id, url: r.preview_url, source: r.source ?? null, folder_id: r.folder_id ?? null, created_at: r.created_at,
    }));
    // AI видео — боловсруулж буйг ахиулаад бэлэн, дэлгэцэнд зөвшөөрсөнийг нэмнэ
    if (initial) albumVideoApi.advance(album.id);
    const vids = (await fetchAlbumVideos(album.id, tokenRef.current)).filter(v => v.show_on_screen && v.video_url);
    const list: ScreenPhoto[] = [
      ...vids.map(v => ({ id: `v-${v.id}`, url: v.poster_url, source: 'ai_video', folder_id: null, created_at: v.created_at, video: v.video_url })),
      ...photoList,
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (initial) {
      knownRef.current = new Set(list.map(p => p.id));
      setPhotos(list);
      return;
    }
    const added = list.filter(p => !knownRef.current.has(p.id));
    const ids = new Set(list.map(p => p.id));
    added.forEach(p => knownRef.current.add(p.id));
    setPhotos(prev => [...added, ...prev.filter(p => ids.has(p.id))]);
    if (added.length) setFreshIds(prev => new Set([...prev, ...added.map(p => p.id)]));
  }, [album]);

  useEffect(() => {
    if (state !== 'ready') return;
    fetchPhotos(true);
    const t = setInterval(() => fetchPhotos(false), POLL_MS);
    return () => clearInterval(t);
  }, [state, fetchPhotos]);

  const shown = useMemo(() => photos.filter(p =>
    folder === 'all' ? true
      : folder === 'ai' ? p.source === 'ai_booth'
      : folder === 'videos' ? !!p.video
      : p.folder_id === folder), [photos, folder]);

  // ── Слайд солих ──
  const [idx, setIdx] = useState(0);
  const [order, setOrder] = useState<string[]>([]);
  // Зураг нэмэгдэх/хасагдах үед дарааллыг шинэчилнэ — шинэ зураг (хамгийн сүүлд орсон) түрүүлж гарна
  const shownKey = shown.map(p => p.id).join(',');
  useEffect(() => { setOrder(shown.map(p => p.id)); setIdx(0); }, [shownKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const perSlide = mode === 'grid' ? 6 : 1;
  const next = useCallback(() => setIdx(i => (i + perSlide) % Math.max(order.length, 1)), [perSlide, order.length]);
  const [muted, setMuted] = useState(true);

  const byId = useMemo(() => new Map(photos.map(p => [p.id, p])), [photos]);
  const current = useMemo(() => {
    const out: ScreenPhoto[] = [];
    for (let k = 0; k < Math.min(perSlide, order.length); k++) {
      const p = byId.get(order[(idx + k) % order.length]);
      if (p && !out.includes(p)) out.push(p);
    }
    return out;
  }, [order, idx, perSlide, byId]);

  // Слайд солих: зураг — тохируулсан хугацаагаар; нэг видео — дуустал тоглоно (дээд тал нь 30 сек)
  const singleVideo = mode === 'single' && !!current[0]?.video;
  useEffect(() => {
    if (order.length === 0) return;
    const t = setTimeout(next, singleVideo ? 30_000 : speed * 1000);
    return () => clearTimeout(t);
  }, [idx, order, speed, next, singleVideo]);

  // Дараагийн зургийг урьдчилан ачаална
  useEffect(() => {
    for (let k = perSlide; k < perSlide * 2 && order.length; k++) {
      const p = byId.get(order[(idx + k) % order.length]);
      if (p && p.url && !p.video) { const img = new Image(); img.src = p.url; }
    }
  }, [idx, order, perSlide, byId]);

  // ── Дэлгэц унтрахаас сэргийлэх, удирдлагыг нуух ──
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

  const [controls, setControls] = useState(true);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poke = () => {
    setControls(true);
    if (hideT.current) clearTimeout(hideT.current);
    hideT.current = setTimeout(() => setControls(false), 3500);
  };
  useEffect(() => { poke(); return () => { if (hideT.current) clearTimeout(hideT.current); }; }, []);

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

  if (state === 'loading') {
    return <div className="fixed inset-0 bg-black flex items-center justify-center"><Loader2 className="w-10 h-10 text-amber-400 animate-spin" /></div>;
  }
  if (state === 'notfound') {
    return <div className="fixed inset-0 bg-black text-stone-400 flex items-center justify-center">Цомог олдсонгүй</div>;
  }
  if (state === 'locked' && album) {
    return <AlbumPinGate albumId={album.id} albumName={album.name} onUnlocked={load} />;
  }

  const hasAi = photos.some(p => p.source === 'ai_booth');
  const hasVideo = photos.some(p => !!p.video);

  return (
    <div className={`fixed inset-0 bg-black overflow-hidden select-none ${controls ? '' : 'cursor-none'}`} onMouseMove={poke} onClick={poke}>
      <style>{`
        @keyframes zmKen { from { transform: scale(1.0) translate(0,0); } to { transform: scale(1.12) translate(-1.5%, -1%); } }
        @keyframes zmKen2 { from { transform: scale(1.12) translate(1.5%, 1%); } to { transform: scale(1.0) translate(0,0); } }
        @keyframes zmFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zmPop { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.08); opacity: 1 } 100% { transform: scale(1) } }
      `}</style>

      {current.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-500 gap-3">
          <BrandMark className="w-16 h-16 opacity-60" />
          <p className="text-xl">Зураг удахгүй гарна…</p>
        </div>
      ) : mode === 'single' ? (
        // Нэг зураг — бүдэг арын дэвсгэр + аажим томрох эффект
        <div key={current[0].id} className="absolute inset-0" style={{ animation: 'zmFade 1.2s ease both' }}>
          {current[0].url && <img src={current[0].url} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-40" />}
          {current[0].video ? (
            <video src={current[0].video} poster={current[0].url || undefined} autoPlay muted={muted} playsInline loop={order.length === 1}
              onEnded={next} onError={next} className="absolute inset-0 w-full h-full object-contain" />
          ) : (
            <img src={current[0].url} alt="" draggable={false}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ animation: `${idx % 2 ? 'zmKen2' : 'zmKen'} ${speed + 1.5}s ease-out both` }} />
          )}
          {freshIds.has(current[0].id) && <NewBadge />}
        </div>
      ) : (
        // Тор — 6 зураг зэрэг
        <div key={order[idx]} className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-2 p-2 portrait:grid-cols-2 portrait:grid-rows-3">
          {current.map((p, k) => (
            <div key={p.id} className="relative overflow-hidden rounded-xl bg-stone-900"
              style={{ animation: `zmFade .9s ease ${k * 0.12}s both` }}>
              {p.video
                ? <video src={p.video} poster={p.url || undefined} autoPlay muted loop playsInline className="w-full h-full object-cover" />
                : <img src={p.url} alt="" draggable={false} className="w-full h-full object-cover"
                    style={{ animation: `${k % 2 ? 'zmKen2' : 'zmKen'} ${speed + 1.5}s ease-out both` }} />}
              {freshIds.has(p.id) && <NewBadge small />}
            </div>
          ))}
        </div>
      )}

      {/* Цомгийн нэр */}
      <div className="absolute left-0 top-0 p-5 md:p-8 flex items-center gap-3 pointer-events-none">
        <BrandMark className="w-9 h-9 md:w-12 md:h-12 drop-shadow-lg" />
        <div className="drop-shadow-[0_2px_8px_rgba(0,0,0,.9)]">
          <p className="text-white font-bold text-lg md:text-3xl leading-tight">{album?.name}</p>
          <p className="text-amber-300 text-xs md:text-base font-brand">zuragchin.mn</p>
        </div>
      </div>

      {/* Цомгийн QR — үнэ харуулахгүй */}
      <div className="absolute right-4 bottom-4 md:right-8 md:bottom-8 bg-white rounded-2xl p-3 md:p-4 shadow-2xl flex items-center gap-3 md:gap-4 max-w-[90vw]">
        <QRCodeSVG value={albumUrl} size={512} level="M" className="w-24 h-24 md:w-36 md:h-36 lg:w-44 lg:h-44 flex-shrink-0" />
        <div className="text-stone-900 pr-1 hidden sm:block">
          <p className="font-extrabold text-base md:text-2xl leading-tight">Зургаа олоорой!</p>
          <p className="text-stone-600 text-xs md:text-base mt-1 leading-snug">QR уншуулаад цомог руу орж<br />зургаа татаж аваарай</p>
        </div>
      </div>

      {/* Удирдлага — хулгана хөдөлгөхөд гарна */}
      <div className={`absolute left-1/2 -translate-x-1/2 top-4 transition-opacity duration-300 ${controls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex flex-wrap items-center justify-center gap-2 bg-stone-950/85 backdrop-blur border border-white/10 rounded-2xl p-2 text-sm text-white">
          <button onClick={() => navigate(-1)} title="Буцах" className="p-2 rounded-lg hover:bg-white/10"><ArrowLeft className="w-4 h-4" /></button>
          <select value={folder} onChange={e => set('f', e.target.value)}
            className="bg-stone-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none">
            <option value="all">Бүх зураг</option>
            {hasAi && <option value="ai">✨ Зөвхөн AI бүүт</option>}
            {hasVideo && <option value="videos">🎬 Зөвхөн AI видео</option>}
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {SPEEDS.map(s => (
              <button key={s} onClick={() => set('s', String(s))}
                className={`px-2.5 py-1.5 ${speed === s ? 'bg-amber-500 text-stone-950 font-semibold' : 'hover:bg-white/10'}`}>{s}с</button>
            ))}
          </div>
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button onClick={() => set('m', 'single')} title="Нэг зураг" className={`p-2 ${mode === 'single' ? 'bg-amber-500 text-stone-950' : 'hover:bg-white/10'}`}><Square className="w-4 h-4" /></button>
            <button onClick={() => set('m', 'grid')} title="Тор (6 зураг)" className={`p-2 ${mode === 'grid' ? 'bg-amber-500 text-stone-950' : 'hover:bg-white/10'}`}><Grid2x2 className="w-4 h-4" /></button>
          </div>
          {hasVideo && (
            <button onClick={() => setMuted(m => !m)} title={muted ? 'Видеоны дууг асаах' : 'Дууг хаах'} className="p-2 rounded-lg hover:bg-white/10">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}
          <button onClick={toggleFull} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 rounded-lg px-3 py-1.5">
            {isFull ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />} {isFull ? 'Гарах' : 'Бүтэн дэлгэц'}
          </button>
          <span className="text-stone-400 px-1">{shown.length} {folder === 'videos' ? 'видео' : 'зураг'}</span>
        </div>
      </div>
    </div>
  );
}

function NewBadge({ small }: { small?: boolean }) {
  return (
    <span className={`absolute ${small ? 'top-2 right-2 text-xs px-2 py-0.5' : 'top-24 right-6 md:top-8 md:right-8 text-lg md:text-2xl px-4 py-1.5'} bg-amber-500 text-stone-950 font-extrabold rounded-full shadow-xl`}
      style={{ animation: 'zmPop .6s ease both' }}>
      ШИНЭ
    </span>
  );
}
