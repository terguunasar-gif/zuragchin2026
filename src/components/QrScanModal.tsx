import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Loader2, ScanLine, X } from 'lucide-react';

/**
 * Утасны камераар QR уншуулах цонх — тасралтгүй уншина (нэг зургийг уншуулсны дараа
 * дараагийн зургийн QR-ийг шууд уншуулж болно). Ижил кодыг 3 секундын дотор давтан тоолохгүй.
 * onCode нь хэрэглэгчид харуулах мессеж буцаана.
 */
export default function QrScanModal({ onCode, onClose, title, hint, footer }: {
  onCode: (text: string) => { ok: boolean; message: string };
  onClose: () => void;
  title: string;
  hint: string;
  footer?: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState<{ ok: boolean; message: string; at: number } | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD = (window as any).BarcodeDetector;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let detector: any = null;
    try { if (BD) detector = new BD({ formats: ['qr_code'] }); } catch { detector = null; }
    let busy = false;

    const handle = (text: string) => {
      const now = Date.now();
      if (text === lastRef.current.text && now - lastRef.current.at < 3000) return;
      lastRef.current = { text, at: now };
      const r = onCodeRef.current(text);
      setFlash({ ...r, at: now });
      try { navigator.vibrate?.(r.ok ? 80 : [40, 60, 40]); } catch { /* */ }
    };

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
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setStatus('ready');
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setStatus('error');
        setErr(e instanceof Error && /Permission|NotAllowed/i.test(e.name + e.message)
          ? 'Камерын зөвшөөрөл өгөөгүй байна. Хөтчийн тохиргооноос камерыг зөвшөөрөөд дахин оролдоно уу.'
          : 'Камер нээж чадсангүй. Утасныхаа камерын аппаар QR-ийг уншуулж болно.');
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-stone-950 border-b border-white/10">
        <p className="text-white font-semibold flex items-center gap-2"><ScanLine className="w-5 h-5 text-amber-400" />{title}</p>
        <button onClick={onClose} className="p-2 -mr-2 text-stone-300 hover:text-white"><X className="w-6 h-6" /></button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-stone-300 text-sm">{err}</div>
        )}
        {status === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 max-w-[70vw] max-h-[70vw] rounded-3xl border-4 border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
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
        {footer}
      </div>
    </div>
  );
}
