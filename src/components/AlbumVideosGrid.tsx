import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Clapperboard, Download, Eye, EyeOff, Loader2, Monitor, MonitorOff, Trash2 } from 'lucide-react';
import { albumVideoApi, AlbumVideo, OwnerVideo, setVideoFlags } from '../lib/albumVideo';
import { saveImageToDevice } from '../lib/browserEnv';
import { useI18n } from '../lib/i18n';

/** Цомгийн «🎬 AI видео» хавтас. Эзэнд боловсруулж буй видео болон нуух/дэлгэцийн тохиргоо харагдана. */
export default function AlbumVideosGrid({ videos, ownerVideos, isOwner, onRefresh }: {
  videos: AlbumVideo[];
  ownerVideos: OwnerVideo[] | null;
  isOwner: boolean;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const list: (AlbumVideo & Partial<OwnerVideo>)[] = isOwner && ownerVideos ? ownerVideos : videos;

  // Эзэн: боловсруулж буй видеог үе үе шалгаж ахиулна
  const pending = isOwner ? list.filter(v => v.status === 'processing' || v.status === 'paid').map(v => v.id) : [];
  const pendingKey = pending.join(',');
  useEffect(() => {
    if (!pending.length) return;
    const tm = setInterval(async () => {
      const res = await Promise.all(pending.map(id => albumVideoApi.status(id).catch(() => null)));
      if (res.some(r => r && r.status !== 'processing' && r.status !== 'paid')) onRefresh();
    }, 8000);
    return () => clearInterval(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  if (list.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 bg-fuchsia-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clapperboard className="w-8 h-8 text-fuchsia-300" />
        </div>
        <p className="text-white font-medium text-lg mb-2">{t('AI видео алга байна')}</p>
        {isOwner && (
          <p className="text-stone-400 text-sm max-w-md mx-auto">
            «Бүгд» хавтаснаас зураг сонгоод <b className="text-fuchsia-300">🎬 Видео үүсгэх</b> товчийг дарна уу. Загвар сонгож төлбөрөө төлөхөд 1–3 минутад видео бэлэн болно.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {list.map(v => <VideoCard key={v.id} v={v} isOwner={isOwner} onRefresh={onRefresh} />)}
    </div>
  );
}

function VideoCard({ v, isOwner, onRefresh }: { v: AlbumVideo & Partial<OwnerVideo>; isOwner: boolean; onRefresh: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLVideoElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const status = v.status ?? 'done';

  async function act(kind: string, fn: () => Promise<unknown>) {
    setBusy(kind);
    try { await fn(); onRefresh(); }
    catch (e) { window.alert(e instanceof Error ? e.message : 'Алдаа'); }
    finally { setBusy(null); }
  }

  // Харагдах үед л тоглуулна (олон видео зэрэг тоглохгүй)
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.play().catch(() => {}); else el.pause();
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [v.video_url]);

  return (
    <div className={`bg-white/5 border rounded-2xl overflow-hidden ${v.hidden ? 'border-white/5 opacity-60' : 'border-white/10'}`}>
      <div className={`relative bg-black ${v.aspect_ratio === '9:16' ? 'aspect-[9/16] max-h-[70vh] mx-auto' : 'aspect-video'}`}>
        {status === 'done' && v.video_url ? (
          <video ref={ref} src={v.video_url} poster={v.poster_url || undefined} muted loop playsInline controls preload="metadata"
            className="absolute inset-0 w-full h-full object-contain" />
        ) : (
          <>
            {v.poster_url && <img src={v.poster_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
              {status === 'failed'
                ? <><AlertCircle className="w-8 h-8 text-amber-400 mb-2" /><p className="text-white text-sm font-semibold">Бүтээж чадсангүй</p>
                    <p className="text-stone-300 text-xs mt-1">Видео дээр дарж дахин оролдоно уу</p></>
                : <><Loader2 className="w-8 h-8 text-fuchsia-300 animate-spin mb-2" /><p className="text-white text-sm font-semibold">Видео бүтээж байна…</p>
                    <p className="text-stone-300 text-xs mt-1">1–3 минут</p></>}
            </div>
          </>
        )}
        <span className="absolute top-2 left-2 bg-black/70 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">🎬 {v.template_name || t('AI видео')}</span>
      </div>

      {(isOwner || status === 'done') && (
        <div className="p-2.5 flex items-center gap-1.5 flex-wrap">
          {status === 'done' && (
            <button onClick={() => act('dl', () => saveImageToDevice(v.video_url, `zuragchin-ai-video-${v.id.slice(0, 6)}.mp4`))}
              className="flex items-center gap-1.5 text-xs text-stone-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5">
              {busy === 'dl' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} {t('Татах')}
            </button>
          )}
          {isOwner && status === 'failed' && (
            <button onClick={() => act('retry', () => albumVideoApi.retry(v.id))}
              className="text-xs font-semibold text-stone-950 bg-amber-500 hover:bg-amber-400 rounded-lg px-2.5 py-1.5">
              {busy === 'retry' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Дахин бүтээх (үнэгүй)'}
            </button>
          )}
          {isOwner && status === 'done' && (
            <>
              <button onClick={() => act('hide', () => setVideoFlags(v.id, { hidden: !v.hidden }))}
                title={v.hidden ? 'Цомогт харуулах' : 'Зочдоос нуух'}
                className="flex items-center gap-1.5 text-xs text-stone-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5">
                {v.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {v.hidden ? 'Нуусан' : 'Харагдана'}
              </button>
              <button onClick={() => act('screen', () => setVideoFlags(v.id, { showOnScreen: !v.show_on_screen }))}
                title="Дэлгэцийн горимд (LED/ТВ) харуулах эсэх"
                className="flex items-center gap-1.5 text-xs text-stone-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5">
                {v.show_on_screen ? <Monitor className="w-3.5 h-3.5 text-green-400" /> : <MonitorOff className="w-3.5 h-3.5" />} {v.show_on_screen ? 'Дэлгэцэнд' : 'Дэлгэцгүй'}
              </button>
            </>
          )}
          {isOwner && status !== 'processing' && status !== 'paid' && (
            <button onClick={() => { if (window.confirm('Энэ видеог бүр мөсөн устгах уу?')) act('del', () => albumVideoApi.remove(v.id)); }}
              title="Устгах" className="ml-auto text-stone-500 hover:text-red-400 p-1.5">
              {busy === 'del' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
