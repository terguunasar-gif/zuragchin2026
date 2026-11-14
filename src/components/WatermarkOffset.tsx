import type { CSSProperties } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from 'lucide-react';

/** Сонгосон байршлаас бага зэрэг шилжүүлэх хязгаар (зургийн өргөн/өндрийн %) */
export const OFFSET_MAX = 20;

export function clampOffset(v: unknown): number {
  const n = Math.round(Number(v) || 0);
  return Math.max(-OFFSET_MAX, Math.min(OFFSET_MAX, n));
}

/** Урьдчилан харахад давхаргыг шилжүүлэх гадна бүрхүүл (translate % = зургийн хэмжээний %) */
export function offsetWrapStyle(offsetX?: number, offsetY?: number): CSSProperties {
  const x = clampOffset(offsetX), y = clampOffset(offsetY);
  return { position: 'absolute', inset: 0, pointerEvents: 'none', transform: x || y ? `translate(${x}%, ${y}%)` : undefined };
}

/** «Байршил»-ын доор: баруун/зүүн, дээш/доош нарийн тохируулга */
export default function WatermarkOffset({ offsetX = 0, offsetY = 0, onChange }: {
  offsetX?: number; offsetY?: number;
  onChange: (patch: { offsetX: number; offsetY: number }) => void;
}) {
  const x = clampOffset(offsetX), y = clampOffset(offsetY);
  const set = (nx: number, ny: number) => onChange({ offsetX: clampOffset(nx), offsetY: clampOffset(ny) });
  const btn = 'w-9 h-9 rounded-lg bg-stone-800 border border-white/10 hover:border-amber-500/50 flex items-center justify-center text-stone-300 disabled:opacity-30';
  const label = (v: number, neg: string, pos: string) => (v === 0 ? '0' : `${Math.abs(v)}% ${v < 0 ? neg : pos}`);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-stone-400 text-xs">Нарийн байрлуулах</span>
        {(x !== 0 || y !== 0) && (
          <button type="button" onClick={() => set(0, 0)} className="flex items-center gap-1 text-xs text-stone-500 hover:text-amber-400">
            <RotateCcw className="w-3 h-3" /> Анхны байршил
          </button>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="grid grid-cols-3 gap-1 w-fit">
          <span />
          <button type="button" title="Дээш" className={btn} disabled={y <= -OFFSET_MAX} onClick={() => set(x, y - 1)}><ArrowUp className="w-4 h-4" /></button>
          <span />
          <button type="button" title="Зүүн" className={btn} disabled={x <= -OFFSET_MAX} onClick={() => set(x - 1, y)}><ArrowLeft className="w-4 h-4" /></button>
          <span className="w-9 h-9 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /></span>
          <button type="button" title="Баруун" className={btn} disabled={x >= OFFSET_MAX} onClick={() => set(x + 1, y)}><ArrowRight className="w-4 h-4" /></button>
          <span />
          <button type="button" title="Доош" className={btn} disabled={y >= OFFSET_MAX} onClick={() => set(x, y + 1)}><ArrowDown className="w-4 h-4" /></button>
          <span />
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <p className="text-stone-500 text-[11px] mb-1">Хэвтээ: <span className="text-white">{label(x, 'зүүн', 'баруун')}</span></p>
            <input type="range" min={-OFFSET_MAX} max={OFFSET_MAX} value={x} onChange={e => set(Number(e.target.value), y)} className="w-full accent-amber-500" />
          </div>
          <div>
            <p className="text-stone-500 text-[11px] mb-1">Босоо: <span className="text-white">{label(y, 'дээш', 'доош')}</span></p>
            <input type="range" min={-OFFSET_MAX} max={OFFSET_MAX} value={y} onChange={e => set(x, Number(e.target.value))} className="w-full accent-amber-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
