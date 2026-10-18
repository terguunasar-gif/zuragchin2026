import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clapperboard, Download, Loader2, Play, RefreshCw, X } from 'lucide-react';
import BankLinks, { canOpenBankApps } from './BankLinks';
import {
  albumVideoApi, aspectForImage, VideoInvoice, VideoState, VideoTemplate, VideoTemplatesInfo,
} from '../lib/albumVideo';
import { saveImageToDevice } from '../lib/browserEnv';

type Step = 'pick' | 'pay' | 'processing' | 'done' | 'failed';

/**
 * Цомгийн эзэн: сонгосон зургаас AI видео бүтээх.
 * Загвар сонгох → QPay → Veo (≈1–3 мин) → цомгийн «🎬 AI видео» хавтсанд орно.
 */
export default function AlbumVideoCreator({ albumId, photo, isAdmin, onClose, onChanged }: {
  albumId: string;
  photo: { id: string; url: string };
  isAdmin?: boolean;
  onClose: () => void;
  /** Видео үүсэх/бэлэн болох үед цомгийн жагсаалтыг шинэчилнэ */
  onChanged: () => void;
}) {
  const [info, setInfo] = useState<VideoTemplatesInfo | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [picked, setPicked] = useState<VideoTemplate | null>(null);
  const [aspect, setAspect] = useState<'16:9' | '9:16'>('16:9');
  const [free, setFree] = useState(false);
  const [step, setStep] = useState<Step>('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState<VideoInvoice | null>(null);
  const [state, setState] = useState<VideoState | null>(null);
  const [videoId, setVideoId] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    albumVideoApi.templates().then(setInfo).catch(e => setLoadErr(e instanceof Error ? e.message : 'Алдаа'));
    const img = new Image();
    img.onload = () => setAspect(aspectForImage(img.naturalWidth, img.naturalHeight));
    img.src = photo.url;
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [photo.url]);

  // Төлбөр/видеог шалгах
  useEffect(() => {
    if (!videoId || (step !== 'pay' && step !== 'processing')) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await albumVideoApi.status(videoId);
        if (stop) return;
        setState(s);
        if (s.status === 'done') { setStep('done'); onChanged(); return; }
        if (s.status === 'failed') { setStep('failed'); onChanged(); return; }
        if (s.status === 'expired') { setError('Нэхэмжлэхийн хугацаа дууссан. Дахин оролдоно уу.'); setStep('pick'); return; }
        if (s.status !== 'pending_payment' && step === 'pay') { setStep('processing'); onChanged(); }
      } catch { /* дахин */ }
      if (!stop) timer.current = setTimeout(tick, step === 'pay' ? 3000 : 7000);
    };
    timer.current = setTimeout(tick, step === 'pay' ? 3000 : 5000);
    return () => { stop = true; if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, step]);

  async function begin() {
    if (!picked) return;
    setBusy(true); setError('');
    try {
      const inv = await albumVideoApi.start({ albumId, photoId: photo.id, templateId: picked.id, aspectRatio: aspect, free: isAdmin && free });
      setInvoice(inv);
      setVideoId(inv.videoId);
      setStep(inv.status === 'pending_payment' ? 'pay' : 'processing');
      if (inv.status !== 'pending_payment') onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Алдаа гарлаа');
    } finally { setBusy(false); }
  }

  async function retry() {
    setBusy(true); setError('');
    try {
      const s = await albumVideoApi.retry(videoId);
      setState(s);
      setStep(s.status === 'failed' ? 'failed' : 'processing');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Алдаа гарлаа');
    } finally { setBusy(false); }
  }

  const [saving, setSaving] = useState(false);
  async function download() {
    if (!state?.videoUrl) return;
    setSaving(true);
    try { await saveImageToDevice(state.videoUrl, `zuragchin-ai-video-${videoId.slice(0, 6)}.mp4`); }
    catch { window.open(state.videoUrl, '_blank'); }
    finally { setSaving(false); }
  }

  const price = info?.price ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-stone-950/85 backdrop-blur-sm" onClick={step === 'pick' || step === 'done' || step === 'failed' ? onClose : undefined} />
      <div className="relative bg-stone-900 border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <img src={photo.url} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" draggable={false} />
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold flex items-center gap-2"><Clapperboard className="w-4 h-4 text-fuchsia-300" /> AI видео үүсгэх</p>
            <p className="text-stone-500 text-xs truncate">
              {info ? `${info.seconds} секунд · ${aspect === '9:16' ? 'босоо' : 'хэвтээ'} · ₮${price.toLocaleString()}` : 'Ачаалж байна…'}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white p-1" aria-label="Хаах"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 'pick' && (
            loadErr ? <p className="text-red-400 text-sm">{loadErr}</p>
            : !info ? <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>
            : !info.enabled ? <p className="text-stone-400 text-sm text-center py-10">AI видео одоогоор хаалттай байна.</p>
            : (
              <>
                <p className="text-stone-400 text-sm mb-4">
                  Загвараа сонгоно уу. Видео эхний ~2 секундэд таны зураг хэвээрээ байж, дараа нь загварын дагуу хөдөлгөөнд орно.
                  Бэлэн видео цомгийн <b className="text-stone-200">🎬 AI видео</b> хавтсанд орж, дэлгэцийн горимд гарна.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {info.templates.map(tpl => (
                    <TemplateCard key={tpl.id} tpl={tpl} active={picked?.id === tpl.id} onPick={() => setPicked(tpl)} />
                  ))}
                </div>
              </>
            )
          )}

          {step === 'pay' && invoice && (
            <div className="text-center max-w-sm mx-auto">
              <p className="text-white font-semibold">{picked?.emoji} {picked?.name}</p>
              <p className="text-amber-400 font-bold text-2xl mt-1">₮{invoice.amount.toLocaleString()}</p>
              <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-4 py-1.5 text-sm my-4">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Төлбөр хүлээж байна…
              </div>
              {invoice.qrImage && (
                <div className="bg-white rounded-2xl p-4 inline-block mb-3">
                  <img src={`data:image/png;base64,${invoice.qrImage}`} alt="QPay QR" width={200} height={200} />
                </div>
              )}
              <p className="text-stone-400 text-sm mb-3">QPay апп-аар уншуулж төлнө үү</p>
              {invoice.urls && invoice.urls.length > 0 && (
                <div className="space-y-2">
                  {canOpenBankApps && <p className="text-stone-500 text-xs">Эсвэл апп-аар нээх:</p>}
                  <BankLinks urls={invoice.urls} />
                </div>
              )}
            </div>
          )}

          {step === 'processing' && (
            <div className="py-10 flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-full border-4 border-fuchsia-500/20 border-t-fuchsia-400 animate-spin" />
                <Clapperboard className="w-8 h-8 text-fuchsia-300 absolute inset-0 m-auto" />
              </div>
              <p className="text-white text-lg font-semibold">Видео бүтээж байна…</p>
              <p className="text-stone-400 text-sm mt-2 max-w-sm">
                Ихэвчлэн 1–3 минут болно. Энэ цонхыг хааж болно — видео бэлэн болмогц цомгийн «🎬 AI видео» хавтсанд автоматаар орно.
              </p>
            </div>
          )}

          {step === 'done' && state?.videoUrl && (
            <div className="max-w-md mx-auto space-y-4">
              <p className="flex items-center justify-center gap-2 text-green-400 font-semibold"><CheckCircle2 className="w-5 h-5" /> Видео бэлэн боллоо!</p>
              <video src={state.videoUrl} poster={state.posterUrl || undefined} autoPlay loop playsInline controls
                className="w-full rounded-2xl border border-white/10 bg-black" />
              <p className="text-stone-400 text-xs text-center">Цомгийн «🎬 AI видео» хавтсанд нэмэгдлээ.</p>
            </div>
          )}

          {step === 'failed' && (
            <div className="py-10 flex flex-col items-center text-center">
              <AlertCircle className="w-10 h-10 text-amber-400 mb-3" />
              <p className="text-white text-lg font-semibold mb-2">Видео бүтээгдэж чадсангүй</p>
              <p className="text-stone-400 text-sm max-w-sm">
                {state?.canRetry ? `${state.error} Нэмэлт төлбөргүйгээр дахин оролдох эсвэл өөр зураг сонгоно уу.`
                  : 'Олон удаа оролдсон ч бүтсэнгүй. Zuragchin.mn-тэй холбогдож төлбөрөө буцаалгана уу.'}
              </p>
            </div>
          )}

          {error && <p className="mt-4 text-red-400 text-sm text-center">{error}</p>}
        </div>

        {step === 'pick' && info?.enabled && (
          <div className="border-t border-white/10 p-4 space-y-3">
            <p className="text-stone-500 text-[11px] leading-snug">
              Зурган дээрх хүмүүс видеонд орохыг зөвшөөрсөн байх ёстой. AI царайг бага зэрэг өөрчилж болзошгүй.
            </p>
            {isAdmin && (
              <label className="flex items-center gap-2 text-xs text-stone-300">
                <input type="checkbox" checked={free} onChange={e => setFree(e.target.checked)} className="accent-amber-500" />
                Админ: төлбөргүй (туршилт / жишээ видео)
              </label>
            )}
            <button onClick={begin} disabled={!picked || busy}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-fuchsia-500 to-amber-500 hover:brightness-110 disabled:opacity-40 text-stone-950 font-bold rounded-xl py-3.5">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clapperboard className="w-5 h-5" />}
              {picked ? `«${picked.name}» видео үүсгэх · ${isAdmin && free ? 'үнэгүй' : `₮${price.toLocaleString()}`}` : 'Загвар сонгоно уу'}
            </button>
          </div>
        )}
        {step === 'done' && (
          <div className="border-t border-white/10 p-4 flex gap-3">
            <button onClick={download} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-bold rounded-xl py-3">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Татах
            </button>
            <button onClick={onClose} className="flex-1 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl py-3">Хаах</button>
          </div>
        )}
        {step === 'failed' && state?.canRetry && (
          <div className="border-t border-white/10 p-4">
            <button onClick={retry} disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-bold rounded-xl py-3.5">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />} Дахин бүтээх (үнэгүй)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({ tpl, active, onPick }: { tpl: VideoTemplate; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const hasVideo = !!tpl.sample_video_url;
  return (
    <button onClick={onPick}
      onMouseEnter={() => ref.current?.play().catch(() => {})}
      onMouseLeave={() => { if (ref.current && !active) { ref.current.pause(); ref.current.currentTime = 0; } }}
      className={`relative text-left rounded-xl overflow-hidden border transition-all ${
        active ? 'border-amber-400 ring-2 ring-amber-400/60' : 'border-white/10 hover:border-white/30'}`}>
      <div className="relative aspect-video bg-gradient-to-br from-fuchsia-900/60 via-stone-900 to-amber-900/40 flex items-center justify-center">
        {hasVideo ? (
          <video ref={ref} src={tpl.sample_video_url} poster={tpl.preview_url || undefined} muted loop playsInline preload="metadata"
            autoPlay={active} className="absolute inset-0 w-full h-full object-cover" />
        ) : tpl.preview_url ? (
          <img src={tpl.preview_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="text-4xl" aria-hidden>{tpl.emoji}</span>
        )}
        {hasVideo && !active && <Play className="absolute right-1.5 bottom-1.5 w-4 h-4 text-white/80 drop-shadow" />}
        {active && <CheckCircle2 className="absolute top-1.5 right-1.5 w-5 h-5 text-amber-400 drop-shadow" />}
      </div>
      <div className="p-2.5">
        <p className="text-white text-sm font-semibold leading-tight">{hasVideo || tpl.preview_url ? `${tpl.emoji} ` : ''}{tpl.name}</p>
        <p className="text-stone-400 text-[11px] leading-snug mt-1 line-clamp-3">{tpl.description}</p>
        {tpl.tags && <p className="text-fuchsia-300/80 text-[10px] mt-1.5 truncate">{tpl.tags}</p>}
      </div>
    </button>
  );
}
