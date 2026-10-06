import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Camera, Loader2, AlertCircle, CheckCircle2, ChevronLeft, Sparkles,
  Users, RotateCcw, Download, RefreshCw,
} from 'lucide-react';
import {
  boothApi, BoothInfo, BoothTemplate, StartResult, MAX_PEOPLE,
  composeFinal, canvasToDataUrl, canvasToBlob, scaleCanvas, makeAlbumPreview,
  saveImageToDevice, rememberJob, recallJob, forgetJob,
} from '../../lib/aiBooth';
import { countFaces, loadFaceDetector } from '../../lib/faceCount';

type Step =
  | 'loading' | 'error' | 'closed' | 'templates' | 'pay' | 'camera' | 'review'
  | 'generating' | 'failed' | 'composing' | 'result';

interface Captured { dataUrl: string; people: number | null }

const PAY_POLL_MS = 3000;
const PAY_TIMEOUT_MS = 5 * 60 * 1000;
const KIOSK_RESET_MS = 120 * 1000;
const COUNTDOWN = 3;
const MAX_RETAKES = 1;

const SESSION_START = 'aibooth.start';

export default function BoothPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const kiosk = params.get('kiosk') === '1';

  const [step, setStep] = useState<Step>('loading');
  const [info, setInfo] = useState<BoothInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [template, setTemplate] = useState<BoothTemplate | null>(null);
  const [start, setStart] = useState<StartResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [retakesLeft, setRetakesLeft] = useState(MAX_RETAKES);
  const [addToAlbum, setAddToAlbum] = useState(true);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [final, setFinal] = useState<{ url: string; blob: Blob; resultToken: string } | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  };
  useEffect(() => () => stopPolling(), []);

  // ── Шинэ зочинд зориулж эхнээс нь ───────────────────────────────────────
  const reset = useCallback(() => {
    stopPolling();
    forgetJob();
    try { sessionStorage.removeItem(SESSION_START); } catch { /* ignore */ }
    setTemplate(null);
    setStart(null);
    setCaptured(null);
    setRetakesLeft(MAX_RETAKES);
    setAttemptsLeft(null);
    setFinal(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    setErrorMsg('');
    setStep('templates');
  }, []);

  // ── Ачаалах + хагас дууссан захиалгыг сэргээх ───────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await boothApi.info(token);
        if (cancelled) return;
        setInfo(data);
        setAddToAlbum(data.booth.add_to_album);
        if (data.closed) { setStep('closed'); return; }

        const saved = recallJob(token);
        if (saved) {
          const tpl = data.templates.find(t => t.id === saved.templateId) ?? null;
          const st = await boothApi.status(saved.jobId, saved.key).catch(() => null);
          if (st && tpl) {
            setTemplate(tpl);
            let savedStart: StartResult | null = null;
            try { savedStart = JSON.parse(sessionStorage.getItem(SESSION_START) ?? 'null'); } catch { /* ignore */ }
            setStart(savedStart ?? { jobId: saved.jobId, key: saved.key, status: st.status, amount: st.amount ?? 0 });
            if (st.status === 'pending_payment' && savedStart) { setStep('pay'); return; }
            if (st.status === 'paid') { setStep('camera'); return; }
            if (st.status === 'failed') { setAttemptsLeft(st.attemptsLeft ?? 0); setErrorMsg(st.error ?? ''); setStep('camera'); return; }
            if (st.status === 'generated' && st.rawUrl) {
              await finishComposition(data, { jobId: saved.jobId, key: saved.key }, st.rawUrl);
              return;
            }
            if (st.status === 'done' && st.resultToken) {
              const r = await boothApi.result(st.resultToken);
              const blob = await (await fetch(r.imageUrl)).blob();
              setFinal({ url: URL.createObjectURL(blob), blob, resultToken: st.resultToken });
              setStep('result');
              return;
            }
          }
          forgetJob();
        }
        setStep('templates');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : 'Алдаа гарлаа');
        setStep('error');
      }
    })();
    // Камерыг урьдчилан бэлдэх
    loadFaceDetector();
    return () => { cancelled = true; };
  }, [token]);

  // ── Kiosk: хэсэг хугацааны дараа автоматаар эхлэл рүү ────────────────────
  useEffect(() => {
    if (!kiosk || step !== 'result') return;
    const t = setTimeout(reset, KIOSK_RESET_MS);
    return () => clearTimeout(t);
  }, [kiosk, step, reset]);

  // ── 1. Темплет сонгох → нэхэмжлэх ────────────────────────────────────────
  async function chooseTemplate(tpl: BoothTemplate) {
    setTemplate(tpl);
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await boothApi.start(token, tpl.id, kiosk);
      setStart(res);
      rememberJob({ boothToken: token, jobId: res.jobId, key: res.key, templateId: tpl.id });
      try { sessionStorage.setItem(SESSION_START, JSON.stringify(res)); } catch { /* ignore */ }
      if (res.status === 'paid') setStep('camera');
      else setStep('pay');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  // ── 2. Төлбөр хүлээх ─────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'pay' || !start) return;
    const startedAt = Date.now();
    stopPolling();
    pollTimer.current = setInterval(async () => {
      if (Date.now() - startedAt > PAY_TIMEOUT_MS) {
        stopPolling();
        reset();
        setErrorMsg('Төлбөрийн хугацаа дууслаа. Дахин сонгоно уу.');
        return;
      }
      try {
        const st = await boothApi.status(start.jobId, start.key);
        if (st.status !== 'pending_payment') {
          stopPolling();
          setStep('camera');
        }
      } catch { /* дараагийн удаа дахин шалгана */ }
    }, PAY_POLL_MS);
    return () => stopPolling();
  }, [step, start, reset]);

  // ── 4. AI-аар үүсгэх ─────────────────────────────────────────────────────
  async function generate(shot: Captured) {
    if (!start || !info) return;
    setStep('generating');
    setErrorMsg('');
    try {
      const res = await boothApi.generate({
        jobId: start.jobId,
        key: start.key,
        image: shot.dataUrl,
        peopleCount: shot.people,
        addToAlbum: info.booth.add_to_album && addToAlbum,
      });
      if (res.status === 'generated' && res.rawUrl) {
        await finishComposition(info, start, res.rawUrl);
      } else {
        setAttemptsLeft(res.attemptsLeft ?? 0);
        setErrorMsg(res.error || 'Зураг үүсгэж чадсангүй');
        setStep('failed');
      }
    } catch (err) {
      // Сүлжээ тасарсан байж болно — серверт ажил үргэлжилж магадгүй тул төлөвийг шалгана
      const st = await boothApi.status(start.jobId, start.key).catch(() => null);
      if (st?.status === 'generated' && st.rawUrl) {
        await finishComposition(info, start, st.rawUrl);
        return;
      }
      setAttemptsLeft(st?.attemptsLeft ?? null);
      setErrorMsg(err instanceof Error ? err.message : 'Алдаа гарлаа');
      setStep('failed');
    }
  }

  // ── 5. Лого давхарлаж хадгалах ───────────────────────────────────────────
  async function finishComposition(
    boothInfo: BoothInfo,
    job: { jobId: string; key: string },
    rawUrl: string,
  ) {
    setStep('composing');
    try {
      const canvas = await composeFinal(rawUrl, boothInfo.booth);
      const finalDataUrl = canvasToDataUrl(canvas, 0.92);
      const preview = boothInfo.booth.add_to_album
        ? await makeAlbumPreview(canvas, {
          type: boothInfo.album.watermark_type,
          value: boothInfo.album.watermark_value,
          position: boothInfo.album.watermark_position,
        }).catch(() => undefined)
        : undefined;
      const done = await boothApi.finalize({ jobId: job.jobId, key: job.key, final: finalDataUrl, preview });
      const blob = await canvasToBlob(canvas, 0.92);
      setFinal({ url: URL.createObjectURL(blob), blob, resultToken: done.resultToken });
      setStep('result');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Зургийг хадгалж чадсангүй');
      setAttemptsLeft(null);
      setStep('failed');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const title = info?.album.name ?? '';
  const big = kiosk ? 'text-2xl' : 'text-xl';

  return (
    <div className="min-h-screen bg-stone-950 text-white flex flex-col">
      <header className="px-4 sm:px-6 py-4 flex items-center gap-3 border-b border-white/10">
        {step !== 'templates' && step !== 'loading' && step !== 'result' && step !== 'closed' && step !== 'error' &&
          step !== 'generating' && step !== 'composing' && (
          <button onClick={reset} className="text-stone-400 hover:text-white" aria-label="Эхлэл рүү">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-stone-950" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{title || 'AI бүүт'}</p>
          <p className="text-xs text-stone-500">zuragchin.mn · AI бүүт</p>
        </div>
      </header>

      <main className={`flex-1 w-full mx-auto px-4 sm:px-6 py-6 ${kiosk ? 'max-w-5xl' : 'max-w-xl'}`}>
        {step === 'loading' && <Center><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></Center>}

        {step === 'error' && (
          <Center>
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-stone-300 text-center">{errorMsg || 'Бүүт олдсонгүй'}</p>
          </Center>
        )}

        {step === 'closed' && (
          <Center>
            <Camera className="w-10 h-10 text-stone-500 mb-3" />
            <p className={`${big} font-semibold mb-1`}>Бүүт хаалттай байна</p>
            <p className="text-stone-400 text-center">Энэ арга хэмжээний AI бүүт одоогоор ажиллахгүй байна.</p>
          </Center>
        )}

        {step === 'templates' && info && (
          <>
            <div className="mb-5">
              <h1 className={`${big} font-bold mb-1`}>Загвараа сонгоно уу</h1>
              <p className="text-stone-400 text-sm">
                Нэг зураг — <span className="text-amber-400 font-semibold">₮{info.booth.price_mnt.toLocaleString()}</span>
                {' '}· 1–{MAX_PEOPLE} хүн хамт авахуулж болно
              </p>
            </div>
            {errorMsg && <ErrorBox msg={errorMsg} />}
            {info.templates.length === 0 && (
              <p className="text-stone-400">Энэ бүүтэд темплет тохируулаагүй байна.</p>
            )}
            <div className={`grid gap-3 ${kiosk ? 'grid-cols-3 lg:grid-cols-4' : 'grid-cols-2'}`}>
              {info.templates.map(t => (
                <button
                  key={t.id}
                  disabled={busy}
                  onClick={() => chooseTemplate(t)}
                  className="group text-left bg-white/5 border border-white/10 hover:border-amber-500/50 rounded-2xl overflow-hidden transition-all disabled:opacity-50"
                >
                  <TemplateThumb t={t} />
                  <div className="p-3">
                    <p className="font-semibold text-sm leading-tight">{t.name}</p>
                    {t.description && <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{t.description}</p>}
                  </div>
                  {busy && template?.id === t.id && (
                    <div className="px-3 pb-3 -mt-1"><Loader2 className="w-4 h-4 animate-spin text-amber-400" /></div>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-600 mt-6 text-center">
              Таны зургийг Google-ийн AI боловсруулна. Эх зураг 30 хоногийн дараа автоматаар устгагдана.
            </p>
          </>
        )}

        {step === 'pay' && start && template && (
          <PayStep start={start} template={template} kiosk={kiosk} />
        )}

        {step === 'camera' && info && (
          <CameraStep
            kiosk={kiosk}
            showAlbumConsent={info.booth.add_to_album}
            addToAlbum={addToAlbum}
            setAddToAlbum={setAddToAlbum}
            notice={errorMsg}
            onCaptured={shot => { setCaptured(shot); setErrorMsg(''); setStep('review'); }}
          />
        )}

        {step === 'review' && captured && (
          <div className="space-y-4">
            <h2 className={`${big} font-bold`}>Зураг таалагдсан уу?</h2>
            <img src={captured.dataUrl} alt="Таны зураг" className="w-full rounded-2xl border border-white/10" />
            {captured.people !== null && (
              <p className="text-stone-400 text-sm flex items-center gap-2">
                <Users className="w-4 h-4" /> {captured.people} хүн илэрлээ
              </p>
            )}
            <div className="flex gap-3">
              {retakesLeft > 0 && (
                <button
                  onClick={() => { setRetakesLeft(r => r - 1); setCaptured(null); setStep('camera'); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-4 font-medium"
                >
                  <RotateCcw className="w-5 h-5" /> Дахин дарах
                </button>
              )}
              <button
                onClick={() => generate(captured)}
                className="flex-[2] flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl py-4 font-bold"
              >
                <Sparkles className="w-5 h-5" /> AI зураг үүсгэх
              </button>
            </div>
          </div>
        )}

        {(step === 'generating' || step === 'composing') && (
          <Center>
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
              <Sparkles className="w-8 h-8 text-amber-400 absolute inset-0 m-auto" />
            </div>
            <p className={`${big} font-semibold mb-1`}>
              {step === 'generating' ? 'AI таны зургийг бүтээж байна…' : 'Лого, нэрийг байрлуулж байна…'}
            </p>
            <p className="text-stone-400 text-sm text-center">
              {step === 'generating' ? '10–40 секунд болно. Хуудсаа хаалгүй хүлээнэ үү.' : 'Бараг бэлэн боллоо'}
            </p>
            {template && <p className="text-stone-600 text-xs mt-4">Загвар: {template.name}</p>}
          </Center>
        )}

        {step === 'failed' && (
          <Center>
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className={`${big} font-semibold mb-2 text-center`}>Зураг гарсангүй</p>
            <p className="text-stone-400 text-center mb-6">{errorMsg}</p>
            {(attemptsLeft === null || attemptsLeft > 0) ? (
              <div className="w-full space-y-3">
                {captured && (
                  <button
                    onClick={() => generate(captured)}
                    className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl py-4 font-bold"
                  >
                    <RefreshCw className="w-5 h-5" /> Дахин оролдох (үнэгүй)
                  </button>
                )}
                <button
                  onClick={() => { setCaptured(null); setStep('camera'); }}
                  className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-4 font-medium"
                >
                  <Camera className="w-5 h-5" /> Шинээр зураг дарах
                </button>
              </div>
            ) : (
              <p className="text-amber-400 text-center">Оролдлогын тоо дууслаа. Дэгцний ажилтанд хандана уу.</p>
            )}
          </Center>
        )}

        {step === 'result' && final && (
          <ResultStep final={final} kiosk={kiosk} onDone={reset} />
        )}
      </main>
    </div>
  );
}

// ── Төлбөрийн алхам ──────────────────────────────────────────────────────────
function PayStep({ start, template, kiosk }: { start: StartResult; template: BoothTemplate; kiosk: boolean }) {
  const isMobile = !kiosk && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-4 py-1.5 text-sm font-medium mb-4">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Төлбөр хүлээж байна…
      </div>
      <h2 className={`${kiosk ? 'text-3xl' : 'text-xl'} font-bold mb-1`}>₮{start.amount.toLocaleString()}</h2>
      <p className="text-stone-400 text-sm mb-5">{template.name} · 1 AI зураг</p>

      {/* Утсан дээр банкны апп руу шууд */}
      {isMobile && start.urls && start.urls.length > 0 && (
        <div className="mb-6">
          <p className="text-stone-300 text-sm mb-3 font-medium">Банкны аппаа сонгож төлнө үү</p>
          <div className="grid grid-cols-3 gap-2">
            {start.urls.map((u, i) => (
              <a key={i} href={u.link}
                className="flex flex-col items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-2.5 text-xs text-stone-300">
                {u.logo ? <img src={u.logo} alt="" className="w-9 h-9 rounded-lg" /> : <div className="w-9 h-9 rounded-lg bg-white/10" />}
                <span className="leading-tight line-clamp-2">{u.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {start.qrImage && (
        <>
          {isMobile && <p className="text-stone-500 text-xs mb-3">Эсвэл өөр утсаар QR уншуулна уу</p>}
          <div className="bg-white rounded-2xl p-4 inline-block">
            <img
              src={`data:image/png;base64,${start.qrImage}`}
              alt="QPay QR"
              className={kiosk ? 'w-80 h-80' : 'w-56 h-56'}
            />
          </div>
          <p className="text-stone-400 text-sm mt-3">Банкны аппаараа QR уншуулж төлнө үү</p>
        </>
      )}
      <p className="text-stone-600 text-xs mt-4">Төлбөр орсны дараа камер автоматаар нээгдэнэ</p>
    </div>
  );
}

// ── Камерын алхам ────────────────────────────────────────────────────────────
function CameraStep({
  kiosk, showAlbumConsent, addToAlbum, setAddToAlbum, notice, onCaptured,
}: {
  kiosk: boolean;
  showAlbumConsent: boolean;
  addToAlbum: boolean;
  setAddToAlbum: (v: boolean) => void;
  notice: string;
  onCaptured: (c: Captured) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [camError, setCamError] = useState('');
  const [faces, setFaces] = useState<number | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [warn, setWarn] = useState('');

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: kiosk ? 3840 : 1920 },
            height: { ideal: kiosk ? 2160 : 1080 },
          },
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
          setReady(true);
        }
      } catch (err) {
        const name = (err as Error).name;
        setCamError(
          name === 'NotAllowedError'
            ? 'Камер ашиглах зөвшөөрөл өгнө үү (хөтчийн тохиргооноос).'
            : 'Камер нээж чадсангүй. Өөр хөтчөөр (Chrome, Safari) оролдоно уу.',
        );
      }
    })();
    return () => {
      stopped = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [kiosk]);

  // Камерын өмнөх хүний тоог тогтмол харуулах
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(async () => {
      if (videoRef.current && count === null) setFaces(await countFaces(videoRef.current));
    }, 800);
    return () => clearInterval(t);
  }, [ready, count]);

  const tooMany = faces !== null && faces > MAX_PEOPLE;

  function snap() {
    setWarn('');
    setCount(COUNTDOWN);
    let n = COUNTDOWN;
    const timer = setInterval(async () => {
      n -= 1;
      if (n > 0) { setCount(n); return; }
      clearInterval(timer);
      setCount(0);
      const video = videoRef.current;
      if (!video) return;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      const people = await countFaces(canvas);
      setCount(null);
      if (people !== null && people > MAX_PEOPLE) {
        setWarn(`${people} хүн илэрлээ. Дээд тал нь ${MAX_PEOPLE} хүн байна — цөөрөөд дахин дарна уу.`);
        return;
      }
      if (people === 0) {
        setWarn('Нүүр илэрсэнгүй. Камер руу харж, гэрэлтэй газар зогсоод дахин дарна уу.');
        return;
      }
      // AI-д 1600px хангалттай, илгээх хэмжээг багасгана
      const scaled = scaleCanvas(canvas, 1600);
      onCaptured({ dataUrl: canvasToDataUrl(scaled, 0.9), people });
    }, 1000);
  }

  return (
    <div className="space-y-4">
      {notice && <ErrorBox msg={notice} />}
      <div className="relative bg-black rounded-2xl overflow-hidden aspect-[3/4] sm:aspect-video">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        />
        {/* Цээжнээс дээш багтаах заавар */}
        <div className="absolute inset-[8%] border-2 border-dashed border-white/30 rounded-[40%_40%_12%_12%] pointer-events-none" />
        {faces !== null && count === null && (
          <div className={`absolute top-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
            tooMany ? 'bg-red-500 text-white' : 'bg-black/60 text-white'
          }`}>
            <Users className="w-4 h-4" /> {faces} / {MAX_PEOPLE}
          </div>
        )}
        {count !== null && count > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="text-white font-bold drop-shadow-lg" style={{ fontSize: kiosk ? 220 : 140 }}>{count}</span>
          </div>
        )}
        {count === 0 && <div className="absolute inset-0 bg-white animate-pulse" />}
        {!ready && !camError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          </div>
        )}
        {camError && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-stone-300">{camError}</div>
        )}
      </div>

      <p className="text-stone-400 text-sm text-center">
        1–{MAX_PEOPLE} хүн цээжнээс дээш хүрээнд багтаж, камер руу харна уу.
      </p>
      {(warn || tooMany) && <ErrorBox msg={warn || `Дээд тал нь ${MAX_PEOPLE} хүн байна.`} />}

      {showAlbumConsent && (
        <label className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-stone-300 cursor-pointer">
          <input
            type="checkbox"
            checked={addToAlbum}
            onChange={e => setAddToAlbum(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-amber-500"
          />
          <span>Энэ зургийг арга хэмжээний хаалттай цомогт нэмэхийг зөвшөөрч байна (зөвхөн урилгатай хүмүүс харна).</span>
        </label>
      )}

      <button
        onClick={snap}
        disabled={!ready || count !== null || tooMany}
        className={`w-full flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 rounded-2xl font-bold ${kiosk ? 'py-7 text-2xl' : 'py-5 text-lg'}`}
      >
        <Camera className={kiosk ? 'w-8 h-8' : 'w-6 h-6'} /> Зураг дарах
      </button>
    </div>
  );
}

// ── Үр дүн ───────────────────────────────────────────────────────────────────
function ResultStep({
  final, kiosk, onDone,
}: {
  final: { url: string; blob: Blob; resultToken: string };
  kiosk: boolean;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const resultUrl = `${window.location.origin}/booth/r/${final.resultToken}`;

  if (kiosk) {
    return (
      <div className="grid md:grid-cols-2 gap-6 items-center">
        <img src={final.url} alt="AI зураг" className="w-full rounded-2xl border border-white/10" />
        <div className="text-center">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <h2 className="text-3xl font-bold mb-2">Зураг бэлэн боллоо!</h2>
          <p className="text-stone-300 text-lg mb-5">Утасныхаа камераар уншуулж зургаа аваарай</p>
          <div className="bg-white rounded-2xl p-5 inline-block">
            <QRCodeSVG value={resultUrl} size={260} level="M" />
          </div>
          <p className="text-stone-500 text-sm mt-3">Линк 30 хоног хүчинтэй</p>
          <button onClick={onDone}
            className="mt-6 w-full bg-white/10 hover:bg-white/15 border border-white/10 rounded-2xl py-5 text-xl font-semibold">
            Дуусгах
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-400">
        <CheckCircle2 className="w-5 h-5" /> <span className="font-semibold">Таны AI зураг бэлэн боллоо!</span>
      </div>
      <img src={final.url} alt="AI зураг" className="w-full rounded-2xl border border-white/10" />
      <button
        onClick={async () => { await saveImageToDevice(final.blob, `zuragchin-ai-${final.resultToken.slice(0, 6)}.jpg`); setSaved(true); }}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl py-4 font-bold text-lg"
      >
        <Download className="w-5 h-5" /> Утсандаа хадгалах
      </button>
      {saved && (
        <p className="text-stone-400 text-xs text-center">
          iPhone дээр нээгдсэн цонхноос "Save Image / Зураг хадгалах"-ыг сонгоно уу.
        </p>
      )}
      <p className="text-stone-500 text-xs text-center break-all">
        Дараа дахин татах линк: <a href={resultUrl} className="text-amber-400 underline">{resultUrl}</a>
      </p>
      <button onClick={onDone}
        className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-3 text-sm">
        <Camera className="w-4 h-4" /> Дахин зураг авахуулах
      </button>
    </div>
  );
}

// ── Жижиг туслах компонентууд ───────────────────────────────────────────────
function TemplateThumb({ t }: { t: BoothTemplate }) {
  if (t.preview_url) {
    return <img src={t.preview_url} alt={t.name} className="w-full aspect-[3/4] object-cover group-hover:scale-[1.02] transition-transform" />;
  }
  const palette: Record<string, string> = {
    winter: 'from-sky-900 via-indigo-900 to-stone-900',
    party: 'from-amber-700 via-rose-900 to-stone-900',
    mongolian: 'from-red-800 via-amber-800 to-stone-900',
    fun: 'from-fuchsia-800 via-violet-900 to-stone-900',
  };
  return (
    <div className={`w-full aspect-[3/4] bg-gradient-to-br ${palette[t.category] ?? 'from-stone-700 to-stone-900'} flex items-center justify-center`}>
      <Sparkles className="w-8 h-8 text-white/60" />
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[60vh] flex flex-col items-center justify-center">{children}</div>;
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-3">
      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-red-300 text-sm">{msg}</p>
    </div>
  );
}

