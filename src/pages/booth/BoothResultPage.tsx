import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, Download, Image as ImageIcon, Loader2, RefreshCw, Sparkles, Video } from 'lucide-react';
import { boothApi, BoothResult, saveImageToDevice, saveHint, StartResult } from '../../lib/aiBooth';

// Kiosk дээрх QR-аар нээгдэх хуудас: зөвхөн тухайн нэг зураг эсвэл 360° видеог харуулна.
// Видео авсан зочин эндээс зургаа тусад нь худалдаж авч болно.
export default function BoothResultPage() {
  const { resultToken = '' } = useParams<{ resultToken: string }>();
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'processing' | 'failed' | 'ready' | 'error'>('loading');
  const [round, setRound] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<BoothResult | null>(null);
  const [media, setMedia] = useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<'shared' | 'downloaded' | null>(null);
  const [buyOpen, setBuyOpen] = useState(params.get('buy') === '1');

  useEffect(() => {
    let objectUrl = '';
    let stop = false;
    const load = async () => {
      try {
        const r = await boothApi.result(resultToken);
        if (stop) return;
        setRes(r);
        if (r.failed) { setState('failed'); return; }
        if (r.processing) { setState('processing'); setTimeout(load, 6000); return; }
        const src = r.videoUrl || r.imageUrl;
        if (!src) throw new Error('Олдсонгүй');
        const blob = await (await fetch(src)).blob();
        objectUrl = URL.createObjectURL(blob);
        setMedia({ blob, url: objectUrl });
        setState('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Зураг олдсонгүй');
        setState('error');
      }
    };
    load();
    return () => { stop = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [resultToken, round]);

  async function retry() {
    setRetrying(true);
    try {
      await boothApi.retryVideo(resultToken);
      setState('processing');
      setRound(r => r + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Алдаа гарлаа');
      setState('error');
    } finally { setRetrying(false); }
  }

  const isVideo = !!res?.videoUrl;

  async function save() {
    if (!media) return;
    setSaving(true);
    const r = await saveImageToDevice(media.blob, `zuragchin-${isVideo ? '360' : 'ai'}-${resultToken.slice(0, 6)}.${isVideo ? 'mp4' : 'jpg'}`);
    setSaving(false);
    setSaved(r);
  }

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <header className="px-4 py-4 flex items-center gap-3 border-b border-white/10">
        <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-stone-950" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{res?.albumName || 'AI зураг'}</p>
          <p className="text-xs text-stone-500">zuragchin.mn · AI бүүт</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6">
        {state === 'loading' && (
          <div className="min-h-[60vh] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          </div>
        )}
        {state === 'processing' && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
              <Video className="w-8 h-8 text-amber-400 absolute inset-0 m-auto" />
            </div>
            <p className="text-xl font-semibold mb-1">360° видео бэлтгэж байна…</p>
            <p className="text-stone-400 text-sm">1–3 минут болно. Энэ хуудас бэлэн болмогц автоматаар харуулна.</p>
          </div>
        )}
        {state === 'failed' && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-10 h-10 text-amber-400 mb-3" />
            <p className="text-xl font-semibold mb-2">Видео бүтээгдэж чадсангүй</p>
            <p className="text-stone-400 text-sm mb-5">
              {res?.canRetry
                ? 'Уучлаарай, AI видеог бүтээж чадсангүй. Нэмэлт төлбөргүйгээр дахин оролдоно уу.'
                : 'Уучлаарай, олон удаа оролдсон ч бүтсэнгүй. Zuragchin.mn-тэй холбогдож төлбөрөө буцаалгана уу.'}
            </p>
            {res?.canRetry && (
              <button onClick={retry} disabled={retrying}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 rounded-xl py-4 font-bold">
                {retrying ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />} Видеог дахин бүтээх (үнэгүй)
              </button>
            )}
          </div>
        )}
        {state === 'error' && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-stone-300">{error}</p>
          </div>
        )}
        {state === 'ready' && media && (
          <div className="space-y-4">
            {res?.videoFailed && (
              <p className="bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm rounded-xl p-3">
                Уучлаарай, 360° видео бүтээж чадсангүй. Оронд нь AI зургаа үнэгүй аваарай.
              </p>
            )}
            {isVideo
              ? <video src={media.url} autoPlay loop muted playsInline controls className="w-full rounded-2xl border border-white/10" />
              : <img src={media.url} alt="AI зураг" className="w-full rounded-2xl border border-white/10" />}
            <button
              onClick={save}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 rounded-xl py-4 font-bold text-lg"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              {isVideo ? 'Видеог утсандаа хадгалах' : 'Утсандаа хадгалах'}
            </button>
            {saved && (
              <p className="text-stone-400 text-xs text-center">
                {isVideo
                  ? (saved === 'shared' ? 'Нээгдсэн цонхноос "Save Video"-г сонгоно уу.' : 'Видео татагдлаа. Галерей → "Download" хавтсанд харагдана.')
                  : saveHint(saved)}
              </p>
            )}

            {isVideo && (
              buyOpen
                ? <BuyPhoto resultToken={resultToken} price={res?.photoPrice ?? 0} />
                : (
                  <button onClick={() => setBuyOpen(true)}
                    className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl py-3.5 font-semibold">
                    <ImageIcon className="w-5 h-5" /> Энэ зургийг бас авах · ₮{(res?.photoPrice ?? 0).toLocaleString()}
                  </button>
                )
            )}

            <p className="text-stone-600 text-xs text-center">
              Энэ линк {new Date(res?.expiresAt ?? Date.now()).toLocaleDateString('mn-MN')} хүртэл хүчинтэй.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/** Видеоны зургийг худалдаж авах: QPay → төлөгдмөгц зургийн хуудас руу */
function BuyPhoto({ resultToken, price }: { resultToken: string; price: number }) {
  const [inv, setInv] = useState<StartResult | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await boothApi.startPhotoFromVideo(resultToken);
        setInv(r);
        const finish = async () => {
          const c = await boothApi.claim(r.jobId, r.key);
          window.location.href = `/booth/r/${c.resultToken}`;
        };
        if (r.status === 'paid') { await finish(); return; }
        timer.current = setInterval(async () => {
          try {
            const st = await boothApi.status(r.jobId, r.key);
            if (st.status === 'paid' || st.status === 'done') {
              if (timer.current) clearInterval(timer.current);
              await finish();
            }
          } catch { /* дахин */ }
        }, 3000);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Алдаа гарлаа');
      }
    })();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [resultToken]);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (
    <div className="border border-white/10 rounded-2xl p-4 text-center">
      <p className="font-semibold">AI зураг · ₮{price.toLocaleString()}</p>
      {error ? <p className="text-red-400 text-sm mt-2">{error}</p> : !inv ? (
        <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto mt-3" />
      ) : (
        <>
          <p className="inline-flex items-center gap-1.5 text-amber-400 text-xs mt-2"><RefreshCw className="w-3 h-3 animate-spin" /> Төлбөр хүлээж байна…</p>
          {isMobile && inv.urls && inv.urls.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {inv.urls.map((u, i) => (
                <a key={i} href={u.link} className="flex flex-col items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-2 text-[11px] text-stone-300">
                  {u.logo ? <img src={u.logo} alt="" className="w-8 h-8 rounded-lg" /> : <div className="w-8 h-8 rounded-lg bg-white/10" />}
                  <span className="line-clamp-2 leading-tight">{u.name}</span>
                </a>
              ))}
            </div>
          )}
          {inv.qrImage && (
            <div className="bg-white rounded-xl p-3 inline-block mt-3">
              <img src={`data:image/png;base64,${inv.qrImage}`} alt="QPay QR" className="w-48 h-48" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
