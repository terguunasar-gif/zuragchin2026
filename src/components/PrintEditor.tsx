import { useEffect, useRef, useState } from 'react';
import { Crop, Eye, Loader2, Move, Printer, RotateCcw, Save, SlidersHorizontal, X } from 'lucide-react';
import { ADJUST_FIELDS, applyAdjustToCanvas, CROP_KEYS, cropRect, isNeutral, loadImg, paperRatio, PhotoAdjust, PrintCrop, PRINT_SIZE_CM, renderPaper } from '../lib/photoAdjust';

type Edit = PhotoAdjust & PrintCrop;
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
  onPrint: (adjust: Edit) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<ImageData | null>(null);
  const rafRef = useRef(0);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const [adjust, setAdjust] = useState<Edit>({});
  const [savedAdjust, setSavedAdjust] = useState<Edit>({});
  const [size, setSize] = useState('10x15');
  const dragRef = useRef<{ x: number; y: number } | null>(null);
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
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * scale);
        c.height = Math.round(im.naturalHeight * scale);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(im, 0, 0, c.width, c.height);
        baseRef.current = ctx.getImageData(0, 0, c.width, c.height);
        workRef.current = c;
        setSize(src.size || '10x15');
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
  // Слайдер/чирэлт бүрт: засвар → цаасны харьцаанд тайралт → урьдчилан харах
  useEffect(() => {
    const base = baseRef.current, w = workRef.current, c = canvasRef.current;
    if (!base || !w || !c) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const wctx = w.getContext('2d', { willReadFrequently: true })!;
      wctx.putImageData(base, 0, 0);
      if (!compare) applyAdjustToCanvas(wctx, w.width, w.height, adjust);
      const paper = compare ? w : renderPaper(w, w.width, w.height, size, adjust);
      c.width = paper.width; c.height = paper.height;
      c.getContext('2d')!.drawImage(paper, 0, 0);
    });
  }, [adjust, compare, loading, size]);

  // Чирж байрлал өөрчлөх (дүүргэх горимд)
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (Number(adjust.cropFit) === 1 || compare) return;
    dragRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = dragRef.current, w = workRef.current;
    if (!d || !w) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    const R = paperRatio(size, w.width, w.height, Number(adjust.cropOrient) || 0);
    const r = cropRect(w.width, w.height, R, adjust);
    const perCss = r.sw / Math.max(1, e.currentTarget.clientWidth);
    const fx = w.width - r.sw, fy = w.height - r.sh;
    setAdjust(a => ({
      ...a,
      cropX: fx > 1 ? Math.max(-100, Math.min(100, (Number(a.cropX) || 0) - (dx * perCss) / (fx / 2) * 100)) : 0,
      cropY: fy > 1 ? Math.max(-100, Math.min(100, (Number(a.cropY) || 0) - (dy * perCss) / (fy / 2) * 100)) : 0,
    }));
  }
  function onUp() { dragRef.current = null; }
  const cropSet = (patch: PrintCrop) => setAdjust(a => ({ ...a, ...patch }));
  const sizeLabel = (() => { const v = PRINT_SIZE_CM[size]; return v ? `${v[0]}×${v[1]} см` : size; })();

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
            <canvas ref={canvasRef}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              className={`max-w-full max-h-[70vh] object-contain shadow-[0_0_0_1px_rgba(255,255,255,0.25)] touch-none ${Number(adjust.cropFit) === 1 ? '' : 'cursor-move'} ${loading ? 'opacity-0' : ''}`} />
            {!loading && !error && Number(adjust.cropFit) !== 1 && (
              <span className="absolute top-4 left-4 flex items-center gap-1 bg-black/70 text-white text-[11px] px-2 py-1 rounded-lg pointer-events-none">
                <Move className="w-3 h-3" /> Чирж байрлуулна · {sizeLabel}
              </span>
            )}
            {!loading && !error && (
              <button
                onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)}
                className="absolute bottom-4 left-4 flex items-center gap-1.5 bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg select-none">
                <Eye className="w-3.5 h-3.5" />{compare ? 'Эх зураг' : 'Дарж байхад эх зураг'}
              </button>
            )}
          </div>

          <div className="p-4 space-y-4 border-t md:border-t-0 md:border-l border-white/10">
            <div className="space-y-2 pb-3 border-b border-white/10">
              <p className="text-white text-xs font-semibold flex items-center gap-1.5"><Crop className="w-3.5 h-3.5 text-amber-400" /> Цаасны хэмжээ {sizeLabel}</p>
              <div className="grid grid-cols-3 gap-1">
                {([['Зургийнхаар', 0], ['Босоо', 1], ['Хэвтээ', 2]] as const).map(([l, v]) => (
                  <button key={v} type="button" onClick={() => cropSet({ cropOrient: v, cropX: 0, cropY: 0 })}
                    className={`text-[11px] rounded-lg py-1.5 ${(Number(adjust.cropOrient) || 0) === v ? 'bg-amber-500 text-stone-950 font-semibold' : 'bg-white/10 text-stone-300'}`}>{l}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button type="button" onClick={() => cropSet({ cropFit: 0 })}
                  className={`text-[11px] rounded-lg py-1.5 ${Number(adjust.cropFit) !== 1 ? 'bg-amber-500 text-stone-950 font-semibold' : 'bg-white/10 text-stone-300'}`}>Дүүргэх (тайрна)</button>
                <button type="button" onClick={() => cropSet({ cropFit: 1 })}
                  className={`text-[11px] rounded-lg py-1.5 ${Number(adjust.cropFit) === 1 ? 'bg-amber-500 text-stone-950 font-semibold' : 'bg-white/10 text-stone-300'}`}>Бүтэн (цагаан хүрээ)</button>
              </div>
              {Number(adjust.cropFit) !== 1 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-stone-300 text-xs">Томруулах</span>
                    <span className="text-xs tabular-nums text-stone-400">{((Number(adjust.cropZoom) || 100) / 100).toFixed(1)}×</span>
                  </div>
                  <input type="range" min={100} max={400} value={Number(adjust.cropZoom) || 100} disabled={loading || !!error}
                    onChange={e => cropSet({ cropZoom: Number(e.target.value) })} className="w-full accent-amber-500" />
                </div>
              )}
              <button type="button" onClick={() => cropSet({ cropZoom: 100, cropX: 0, cropY: 0 })}
                className="w-full text-[11px] text-stone-400 hover:text-white border border-white/10 rounded-lg py-1.5">Голлуулах</button>
            </div>
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

            <button type="button" onClick={() => setAdjust(a => { const k: Edit = {}; for (const c of CROP_KEYS) if (a[c]) k[c] = a[c]; return k; })} disabled={isNeutral(adjust)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-stone-400 hover:text-white border border-white/10 rounded-lg py-2 disabled:opacity-40">
              <RotateCcw className="w-3.5 h-3.5" /> Бүгдийг анхны байдалд
            </button>

            <p className="text-stone-500 text-[11px] leading-relaxed">
              Эх файл өөрчлөгдөхгүй. Хадгалсан засвар энэ захиалгыг хэвлэх бүрт хэрэгжинэ. Цомгийн лого тайрсан зурган дээр нэмэгдэх тул тайрагдахгүй.
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

function clean(a: Edit): Edit {
  const out: Edit = {};
  for (const f of ADJUST_FIELDS) { const v = Math.round(Number(a[f.key]) || 0); if (v) out[f.key] = v; }
  for (const k of CROP_KEYS) { const v = Math.round(Number(a[k]) || 0); if (v && !(k === 'cropZoom' && v === 100)) out[k] = v; }
  return out;
}
