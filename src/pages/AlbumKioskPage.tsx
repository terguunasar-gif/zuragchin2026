import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, ChevronLeft, ChevronRight, Grid2x2, Grid3x3, LayoutGrid, Loader2, Maximize, Minimize, ScanLine, Square, X } from 'lucide-react';
import { fetchAllPages } from '../lib/fetchAll';
import { supabase } from '../lib/supabase';
import { albumLockState } from '../lib/albumLock';
import { albumOrFilter, isMissingColumnError, normalizeShareLink, readAlbumQuery } from '../lib/albumLink';
import { formatPrintDay, printOrdersOpen } from '../lib/printDeadline';
import AlbumPinGate from '../components/AlbumPinGate';
import BrandMark from '../components/BrandMark';
import { KIOSK_LAYOUT_KEY, movePage, pageStartIndex, parseKioskLayout, type KioskLayout } from '../lib/kioskLayout';

/**
 * Томоор үзүүлэх дэлгэц (киоск) — арга хэмжээн дээр ТВ / монитор / таблет дээр цомгийн зургийг
 * бүтэн дэлгэцээр (тамгатай preview) гүйлгэж үзнэ.
 * Нэг зураг (анхдагч), 4 эсвэл 9 зураг зэрэг. Олон горимд зураг бүр зөвхөн дугаартай;
 * дарахад нэг зургийн горим нээгдэж, QR тэнд харагдана.
 * Сонгосон горим нь төхөөрөмж дээр хадгалагдана.
 */

interface KPhoto { id: string; url: string; folder_id: string | null; source: string | null }
interface Folder { id: string; name: string }

function readLayout(): KioskLayout {
  try { return parseKioskLayout(localStorage.getItem(KIOSK_LAYOUT_KEY)); } catch { return 1; }
}

function photoAddUrl(shareLink: string, id: string) {
  return `${window.location.origin}/album/${shareLink}?add=${id}`;
}

export default function AlbumKioskPage() {
  const { shareLink: shareParam = '' } = useParams();
  const shareLink = normalizeShareLink(shareParam);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const folder = params.get('f') || 'all';

  const [album, setAlbum] = useState<{ id: string; name: string; print_deadline?: string | null } | null>(null);
  const [state, setState] = useState<'loading' | 'notfound' | 'offline' | 'locked' | 'ready'>('loading');
  const [photos, setPhotos] = useState<KPhoto[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [idx, setIdx] = useState(0);
  const [grid, setGrid] = useState(false);
  const [layout, setLayoutState] = useState<KioskLayout>(readLayout);
  /** «Очих»-оор ирсэн зургийг олон горимд тодруулна. Хуудас солиход арилна. */
  const [mark, setMark] = useState<number | null>(null);
  const tokenRef = useRef('');
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const setLayout = useCallback((v: KioskLayout) => {
    setLayoutState(v);
    try { localStorage.setItem(KIOSK_LAYOUT_KEY, String(v)); } catch { /* хувийн цонх */ }
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    if (!shareLink) { setState('notfound'); return; }
    let loaded = await readAlbumQuery(() =>
      supabase.from('albums').select('id, name, title, status, print_deadline').or(albumOrFilter(shareLink)).maybeSingle());
    if (loaded.error && isMissingColumnError(loaded.error)) {
      loaded = await readAlbumQuery(() =>
        supabase.from('albums').select('id, name, title, status').or(albumOrFilter(shareLink)).maybeSingle());
    }
    const { data, error } = loaded;
    if (error) { setState('offline'); return; }
    const album = data as { id: string; name: string; title: string | null; status: string; print_deadline?: string | null } | null;
    if (!album || album.status !== 'active') { setState('notfound'); return; }
    setAlbum({ id: album.id, name: album.title || album.name, print_deadline: album.print_deadline ?? null });
    const lock = await albumLockState(album.id);
    if (lock.state === 'locked') { setState('locked'); return; }
    tokenRef.current = lock.state === 'ok' ? lock.token : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: any[] | null = null;
    // 1000-аас олон зурагтай цомог: 1000-аар нь хуудаслан бүгдийг уншина (Supabase max_rows)
    if (tokenRef.current) {
      ({ data: rows } = await fetchAllPages((from, to) =>
        supabase.rpc('locked_album_photos', { p_album_id: album.id, p_token: tokenRef.current }).range(from, to)));
    } else {
      const res = await fetchAllPages((from, to) => supabase.from('photo_uploads').select('id, preview_url, source, folder_id, hidden_at')
        .eq('album_id', album.id).is('hidden_at', null).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to));
      rows = res.error
        ? (await fetchAllPages((from, to) => supabase.from('photo_uploads').select('id, preview_url, source, folder_id')
            .eq('album_id', album.id).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to))).data
        : res.data;
    }
    setPhotos((rows ?? []).filter(r => r.preview_url).map(r => ({
      id: r.id, url: r.preview_url, folder_id: r.folder_id ?? null, source: r.source ?? null,
    })));
    const { data: f } = await supabase.from('album_folders').select('id, name').eq('album_id', album.id).order('sort_order', { ascending: true });
    setFolders((f ?? []) as Folder[]);
    setState('ready');
  }, [shareLink]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => photos.filter(p =>
    folder === 'all' ? true : folder === 'ai' ? p.source === 'ai_booth' : p.folder_id === folder), [photos, folder]);
  // Дугаар цомог даяар давтагдахгүй (хавтас бүрт 1-ээс биш) — утас, цомгийн хуудастай ижил
  const numOf = useMemo(() => new Map(photos.map((p, i) => [p.id, i + 1])), [photos]);
  const folderCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of photos) if (p.folder_id) m.set(p.folder_id, (m.get(p.folder_id) ?? 0) + 1);
    return m;
  }, [photos]);
  const pendingJump = useRef<string | null>(null);
  useEffect(() => {
    const target = pendingJump.current;
    pendingJump.current = null;
    const i = target ? shown.findIndex(p => p.id === target) : -1;
    if (i >= 0) { setIdx(i); setMark(i); } else { setIdx(0); setMark(null); }
  }, [folder]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = shown.length;
  const safeIdx = count ? Math.min(Math.max(idx, 0), count - 1) : 0;
  const pageStart = pageStartIndex(safeIdx, count, layout);
  const pageEnd = Math.min(pageStart + layout, count);
  const cur = shown[safeIdx];
  const go = useCallback((d: number) => {
    setMark(null);
    setIdx(i => movePage(i, d, count, layout));
  }, [count, layout]);

  const openSingle = useCallback((index: number) => {
    if (swiped.current) return;
    setIdx(index);
    setLayout(1);
  }, [setLayout]);

  // Гар: ← → хуудсаар (1 горимд нэг зургаар), Home/End
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') { setIdx(0); setMark(0); }
      else if (e.key === 'End') { const last = Math.max(count - 1, 0); setIdx(last); setMark(last); }
      else if (e.key === 'Escape') setGrid(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, count]);

  // Хуруугаар шударч нэг хуудас гүйлгэнэ. Шидэлт дараагийн товшилтыг нээхгүй.
  const onTouchStart = (e: React.TouchEvent) => {
    swiped.current = false;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      go(dx < 0 ? 1 : -1);
    }
  };

  // Нэг зургийн горимд хөршийг урьдчилан ачаална. 4/9 горимд зөвхөн энэ хуудсыг зурна —
  // бусдыг нь урьдчилж тайлах нь таблет дээр бүтэн зургуудыг зэрэг задлуулдаг.
  useEffect(() => {
    if (!count || layout !== 1) return;
    for (const d of [1, 2, -1]) {
      const p = shown[(safeIdx + d + count) % count];
      if (p) { const img = new Image(); img.src = p.url; }
    }
  }, [safeIdx, shown, count, layout]);

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
    setJump('');
    const target = photos[n - 1];
    if (!target) return;
    const i = shown.findIndex(p => p.id === target.id);
    if (i >= 0) { setIdx(i); setMark(i); return; }
    // Өөр хавтсанд байна — «Бүх зураг» руу шилжээд тэр зураг руу очно
    pendingJump.current = target.id;
    setFolder('all');
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
  if (state === 'offline') {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-xl font-semibold">Сүлжээ удаан байна</p>
        <button type="button" onClick={() => load()} className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl">Дахин оролдох</button>
      </div>
    );
  }
  if (state === 'locked' && album) {
    return <AlbumPinGate albumId={album.id} albumName={album.name} onUnlocked={load} />;
  }

  const addUrl = cur ? photoAddUrl(shareLink, cur.id) : '';
  const hasAi = photos.some(p => p.source === 'ai_booth');
  const multi = layout === 4 || layout === 9;
  const pagePhotos = shown.slice(pageStart, pageEnd);
  const side = layout === 9 ? 3 : 2;

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col select-none overscroll-none">
      {/* Дээд мөр */}
      <div className="flex items-center gap-2 px-3 py-2 bg-stone-950/95 border-b border-white/10 text-sm flex-wrap">
        <button onClick={() => navigate(-1)} title="Буцах" className="p-2 rounded-lg hover:bg-white/10"><ArrowLeft className="w-4 h-4" /></button>
        <BrandMark className="w-7 h-7" />
        <p className="font-bold truncate max-w-[28vw] sm:max-w-[40vw]">{album?.name}</p>
        {album?.print_deadline && (
          <span className={`text-xs truncate ${printOrdersOpen(album.print_deadline) ? 'text-amber-200' : 'text-stone-400'}`}>
            {printOrdersOpen(album.print_deadline)
              ? `Угаалгах ${formatPrintDay(album.print_deadline)} хүртэл`
              : 'Угаалгах хугацаа дууссан'}
          </span>
        )}
        <div className="flex-1" />
        {multi && count > 0 && (
          <span className="tabular-nums font-bold whitespace-nowrap text-white">
            №{numOf.get(shown[pageStart]?.id) ?? pageStart + 1}{pageEnd > pageStart + 1 ? `–${numOf.get(shown[pageEnd - 1]?.id) ?? pageEnd}` : ''}<span className="text-stone-500 font-semibold"> · {count} зураг</span>
          </span>
        )}
        <select value={folder} onChange={e => setFolder(e.target.value)}
          className="bg-stone-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none">
          <option value="all">Бүх зураг ({photos.length})</option>
          {hasAi && <option value="ai">✨ AI бүүт</option>}
          {folders.map(f => <option key={f.id} value={f.id}>{f.name} ({folderCount.get(f.id) ?? 0})</option>)}
        </select>
        <form onSubmit={e => { e.preventDefault(); doJump(); }} className="flex items-center gap-1">
          <input value={jump} onChange={e => setJump(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="№"
            className="w-16 bg-stone-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none text-center" />
          <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15">Очих</button>
        </form>
        <div className="flex flex-shrink-0 rounded-lg overflow-hidden border border-white/10" role="group" aria-label="Харагдац">
          {([
            [1, '1 зураг', Square],
            [4, '4 зураг', Grid2x2],
            [9, '9 зураг', Grid3x3],
          ] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setLayout(k)} title={label} aria-label={label} aria-pressed={layout === k}
              className={`p-2 transition-colors ${layout === k ? 'bg-amber-500 text-stone-950' : 'text-stone-200 hover:bg-white/10'}`}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <button onClick={() => setGrid(true)} title="Бүх зураг" className="p-2 rounded-lg hover:bg-white/10"><LayoutGrid className="w-4 h-4" /></button>
        <button onClick={toggleFull} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 rounded-lg px-3 py-1.5">
          {isFull ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />} <span className="hidden sm:inline">{isFull ? 'Гарах' : 'Бүтэн дэлгэц'}</span>
        </button>
      </div>

      {count === 0 ? (
        <div className="flex-1 flex items-center justify-center text-stone-500 text-xl">Зураг алга</div>
      ) : multi ? (
        <div className="relative min-h-0 flex-1 overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div
            className="absolute inset-0 grid overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${side}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${side}, minmax(0, 1fr))`,
              gap: '0.5rem',
              padding: '0.5rem 3.25rem',
            }}
          >
            {pagePhotos.map((p, i) => {
              const index = pageStart + i;
              return (
                <KioskTile
                  key={p.id}
                  photo={p}
                  num={numOf.get(p.id) ?? index + 1}
                  perPage={layout}
                  marked={mark === index}
                  onOpen={() => openSingle(index)}
                />
              );
            })}
          </div>
          <button type="button" onClick={() => go(-1)} aria-label="Өмнөх"
            className="absolute left-1 md:left-1.5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 md:w-12 md:h-12 rounded-full bg-black/55 hover:bg-black/75 border border-white/20 flex items-center justify-center">
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Дараах"
            className="absolute right-1 md:right-1.5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 md:w-12 md:h-12 rounded-full bg-black/55 hover:bg-black/75 border border-white/20 flex items-center justify-center">
            <ChevronRight className="w-7 h-7" />
          </button>
        </div>
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
              №{numOf.get(cur.id) ?? safeIdx + 1}<span className="text-stone-400 text-sm md:text-base font-semibold"> · {safeIdx + 1}/{count}</span>
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
              <button key={p.id} onClick={() => { setIdx(i); setMark(i); setGrid(false); }}
                className={`relative aspect-square rounded-lg overflow-hidden bg-stone-900 ${i === safeIdx ? 'ring-4 ring-amber-400' : ''}`}>
                <img src={p.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                <span className="absolute left-1 bottom-1 bg-black/70 rounded px-1.5 text-xs font-bold">{numOf.get(p.id) ?? i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KioskTile({
  photo, num, perPage, marked, onOpen,
}: {
  photo: KPhoto;
  num: number;
  perPage: 4 | 9;
  marked: boolean;
  onOpen: () => void;
}) {
  const dense = perPage === 9;
  return (
    <button
      type="button"
      onClick={onOpen}
      onContextMenu={e => e.preventDefault()}
      aria-label={`№${num} зургийг бүтнээр харах`}
      className={`relative h-full min-h-0 min-w-0 overflow-hidden rounded-xl bg-stone-900 ring-1 ${
        marked ? 'ring-2 ring-amber-400' : 'ring-white/15'
      }`}
    >
      <img
        src={photo.url}
        alt=""
        draggable={false}
        decoding="async"
        className="absolute inset-0 h-full w-full object-contain"
      />
      <span className={`absolute left-1.5 top-1.5 bg-black/75 border border-white/20 rounded-lg font-extrabold leading-none ${
        marked ? 'text-amber-300' : 'text-white'
      } ${dense ? 'px-1.5 py-1 text-sm md:text-base' : 'px-2 py-1.5 text-lg md:text-2xl'}`}>
        №{num}
      </span>
    </button>
  );
}
