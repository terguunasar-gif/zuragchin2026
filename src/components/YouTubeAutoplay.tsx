import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Volume2, VolumeX, X } from 'lucide-react';

/** YouTube холбоосоос видеоны ID ба босоо (Shorts) эсэхийг гаргана */
export function parseYouTube(url: string): { id: string; vertical: boolean } | null {
  const u = (url || '').trim();
  if (!u) return null;
  const m = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  const id = m?.[1] ?? (/^[A-Za-z0-9_-]{11}$/.test(u) ? u : '');
  return id ? { id, vertical: /\/shorts\//.test(u) } : null;
}

/**
 * Нүүр хуудасны танилцуулга видео: дэлгэцэнд гарч ирмэгц дуугүйгээр автоматаар тоглож, давтагдана.
 * Гүйлгээд өнгөрөхөд түр зогсоно. Дууг товчоор асаана.
 * Видео дээр дарахад бүтэн дэлгэцээр (дуутай, YouTube-ийн удирдлагатай) нээгдэнэ.
 */
export default function YouTubeAutoplay({ url, title }: { url: string; title: string }) {
  const yt = parseYouTube(url);
  const box = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [muted, setMuted] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const send = (func: string) =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');

  useEffect(() => {
    const el = box.current;
    if (!el || !yt) return;
    if (!('IntersectionObserver' in window)) { setMounted(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setMounted(true); send('playVideo'); } else send('pauseVideo');
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [yt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openFull = () => { send('pauseVideo'); setExpanded(true); };
  const closeFull = () => { setExpanded(false); send('playVideo'); };

  if (!yt) return null;
  const src = `https://www.youtube-nocookie.com/embed/${yt.id}?autoplay=1&mute=1&loop=1&playlist=${yt.id}`
    + '&playsinline=1&controls=0&rel=0&modestbranding=1&enablejsapi=1&iv_load_policy=3';

  return (
    <div ref={box}
      className={`relative mx-auto overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl shadow-black/50 ${
        yt.vertical ? 'aspect-[9/16] w-full max-w-[320px]' : 'aspect-video w-full max-w-4xl'}`}>
      {/* Видео ачаалагдах хүртэл YouTube-ийн нүүр зураг */}
      <img src={`https://i.ytimg.com/vi/${yt.id}/hqdefault.jpg`} alt="" aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-70" />
      {mounted && (
        <iframe ref={frame} src={src} title={title} loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
          className="absolute inset-0 w-full h-full pointer-events-none" />
      )}
      {/* Видео дээр дарахад бүтэн дэлгэц */}
      <button type="button" onClick={openFull} aria-label="Бүтэн дэлгэцээр үзэх"
        className="absolute inset-0 w-full h-full cursor-pointer" />
      <button type="button" onClick={openFull} aria-label="Бүтэн дэлгэц"
        className="absolute left-3 bottom-3 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 backdrop-blur text-white text-xs font-semibold px-3 py-2 rounded-full">
        <Maximize2 className="w-4 h-4" /> Томоор үзэх
      </button>
      <button type="button" onClick={() => { send(muted ? 'unMute' : 'mute'); setMuted(m => !m); }}
        aria-label={muted ? 'Дуу асаах' : 'Дуу хаах'}
        className="absolute right-3 bottom-3 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 backdrop-blur text-white text-xs font-semibold px-3 py-2 rounded-full">
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />} {muted ? 'Дуу асаах' : 'Дуу хаах'}
      </button>
      {expanded && <FullscreenPlayer id={yt.id} vertical={yt.vertical} title={title} onClose={closeFull} />}
    </div>
  );
}

/** Бүтэн дэлгэцийн тоглуулагч: боломжтой бол жинхэнэ fullscreen + хөндлөн эргүүлэх, үгүй бол (iPhone) дэлгэц дүүргэсэн цонх */
function FullscreenPlayer({ id, vertical, title, onClose }: { id: string; vertical: boolean; title: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = root.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    try {
      const p = el?.requestFullscreen?.() ?? el?.webkitRequestFullscreen?.();
      Promise.resolve(p).then(() => {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        if (!vertical) o?.lock?.('landscape').catch(() => {});
      }).catch(() => {});
    } catch { /* fullscreen дэмжихгүй — цонх хэвээр */ }

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onFsChange = () => { if (!document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    try { (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.(); } catch { /* */ }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); // fullscreenchange → onClose
    else onClose();
  }

  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&controls=1&rel=0&modestbranding=1&fs=1`;
  return createPortal(
    <div ref={root} role="dialog" aria-modal="true" aria-label={title}
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
      <iframe src={src} title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
        className={vertical ? 'h-full max-h-full aspect-[9/16] max-w-full' : 'w-full max-w-full aspect-video max-h-full'} />
      <button type="button" onClick={close} aria-label="Хаах"
        className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white flex items-center justify-center"
        style={{ marginTop: 'env(safe-area-inset-top)' }}>
        <X className="w-6 h-6" />
      </button>
    </div>,
    document.body,
  );
}
