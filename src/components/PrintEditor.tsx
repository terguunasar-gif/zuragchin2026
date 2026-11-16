import { useEffect, useRef, useState } from 'react';
import { Crop, Eye, Loader2, Move, Printer, RotateCcw, Save, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { ADJUST_FIELDS, applyAdjustToCanvas, CROP_KEYS, cropRect, isNeutral, loadImg, PhotoAdjust, PrintCrop, PRINT_SIZE_CM, renderPaper, targetRatio } from '../lib/photoAdjust';

type Edit = PhotoAdjust & PrintCrop;

/** Худалдан авагчийн засварт: зургийн эх сурвалж ба хадгалах арга */
export interface EditorSource {
  load: () => Promise<{ url: string; size: string; adjust: Edit }>;
  save: (a: Edit) => Promise<void>;
}

import { loadPrintSource, savePrintAdjust } from '../lib/printPhoto';
import { bakedMarkRects, blurRects, drawBrandOverlay } from '../lib/watermark';

const PREVIEW_MAX = 1400;

/**
 * Угаалгах захиалгын зургийг хэвлэхээс өмнө гэрэл, сүүдэр, өнгийг тохируулах цонх.
 * Засвар хадгалагдаж, дараагийн «Принт» бүрт эх зурагт хэрэгжинэ (эх файл өөрчлөгдөхгүй).
 */
export default function PrintEditor({ purchaseId, title, onClose, onPrint, source, actionLabel, heading, note, brand: brandProp, formats }: {
  /** Татах горимд санал болгох хэвлэх хэмжээнүүд (зурагчны цомогт тохируулсан) */
  formats?: string[];
  /** Цомгийн брэнд давхарга (watermark_value) — эцсийн байрлалд нь тогтмол харуулна */
  brand?: string;
  purchaseId: string;
  title?: string;
  onClose: () => void;
  /** «Хадгалаад хэвлэх/татах» — эцэг компонент үйлдлээ хийнэ. Байхгүй бол зөвхөн «Хадгалах». */
  onPrint?: (adjust: Edit) => void;
  /** Худалдан авагчийн горим: өөр эх сурвалжаас ачаалж, өөр аргаар хадгална */
  source?: EditorSource;
  actionLabel?: string;
  heading?: string;
  note?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<ImageData | null>(null);
  const rafRef = useRef(0);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const brandTok = useRef(0);
  const [loadedBrand, setLoadedBrand] = useState('');
  const brand = brandProp ?? loadedBrand;
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
        const src = source
          ? await source.load().then(r => ({ signedUrl: r.url, size: r.size, adjust: r.adjust }))
          : await loadPrintSource(purchaseId).then(r => { setLoadedBrand(r.brand || ''); return r; });
        const im = await loadImg(src.signedUrl);
        if (!alive) return;
        const scale = Math.min(1, PREVIEW_MAX / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * scale);
        c.height = Math.round(im.naturalHeight * scale);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(im, 0, 0, c.width, c.height);
        // Худалдан авагчийн горим: preview-д шингэсэн лого/тэмдгийг бүдгэрүүлнэ (доор тогтмол байрлалд дахин зурна)
        if (source) {
          const raw = brandProp || '';
          const k = Math.max(im.naturalWidth, im.naturalHeight) / Math.max(c.width, c.height);
          const rects = await bakedMarkRects(im.naturalWidth, im.naturalHeight, raw).catch(() => []);
          if (!alive) return;
          blurRects(ctx, rects.map(r => ({ x: r.x / k, y: r.y / k, w: r.w / k, h: r.h / k })));
        }
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
      const cctx = c.getContext('2d')!;
      cctx.drawImage(paper, 0, 0);
      // Цомгийн лого — хүрээн дээр тогтмол (эцсийн файлд яг энд гарна)
      if ((brand || source) && !compare) {
        const token = ++brandTok.current;
        const tmp = document.createElement('canvas');
        tmp.width = c.width; tmp.height = c.height;
        drawBrandOverlay(tmp.getContext('2d')!, tmp.width, tmp.height, brand, { siteBadge: !!source })
          .then(() => { if (token === brandTok.current) cctx.drawImage(tmp, 0, 0); })
          .catch(() => null);
      }
    });
  }, [adjust, compare, loading, size, brand]);

  // Чирэх (1 хуруу) ба чимхэж томруулах (2 хуруу)
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const [hint, setHint] = useState(true);
  const fillMode = Number(adjust.cropFit) !== 1;
  const pDist = () => { const [a, b] = [...ptrs.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!fillMode || compare) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) { pinchRef.current = { dist: pDist(), zoom: Number(adjust.cropZoom) || 100 }; dragRef.current = null; }
    else dragRef.current = { x: e.clientX, y: e.clientY };
    setHint(false);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pin = pinchRef.current;
    if (pin && ptrs.current.size >= 2) {
      const z = Math.round(Math.max(100, Math.min(400, pin.zoom * pDist() / Math.max(1, pin.dist))));
      setAdjust(a => ({ ...a, cropZoom: z }));
      return;
    }
    const d = dragRef.current, w = workRef.current;
    if (!d || !w) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    const R = targetRatio(size, w.width, w.height, adjust);
    const r = cropRect(w.width, w.height, R, adjust);
    const perCss = r.sw / Math.max(1, e.currentTarget.clientWidth);
    const fx = w.width - r.sw, fy = w.height - r.sh;
    setAdjust(a => ({
      ...a,
      cropX: fx > 1 ? Math.max(-100, Math.min(100, (Number(a.cropX) || 0) - (dx * perCss) / (fx / 2) * 100)) : 0,
      cropY: fy > 1 ? Math.max(-100, Math.min(100, (Number(a.cropY) || 0) - (dy * perCss) / (fy / 2) * 100)) : 0,
    }));
  }
  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinchRef.current = null;
    if (ptrs.current.size === 1) { const [p] = [...ptrs.current.values()]; dragRef.current = { ...p }; }
    else dragRef.current = null;
  }
  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (!fillMode || compare) return;
    const z = Math.max(100, Math.min(400, (Number(adjust.cropZoom) || 100) - e.deltaY * 0.3));
    setAdjust(a => ({ ...a, cropZoom: Math.round(z) }));
  }
  const cropSet = (patch: PrintCrop) => setAdjust(a => ({ ...a, ...patch }));
  const sizeLabel = (() => { const v = PRINT_SIZE_CM[size]; return v ? `${v[0]}×${v[1]} см` : ''; })();

  const dirty = JSON.stringify(clean(adjust)) !== JSON.stringify(clean(savedAdjust));

  async function save() {
    setSaving(true); setSavedMsg(''); setError('');
    try {
      await (source ? source.save(clean(adjust)) : savePrintAdjust(purchaseId, clean(adjust)));
      setSavedAdjust(adjust);
      setSavedMsg('Хадгалагдлаа ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
    } finally {
      setSaving(false);
    }
  }

  function saveAndPrint() {
    const a = clean(adjust);
    onPrint?.(a); // цонхыг шууд нээх ёстой (хөтөч popup хаахгүйн тулд) — хадгалалт зэрэгцээ явна
    if (dirty) (source ? source.save(a) : savePrintAdjust(purchaseId, a)).then(() => setSavedAdjust(a)).catch(() => null);
  }
  const isPrint = !!PRINT_SIZE_CM[size];
  // Татах горим: зурагчны тохируулсан хэмжээ + босоо/хэвтээ → cropAspect
  const fmtList = (formats?.length ? formats : DEFAULT_FORMATS).filter(f => PRINT_SIZE_CM[f]);
  const asp = Number(adjust.cropAspect) || 0;
  const [fmtState, setFmt] = useState<string | null>(null);
  const fmt = fmtState ?? (asp ? (fmtList.find(f => { const [a, b] = PRINT_SIZE_CM[f]; return Math.round(a / b * 1000) === asp || Math.round(b / a * 1000) === asp; }) ?? '') : '');
  const imgLand = (workRef.current?.width ?? 1) > (workRef.current?.height ?? 1);
  const fmtLand = asp ? asp > 1000 : imgLand;
  function pickFmt(f: string, land: boolean) {
    const [a, b] = PRINT_SIZE_CM[f];
    setFmt(f);
    cropSet({ cropAspect: Math.round((land ? b / a : a / b) * 1000), cropX: 0, cropY: 0 });
  }
  const effOrient = (() => { const o = Number(adjust.cropOrient) || 0; if (o) return o; return imgLand ? 2 : 1; })();
  const [tab, setTab] = useState<'crop' | 'look' | 'fine'>('crop');
  const [field, setField] = useState<keyof PhotoAdjust>('exposure');
  const lookOf = (a: Edit) => { const o: PhotoAdjust = {}; for (const f of ADJUST_FIELDS) { const v = Number(a[f.key]) || 0; if (v) o[f.key] = v; } return o; };
  const curLook = JSON.stringify(lookOf(adjust));
  const applyLook = (p: PhotoAdjust) => setAdjust(a => { const k: Edit = {}; for (const c of CROP_KEYS) if (a[c] != null) (k as Record<string, unknown>)[c] = a[c]; return { ...k, ...p }; });
  const fld = ADJUST_FIELDS.find(f => f.key === field)!;
  const fv = Number(adjust[field]) || 0;
  const disabled = loading || !!error;
  const chip = (on: boolean) => `shrink-0 text-xs rounded-full px-3.5 py-2 whitespace-nowrap ${on ? 'bg-amber-500 text-stone-950 font-semibold' : 'bg-white/10 text-stone-200'}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-stretch md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="bg-stone-950 md:border md:border-white/10 md:rounded-2xl w-full md:max-w-3xl h-[100dvh] md:h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Толгой: хаах · нэр · харьцуулах · буцаах */}
        <div className="flex items-center gap-1 px-2 py-2 border-b border-white/10 shrink-0">
          <button onClick={onClose} className="p-2 text-stone-300 hover:text-white" aria-label="Хаах"><X className="w-5 h-5" /></button>
          <p className="flex-1 min-w-0 text-white font-semibold text-sm truncate">
            {heading ?? 'Хэвлэхийн өмнө засах'}{title ? <span className="text-stone-500 font-normal"> · {title}</span> : null}
          </p>
          <button
            onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)} onContextMenu={e => e.preventDefault()}
            disabled={disabled}
            className={`flex items-center gap-1 text-xs px-2.5 py-2 rounded-lg select-none ${compare ? 'bg-white text-stone-950' : 'text-stone-300 bg-white/10'}`}>
            <Eye className="w-4 h-4" /> Эх
          </button>
          <button type="button" disabled={disabled || (isNeutral(adjust) && !CROP_KEYS.some(k => Number(adjust[k]) && !(k === 'cropZoom' && Number(adjust[k]) === 100)))}
            onClick={() => setAdjust({})} className="p-2 text-stone-300 hover:text-white disabled:opacity-30" aria-label="Анхны байдалд" title="Анхны байдалд">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Зураг — үлдсэн бүх зайг эзэлж, бүтнээрээ багтана */}
        <div className="relative flex-1 min-h-0 bg-stone-900">
          <div className="absolute inset-0 p-3 flex items-center justify-center">
            {loading && <Loader2 className="w-7 h-7 animate-spin text-amber-400 absolute" />}
            <canvas ref={canvasRef}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
              className={`max-w-full max-h-full shadow-[0_0_0_1px_rgba(255,255,255,0.25)] touch-none ${fillMode ? 'cursor-move' : ''} ${loading ? 'opacity-0' : ''}`} />
          </div>
          {!loading && !error && compare && (
            <span className="absolute top-2 left-1/2 -translate-x-1/2 bg-white text-stone-950 text-[11px] font-semibold px-2.5 py-1 rounded-full pointer-events-none">Эх зураг</span>
          )}
          {!loading && !error && !compare && hint && fillMode && tab === 'crop' && (
            <span className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/70 text-white text-[11px] px-2.5 py-1 rounded-full pointer-events-none whitespace-nowrap">
              <Move className="w-3 h-3" /> Чирж байрлуул · 2 хуруугаар томруул
            </span>
          )}
        </div>

        {/* Доод самбар: таб → нэг л хэсгийн удирдлага */}
        <div className="shrink-0 border-t border-white/10 bg-stone-950">
          <div className="h-[118px] px-3 pt-3 flex flex-col justify-center">
            {tab === 'crop' && (
              <div className="space-y-2.5">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3">
                  {isPrint ? <>
                    {([['Босоо', 1], ['Хэвтээ', 2]] as const).map(([l, v]) => (
                      <button key={l} type="button" disabled={disabled} onClick={() => cropSet({ cropOrient: v, cropX: 0, cropY: 0 })}
                        className={chip(effOrient === v)}>{l}</button>
                    ))}
                    <span className="w-px bg-white/10 shrink-0 mx-0.5" />
                    <button type="button" disabled={disabled} onClick={() => cropSet({ cropFit: 0 })} className={chip(fillMode)}>Дүүргэх</button>
                    <button type="button" disabled={disabled} onClick={() => cropSet({ cropFit: 1 })} className={chip(!fillMode)}>Бүтэн</button>
                  </> : <>
                    <button type="button" disabled={disabled} onClick={() => { setFmt(''); cropSet({ cropAspect: 0, cropX: 0, cropY: 0 }); }}
                      className={chip(!fmt)}>Эх</button>
                    {fmtList.map(f => (
                      <button key={f} type="button" disabled={disabled} onClick={() => pickFmt(f, fmtLand)}
                        className={chip(fmt === f)}>{fmtLabel(f)}</button>
                    ))}
                  </>}
                </div>
                {!isPrint && fmt && (
                  <div className="flex gap-1.5">
                    {([['Босоо', false], ['Хэвтээ', true]] as const).map(([l, land]) => (
                      <button key={l} type="button" disabled={disabled} onClick={() => pickFmt(fmt, land)}
                        className={`flex-1 ${chip(fmtLand === land)}`}>{l}</button>
                    ))}
                  </div>
                )}
                {fillMode ? (
                  <div className="flex items-center gap-3">
                    <span className="text-stone-400 text-xs shrink-0 w-14">Томруулах</span>
                    <input type="range" min={100} max={400} value={Number(adjust.cropZoom) || 100} disabled={disabled}
                      onChange={e => cropSet({ cropZoom: Number(e.target.value) })} className="flex-1 accent-amber-500 h-8" />
                    <button type="button" onClick={() => cropSet({ cropZoom: 100, cropX: 0, cropY: 0 })}
                      className="text-[11px] text-stone-300 bg-white/10 rounded-lg px-2.5 py-1.5 shrink-0">Голлуулах</button>
                  </div>
                ) : (
                  <p className="text-stone-500 text-[11px]">Зураг бүтнээрээ, хажуудаа цагаан хүрээтэй хэвлэгдэнэ.</p>
                )}
                {(isPrint || !fmt) && <p className="text-stone-500 text-[11px]">{isPrint ? `Цаас ${sizeLabel}` : 'Хэмжээ сонговол босоо зургийг хэвтээгээр (эсвэл эсрэгээр) тайрч болно'}</p>}
              </div>
            )}

            {tab === 'look' && (
              <div className="space-y-2">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 pb-1">
                  {LOOKS.map(l => (
                    <button key={l.name} type="button" disabled={disabled} onClick={() => applyLook(l.v)}
                      className={chip(curLook === JSON.stringify(l.v))}>{l.name}</button>
                  ))}
                </div>
                <p className="text-stone-500 text-[11px]">Нэг дараад өнгө, гэрлийг бэлэн хувилбараар сайжруулна. Нарийн тааруулахыг «Нарийн» хэсгээс.</p>
              </div>
            )}

            {tab === 'fine' && (
              <div className="space-y-2">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3">
                  {ADJUST_FIELDS.map(f => {
                    const v = Number(adjust[f.key]) || 0;
                    return (
                      <button key={f.key} type="button" onClick={() => setField(f.key)} className={chip(field === f.key)}>
                        {SHORT[f.key] ?? f.label}{v ? <span className={field === f.key ? '' : 'text-amber-400'}> {v > 0 ? `+${v}` : v}</span> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-stone-500 w-12 text-right leading-tight">{fld.left}</span>
                  <input type="range" min={-100} max={100} value={fv} disabled={disabled}
                    onChange={e => setAdjust(a => ({ ...a, [field]: Number(e.target.value) }))}
                    className="flex-1 accent-amber-500 h-8" />
                  <span className="text-[10px] text-stone-500 w-12 leading-tight">{fld.right}</span>
                </div>
                <div className="flex items-center justify-center gap-3 text-xs">
                  <span className={`tabular-nums ${fv ? 'text-amber-400' : 'text-stone-500'}`}>{fld.label}: {fv > 0 ? `+${fv}` : fv}</span>
                  {fv !== 0 && <button type="button" onClick={() => setAdjust(a => ({ ...a, [field]: 0 }))} className="text-stone-400 underline">0 болгох</button>}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 border-t border-white/10 mt-2">
            {([['crop', 'Тайрах', Crop], ['look', 'Шүүлтүүр', Sparkles], ['fine', 'Нарийн', SlidersHorizontal]] as const).map(([k, l, Icon]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${tab === k ? 'text-amber-400' : 'text-stone-400'}`}>
                <Icon className="w-5 h-5" />{l}
              </button>
            ))}
          </div>

          {(error || (savedMsg && !dirty) || note) && (
            <p className={`px-3 text-[11px] ${error ? 'text-red-400' : savedMsg && !dirty ? 'text-emerald-400' : 'text-stone-500'}`}>
              {error || (savedMsg && !dirty ? savedMsg : note)}
            </p>
          )}
          <div className={`grid ${onPrint ? 'grid-cols-[1fr_1.6fr]' : 'grid-cols-1'} gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]`}>
            <button type="button" onClick={save} disabled={saving || disabled || !dirty}
              className="flex items-center justify-center gap-1.5 border border-white/15 text-white text-sm rounded-xl py-3 disabled:opacity-40">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Хадгалах
            </button>
            {onPrint && (
              <button type="button" onClick={saveAndPrint} disabled={disabled}
                className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm rounded-xl py-3 disabled:opacity-40">
                <Printer className="w-4 h-4" /> {actionLabel ?? 'Хэвлэх'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_FORMATS = ['10x15', '13x18', '20x30', 'A4'];
const fmtLabel = (f: string) => (f === 'A4' ? 'A4' : f.replace('x', '×'));

const SHORT: Partial<Record<keyof PhotoAdjust, string>> = {
  exposure: 'Гэрэл', contrast: 'Тодрол', highlights: 'Гэрэлтэй хэсэг', shadows: 'Сүүдэр', saturation: 'Өнгө', temperature: 'Дулаан',
};

/** Нэг товшилтоор хэрэгжих бэлэн хувилбарууд */
const LOOKS: { name: string; v: PhotoAdjust }[] = [
  { name: 'Эх', v: {} },
  { name: 'Авто', v: { exposure: 8, contrast: 12, highlights: -25, shadows: 30, saturation: 10 } },
  { name: 'Гэгээлэг', v: { exposure: 25, shadows: 35, highlights: -15 } },
  { name: 'Тод', v: { contrast: 25, saturation: 25 } },
  { name: 'Дулаан', v: { temperature: 35, saturation: 8 } },
  { name: 'Хүйтэн', v: { temperature: -30 } },
  { name: 'Зөөлөн', v: { contrast: -20, highlights: -25, saturation: -10 } },
  { name: 'Хар цагаан', v: { saturation: -100, contrast: 15 } },
];

function clean(a: Edit): Edit {
  const out: Edit = {};
  for (const f of ADJUST_FIELDS) { const v = Math.round(Number(a[f.key]) || 0); if (v) out[f.key] = v; }
  for (const k of CROP_KEYS) { const v = Math.round(Number(a[k]) || 0); if (v && !(k === 'cropZoom' && v === 100)) out[k] = v; }
  return out;
}
