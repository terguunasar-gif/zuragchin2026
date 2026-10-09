import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, ScanFace, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { FACE_MATCH_THRESHOLD, fileToImage, selfieDescriptor, warmUpFaceModels } from '../lib/faceSearch';
import { useI18n } from '../lib/i18n';

type Step = 'consent' | 'camera' | 'working' | 'error' | 'possible';

/** Энэ хүртэлх зай — «төстэй» гэж үзэн сонголттойгоор харуулна */
const POSSIBLE_THRESHOLD = 0.68;

/** Зочин selfie авч, цомгоос өөрийн орсон зургуудыг олно. Selfie хадгалагдахгүй. */
export default function FaceSearchModal({ albumId, onClose, onResult }: {
  albumId: string;
  onClose: () => void;
  onResult: (photoIds: string[]) => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('consent');
  const [agree, setAgree] = useState(false);
  const [message, setMessage] = useState('');
  const [camError, setCamError] = useState(false);
  const [possibleIds, setPossibleIds] = useState<string[]>([]);
  const [hint, setHint] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    streamRef.current = null;
  }
  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setStep('camera');
    setCamError(false);
    // Загваруудыг ачаалж, анхны тооцооллыг камер асаах хооронд урьдчилан хийнэ
    warmUpFaceModels();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setCamError(true);
    }
  }

  async function search(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
    setStep('working');
    stopCamera();
    // «Хайж байна…» дэлгэц гарч амжих хугацаа
    await new Promise(r => setTimeout(r, 60));
    try {
      const descriptor = await selfieDescriptor(el);
      stopCamera();
      if (!descriptor) {
        setMessage(t('Царай олдсонгүй. Гэрэлтэй газар, нүүрээ шууд харуулж дахин оролдоно уу.'));
        setStep('error');
        return;
      }
      setHint('');
      // Шинэ функц (цомгийн царайны тоо, хамгийн ойр зай) — SQL ажиллаагүй бол хуучнаар
      const near = await supabase.rpc('face_search_near', { p_album_id: albumId, p_descriptor: descriptor });
      if (!near.error && near.data) {
        const r = near.data as { faces: number; nearest: number | null; matches: { photo_id: string; distance: number }[] };
        if (!r.faces) {
          setMessage(t('Энэ цомгийн зургуудыг царайгаар хараахан уншуулаагүй байна. Хавтсуудаас гараар хайна уу.'));
          setStep('error');
          return;
        }
        const strong = r.matches.filter(m => m.distance < FACE_MATCH_THRESHOLD).map(m => m.photo_id);
        const possible = r.matches.filter(m => m.distance < POSSIBLE_THRESHOLD).map(m => m.photo_id);
        if (strong.length > 0) { onResult(possible); onClose(); return; }
        if (possible.length > 0) { setPossibleIds(possible); setStep('possible'); return; }
        setHint(r.nearest != null ? `(${t('хамгийн ойр')}: ${Number(r.nearest).toFixed(2)})` : '');
        setMessage(t('Таны царайтай зураг олдсонгүй. Өөр selfie-гээр дахин оролдож эсвэл хавтсуудаас гараар хайна уу.'));
        setStep('error');
        return;
      }
      const { data, error } = await supabase.rpc('face_search', { p_album_id: albumId, p_descriptor: descriptor, p_threshold: FACE_MATCH_THRESHOLD });
      if (error) throw new Error(error.message);
      const ids = ((data ?? []) as { photo_id: string }[]).map(r => r.photo_id);
      if (ids.length === 0) {
        setMessage(t('Таны царайтай зураг олдсонгүй. Өөр selfie-гээр дахин оролдож эсвэл хавтсуудаас гараар хайна уу.'));
        setStep('error');
        return;
      }
      onResult(ids);
      onClose();
    } catch (e) {
      stopCamera();
      setMessage(t('Алдаа гарлаа:') + ' ' + (e instanceof Error ? e.message : ''));
      setStep('error');
    }
  }

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    search(c);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    stopCamera();
    try { search(await fileToImage(f)); } catch { setMessage(t('Зураг уншиж чадсангүй')); setStep('error'); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-950/85 backdrop-blur-sm" onClick={() => { stopCamera(); onClose(); }} />
      <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <button onClick={() => { stopCamera(); onClose(); }} className="absolute top-4 right-4 text-stone-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <div className="w-11 h-11 bg-amber-500/15 rounded-xl flex items-center justify-center mb-4">
          <ScanFace className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="text-white text-xl font-bold mb-1">{t('Өөрийн зургийг хайх')}</h2>

        <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} />

        {step === 'consent' && (
          <>
            <p className="text-stone-400 text-sm mb-4">
              {t('Selfie авахад таны царайтай зургуудыг цомгоос олж харуулна.')}
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4 text-xs text-stone-300 space-y-1.5">
              <p className="flex items-start gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />{t('Selfie таны утсан дээр боловсруулагдана, серверт хадгалагдахгүй.')}</p>
              <p className="flex items-start gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />{t('Зөвхөн царайны тоон хээг харьцуулахад нэг удаа ашиглана.')}</p>
              <p className="flex items-start gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />{t('Үр дүн 100% биш — олдсон зургуудаа шалгаарай.')}</p>
            </div>
            <label className="flex items-start gap-2 text-sm text-stone-300 mb-5 cursor-pointer">
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500" />
              {t('Царайны мэдээллээ энэ хайлтад ашиглахыг зөвшөөрч байна.')}
            </label>
            <button onClick={startCamera} disabled={!agree}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
              <Camera className="w-5 h-5" /> {t('Камер нээх')}
            </button>
          </>
        )}

        {step === 'camera' && (
          <>
            <p className="text-stone-400 text-sm mb-3">{t('Нүүрээ хүрээн дотор шууд харуулаад зураг авна уу.')}</p>
            {camError ? (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-stone-300 mb-3">
                {t('Камер нээгдсэнгүй. Доорх товчоор selfie сонгоно уу.')}
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[3/4] mb-3">
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />
                <div className="absolute inset-[18%] border-2 border-white/60 rounded-[45%] pointer-events-none" />
              </div>
            )}
            <div className="flex gap-2">
              {!camError && (
                <button onClick={capture}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                  <Camera className="w-5 h-5" /> {t('Зураг авах')}
                </button>
              )}
              <button onClick={() => fileRef.current?.click()}
                className={`${camError ? 'flex-1' : ''} bg-white/10 hover:bg-white/15 text-white px-4 py-3 rounded-xl flex items-center justify-center gap-2 text-sm`}>
                <ImagePlus className="w-5 h-5" /> {t('Selfie сонгох')}
              </button>
            </div>
          </>
        )}

        {step === 'working' && (
          <div className="py-10 flex flex-col items-center text-center">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin mb-3" />
            <p className="text-white font-medium">{t('Хайж байна…')}</p>
            <p className="text-stone-500 text-xs mt-1">{t('Анх удаа ачаалахад хэдэн секунд болно.')}</p>
          </div>
        )}

        {step === 'possible' && (
          <>
            <p className="text-stone-300 text-sm my-4">
              {t('Яг таарсан зураг олдсонгүй, гэхдээ танд төстэй {n} зураг байна. Харах уу?', { n: possibleIds.length })}
            </p>
            <div className="flex gap-2">
              <button onClick={() => { onResult(possibleIds); onClose(); }}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl">
                {t('Төстэй зургуудыг харах')}
              </button>
              <button onClick={startCamera}
                className="bg-white/10 hover:bg-white/15 text-white px-4 py-3 rounded-xl text-sm">
                {t('Дахин оролдох')}
              </button>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            <p className="text-stone-300 text-sm my-4">{message} {hint && <span className="text-stone-600 text-xs">{hint}</span>}</p>
            <button onClick={startCamera}
              className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl">
              {t('Дахин оролдох')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
