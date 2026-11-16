import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { ImageUp, Loader2, RefreshCw, ScanLine, ShieldAlert, X } from 'lucide-react';
import { inAppBrowserName, isAndroid, isIOS } from '../lib/browserEnv';

/**
 * QR уншуулах цонх:
 *  • утасны камераар тасралтгүй уншина (ижил кодыг 3 секундын дотор давтан тоолохгүй)
 *  • «Зургаас унших» — галерейд хадгалсан QR зургийг сонгож уншуулна
 *  • камерын зөвшөөрөл хаалттай бол утас/хөтөч бүрт хэрхэн нээхийг алхам алхмаар зааж өгнө
 * onCode нь хэрэглэгчид харуулах мессеж буцаана.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDetector(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BD = (window as any).BarcodeDetector;
  try { return BD ? new BD({ formats: ['qr_code'] }) : null; } catch { return null; }
}

/** Зургийн файлаас QR код уншина (олон хэмжээгээр оролдоно) */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let source: ImageBitmap | HTMLImageElement | null = bitmap;
  if (!source) {
    // Хуучин Safari: createImageBitmap дэмжихгүй бол <img>-ээр
    source = await new Promise<HTMLImageElement | null>(res => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = URL.createObjectURL(file);
    });
  }
  if (!source) return null;
  const w0 = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h0 = 'naturalHeight' in source ? source.naturalHeight : source.height;

  const detector = makeDetector();
  if (detector) {
    try {
      const codes = await detector.detect(source);
      if (codes?.[0]?.rawValue) return codes[0].rawValue;
    } catch { /* jsQR-ээр үргэлжлүүлнэ */ }
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  for (const max of [1600, 1000, 600, 2400]) {
    const scale = Math.min(1, max / Math.max(w0, h0));
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    if (code?.data) return code.data;
  }
  return null;
}

type CamState = 'starting' | 'ready' | 'denied' | 'nocamera' | 'unsupported';

export default function QrScanModal({ onCode, onClose, title, hint, footer }: {
  onCode: (text: string) => { ok: boolean; message: string };
  onClose: () => void;
  title: string;
  hint: string;
  footer?: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cam, setCam] = useState<CamState>('starting');
  const [attempt, setAttempt] = useState(0);
  const [reading, setReading] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; message: string; at: number } | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const handle = (text: string, force = false) => {
    const now = Date.now();
    if (!force && text === lastRef.current.text && now - lastRef.current.at < 3000) return;
    lastRef.current = { text, at: now };
    const r = onCodeRef.current(text);
    setFlash({ ...r, at: now });
    try { navigator.vibrate?.(r.ok ? 80 : [40, 60, 40]); } catch { /* */ }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const detector = makeDetector();
    let busy = false;
    setCam('starting');

    const tick = async () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && !busy) {
        busy = true;
        try {
          if (detector) {
            const codes = await detector.detect(v);
            if (codes?.[0]?.rawValue) handle(codes[0].rawValue);
          } else if (ctx) {
            const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code?.data) handle(code.data);
          }
        } catch { /* дараагийн кадр */ }
        busy = false;
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCam('unsupported'); return; }
      // Зөвшөөрөл өмнө нь хаагдсан бол шууд заавар харуулна
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = await (navigator.permissions as any)?.query?.({ name: 'camera' });
        if (p?.state === 'denied') { setCam('denied'); return; }
      } catch { /* Safari зарим хувилбар дэмждэггүй */ }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setCam('ready');
        raf = requestAnimationFrame(tick);
      } catch (e) {
        const name = e instanceof Error ? e.name : '';
        if (/NotAllowed|Permission|Security/i.test(name)) setCam('denied');
        else if (/NotFound|Overconstrained|DevicesNotFound/i.test(name)) setCam('nocamera');
        else setCam('denied');
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3000);
    return () => clearTimeout(t);
  }, [flash]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setReading(true);
    const text = await decodeQrFromFile(f).catch(() => null);
    setReading(false);
    if (text) handle(text, true);
    else setFlash({ ok: false, message: 'Энэ зурагнаас QR код олдсонгүй. QR бүтэн, тод харагдах зураг сонгоно уу.', at: Date.now() });
  }

  const inApp = inAppBrowserName();

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-stone-950 border-b border-white/10">
        <p className="text-white font-semibold flex items-center gap-2"><ScanLine className="w-5 h-5 text-amber-400" />{title}</p>
        <button onClick={onClose} className="p-2 -mr-2 text-stone-300 hover:text-white" aria-label="Хаах"><X className="w-6 h-6" /></button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className={`absolute inset-0 w-full h-full object-cover ${cam === 'ready' ? '' : 'hidden'}`} />
        {cam === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-stone-400 text-sm">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            Камер нээж байна… «Allow / Зөвшөөрөх» дарна уу
          </div>
        )}
        {cam === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 max-w-[70vw] max-h-[70vw] rounded-3xl border-4 border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}
        {(cam === 'denied' || cam === 'nocamera' || cam === 'unsupported') && (
          <div className="absolute inset-0 overflow-y-auto p-5">
            <div className="max-w-md mx-auto bg-stone-900 border border-white/10 rounded-2xl p-5 text-sm text-stone-300 space-y-3">
              <p className="flex items-center gap-2 text-white font-bold text-base">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                {cam === 'nocamera' ? 'Камер олдсонгүй' : cam === 'unsupported' ? 'Энэ хөтөч камер дэмжихгүй' : 'Камерын зөвшөөрөл хаалттай байна'}
              </p>
              {cam === 'denied' && (
                <>
                  <p>QR уншуулахын тулд камерыг зөвшөөрөх хэрэгтэй. Дараах алхмаар нээнэ үү:</p>
                  {inApp ? (
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Та <b>{inApp}</b> аппын доторх хөтчөөр орсон байна.</li>
                      <li>Баруун дээд/доод буланд байгаа <b>⋯</b> цэсийг дарна.</li>
                      <li><b>{isIOS ? '«Open in Safari»' : '«Open in Chrome / Open in browser»'}</b>-ийг сонгоод тэндээс QR товчийг дахин дарна.</li>
                    </ol>
                  ) : isIOS ? (
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Хаягийн мөрөн дэх <b>«aA»</b> (эсвэл <b>⋯</b>) тэмдгийг дарна.</li>
                      <li><b>«Website Settings / Вэбсайтын тохиргоо»</b> → <b>Camera</b> → <b>Allow / Зөвшөөрөх</b>.</li>
                      <li>Хэрэв тэнд харагдахгүй бол: iPhone-ийн <b>Settings (Тохиргоо) → Safari → Camera → Allow</b>.</li>
                      <li>Chrome ашиглаж байвал: <b>Settings → Chrome → Camera</b>-г асаана.</li>
                      <li>Доорх <b>«Дахин оролдох»</b> товчийг дарна.</li>
                    </ol>
                  ) : isAndroid ? (
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Хаягийн мөрний зүүн талд байгаа <b>🔒 / ⚙ тэмдгийг</b> дарна.</li>
                      <li><b>Permissions / Зөвшөөрөл</b> → <b>Camera / Камер</b> → <b>Allow / Зөвшөөрөх</b>.</li>
                      <li>Тэнд байхгүй бол: утасны <b>Settings → Apps → Chrome → Permissions → Camera → Allow</b>.</li>
                      <li>Доорх <b>«Дахин оролдох»</b> товчийг дарна.</li>
                    </ol>
                  ) : (
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Хаягийн мөрний зүүн талд байгаа <b>🔒</b> тэмдгийг дарна.</li>
                      <li><b>Camera</b>-г <b>Allow</b> болгоно.</li>
                      <li>Доорх <b>«Дахин оролдох»</b> товчийг дарна.</li>
                    </ol>
                  )}
                </>
              )}
              {cam === 'nocamera' && <p>Энэ төхөөрөмжид камер олдсонгүй. QR-ийн зургийг доорх «Зургаас унших» товчоор сонгож уншуулна уу.</p>}
              {cam === 'unsupported' && <p>Энэ хөтөч камер ашиглахыг зөвшөөрөхгүй байна. Chrome эсвэл Safari-гаар нээх, эсвэл QR-ийн зургийг доорх «Зургаас унших» товчоор сонгоно уу.</p>}
              <p className="text-stone-400">Эсвэл QR-ийн <b>screenshot / зургийг</b> галерейгаас сонгож уншуулж болно 👇</p>
              {cam !== 'nocamera' && (
                <button onClick={() => setAttempt(a => a + 1)}
                  className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold py-2.5 rounded-xl">
                  <RefreshCw className="w-4 h-4" /> Дахин оролдох
                </button>
              )}
            </div>
          </div>
        )}
        {flash && (
          <div className={`absolute left-4 right-4 top-4 rounded-2xl px-4 py-3 text-center font-bold text-base shadow-xl ${
            flash.ok ? 'bg-emerald-500 text-stone-950' : 'bg-red-500 text-white'}`}>
            {flash.message}
          </div>
        )}
      </div>

      <div className="bg-stone-950 border-t border-white/10 px-4 py-3 space-y-3">
        <p className="text-stone-400 text-sm text-center">{hint}</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
        <button onClick={() => fileRef.current?.click()} disabled={reading}
          className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 disabled:opacity-60 text-white font-semibold py-3 rounded-xl">
          {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageUp className="w-4 h-4 text-amber-400" />}
          {reading ? 'Уншиж байна…' : 'Зургаас унших (галерей)'}
        </button>
        {footer}
      </div>
    </div>
  );
}
