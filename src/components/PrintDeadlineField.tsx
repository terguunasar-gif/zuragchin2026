import { dateInputToDeadlineIso, deadlineDateInput, endOfDay, formatPrintDay } from '../lib/printDeadline';

/** Цомог үүсгэх/засах: угаалгах захиалгын эцсийн өдөр. Хоосон = хязгааргүй. */
export default function PrintDeadlineField({ value, onChange }: { value: string; onChange: (yyyyMmDd: string) => void }) {
  const iso = dateInputToDeadlineIso(value);
  const setDays = (days: number) => onChange(deadlineDateInput(endOfDay(new Date(), days).toISOString()));
  return (
    <div className="space-y-2">
      <label className="text-stone-400 text-xs mb-1.5 block">Угаалгах захиалга авах эцсийн хугацаа</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-4 py-3 outline-none text-sm [color-scheme:dark]" />
      <div className="flex flex-wrap gap-2">
        {[3, 7, 14].map(n => (
          <button key={n} type="button" onClick={() => setDays(n)}
            className="rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold px-3 py-1.5">
            +{n} хоног
          </button>
        ))}
        <button type="button" onClick={() => onChange('')}
          className="rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 text-xs font-semibold px-3 py-1.5">
          Хязгааргүй
        </button>
      </div>
      <p className="text-amber-200/90 text-xs leading-relaxed">
        {iso
          ? `Угаалгах захиалга ${formatPrintDay(iso)} хүртэл. Үүний дараа угаалгах хаагдаж, татах нээлттэй үлдэнэ.`
          : 'Огноо сонгоогүй — угаалгах захиалга хязгааргүй. Шинэ цомогт арга хэмжээнээс 7 хоногийг санал болгоно.'}
      </p>
    </div>
  );
}
