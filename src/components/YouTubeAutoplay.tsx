import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

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
 */
export default function YouTubeAutoplay({ url, title }: { url: string; title: string }) {
  const yt = parseYouTube(url);
  const box = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [muted, setMuted] = useState(true);

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
      <button onClick={() => { send(muted ? 'unMute' : 'mute'); setMuted(m => !m); }}
        aria-label={muted ? 'Дуу асаах' : 'Дуу хаах'}
        className="absolute right-3 bottom-3 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 backdrop-blur text-white text-xs font-semibold px-3 py-2 rounded-full">
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />} {muted ? 'Дуу асаах' : 'Дуу хаах'}
      </button>
    </div>
  );
}
