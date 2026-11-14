import { useEffect, useRef, useState } from 'react';
import { Eye, Loader2, Printer, RotateCcw, Save, SlidersHorizontal, X } from 'lucide-react';
import { ADJUST_FIELDS, applyAdjustToCanvas, isNeutral, loadImg, PhotoAdjust } from '../lib/photoAdjust';
import { loadPrintSource, savePrintAdjust } from '../lib/printPhoto';

const PREVIEW_MAX = 1400;

/**
 * Угаалгах захиалгын зургийг хэвлэхээс өмнө гэрэл, сүүдэр, өнгийг тохируулах цонх.
 * Засвар хадгалагдаж, дараагийн «Принт» бүрт эх зурагт хэрэгжинэ (эх файл өөрчлөгдөхгүй).
 */
export default function PrintEditor({ purchaseId, title, onClose, onPrint }: {
  purchaseId: string;
  title?: string;
  onClose: () => void;
  /** «Хадгалаад хэвлэх» — эцэг компонент printPurchase(id, adjust)-ийг дуудна */
  onPrint: (adjust: PhotoAdjust) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<ImageData | null>(null);
  const rafRef = useRef(0);
  const [adjust, setAdjust] = useState<PhotoAdjust>({});
  const [savedAdjust, setSavedAdjust] = useState<PhotoAdjust>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [compare, setCompare] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const src = await loadPrintSource(purchaseId);
        const im = await loadImg(src.signedUrl);
        if (!alive) return;
        const scale = Math.min(1, PREVIEW_MAX / Math.max(im.naturalWidth, im.naturalHeight));
        const c = canvasRef.current!;
        c.width = Math.round(im.naturalWidth * scale);
        c.height = Math.round(im.naturalHeight * scale);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(im, 0, 0, c.width, c.height);
        baseRef.current = ctx.getImageData(0, 0, c.width, c.height);
        setAdjust(src.adjust || {});
        setSavedAdjust(src.adjust || {});
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Зураг ачаалж чадсангүй');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [purchaseId]);

  // Слайдер хөдлөх бүрт урьдчилан харахыг дахин зурна
  useEffect(() => {
    const base = baseRef.current, c = canvasRef.current;
    if (!base || !c) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.putImageData(base, 0, 0);
      if (!compare) applyAdjustToCanvas(ctx, c.width, c.height, adjust);
    });
  }, [adjust, compare, loading]);

  const dirty = JSON.stringify(clean(adjust)) !== JSON.stringify(clean(savedAdjust));

  async function save() {
    setSaving(true); setSavedMsg(''); setError('');
    try {
      await savePrintAdjust(purchaseId, clean(adjust));
      setSavedAdjust(adjust);
      setSavedMsg('Хадгалагдлаа');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
    } finally {
      setSaving(false);
    }
  }

  function saveAndPrint() {
    const a = clean(adjust);
    onPrint(a); // цонхыг шууд нээх ёстой (хөтөч popup хаахгүйн тулд) — хадгалалт зэрэгцээ явна
    if (dirty) savePrintAdjust(purchaseId, a).then(() => setSavedAdjust(a)).catch(() => null);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-stone-950 border border-white/10 rounded-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-white font-semibold flex items-center gap-2"><SlidersHorizontal className="w-4 h-4 text-amber-400" />Хэвлэхийн өмнө засах{title ? <span className="text-stone-500 font-normal text-sm"> · {title}</span> : null}</p>
          <button onClick={onClose} className="p-1.5 text-stone-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-auto grid md:grid-cols-[1fr_300px]">
          <div className="relative bg-stone-900 flex items-center justify-center p-3 min-h-[260px]">
            {loading && <Loader2 className="w-7 h-7 animate-spin text-amber-400 absolute" />}
            <canvas ref={canvasRef} className={`max-w-full max-h-[70vh] object-contain ${loading ? 'opacity-0' : ''}`} />
            {!loading && !error && (
              <button
                onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)}
                className="absolute bottom-4 left-4 flex items-center gap-1.5 bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg select-none">
                <Eye className="w-3.5 h-3.5" />{compare ? 'Эх зураг' : 'Дарж байхад эх зураг'}
              </button>
            )}
          </div>

          <div className="p-4 space-y-4 border-t md:border-t-0 md:border-l border-white/10">
            {ADJUST_FIELDS.map(f => {
              const v = Number(adjust[f.key]) || 0;
              return (
                <div key={f.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-stone-300 text-xs">{f.label}</span>
                    <button type="button" onDoubleClick={() => setAdjust(a => ({ ...a, [f.key]: 0 }))} onClick={() => v && setAdjust(a => ({ ...a, [f.key]: 0 }))}
                      title="0 болгох" className={`text-xs tabular-nums ${v ? 'text-amber-400' : 'text-stone-600'}`}>{v > 0 ? `+${v}` : v}</button>
                  </div>
                  <input type="range" min={-100} max={100} value={v} disabled={loading || !!error}
                    onChange={e => setAdjust(a => ({ ...a, [f.key]: Number(e.target.value) }))}
                    className="w-full accent-amber-500" />
                  <div className="flex justify-between text-[10px] text-stone-600"><span>{f.left}</span><span>{f.right}</span></div>
                </div>
              );
            })}

            <button type="button" onClick={() => setAdjust({})} disabled={isNeutral(adjust)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-stone-400 hover:text-white border border-white/10 rounded-lg py-2 disabled:opacity-40">
              <RotateCcw className="w-3.5 h-3.5" /> Бүгдийг анхны байдалд
            </button>

            <p className="text-stone-500 text-[11px] leading-relaxed">
              Эх файл өөрчлөгдөхгүй. Хадгалсан засвар энэ захиалгыг хэвлэх бүрт хэрэгжинэ. Цомгийн лого хэвлэх үед нэмэгдэнэ.
            </p>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            {savedMsg && !dirty && <p className="text-emerald-400 text-xs">{savedMsg}</p>}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onClick={save} disabled={saving || loading || !!error || !dirty}
                className="flex items-center justify-center gap-1.5 border border-white/15 text-white text-sm rounded-lg py-2.5 disabled:opacity-40">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Хадгалах
              </button>
              <button type="button" onClick={saveAndPrint} disabled={loading || !!error}
                className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm rounded-lg py-2.5 disabled:opacity-40">
                <Printer className="w-4 h-4" /> Хэвлэх
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function clean(a: PhotoAdjust): PhotoAdjust {
  const out: PhotoAdjust = {};
  for (const f of ADJUST_FIELDS) { const v = Math.round(Number(a[f.key]) || 0); if (v) out[f.key] = v; }
  return out;
}
