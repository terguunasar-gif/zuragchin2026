import { useEffect, useState } from 'react';
import { Loader2, Printer, Power } from 'lucide-react';
import { getAutoPrintState, setAutoPrintOn, subscribeAutoPrint } from '../lib/autoPrintRunner';

/**
 * «Автомат принт» удирдлага. Хэвлэх ажил нь App-д байрлах AutoPrintRunner-оор сайтын аль ч хуудсанд
 * үргэлжилнэ — энэ хэсэг зөвхөн асаах/унтраах, явцыг харуулна.
 */
export default function AutoPrintBar() {
  const [s, setS] = useState(getAutoPrintState);
  useEffect(() => subscribeAutoPrint(setS), []);
  const on = s.on;

  return (
    <div className={`rounded-xl border p-3 mb-4 ${on ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <Printer className={`w-5 h-5 ${on ? 'text-emerald-400' : 'text-stone-500'}`} />
        <div className="flex-1 min-w-[200px]">
          <p className="text-white text-sm font-semibold">
            Автомат принт {on ? <span className="text-emerald-400">· энэ компьютер дээр асаалттай</span> : <span className="text-stone-500">· унтраалттай</span>}
          </p>
          <p className="text-stone-400 text-xs">
            {on
              ? (s.busy ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Хэвлэж байна: {s.busy}{s.queued ? ` · дараалалд ${s.queued}` : ''}</span>
                : 'Авто принт асаалттай цомгийн шинэ төлөгдсөн угаах захиалга ирмэгц энэ компьютерийн принтерээр өөрөө хэвлэнэ. Сайтын аль ч хуудсанд байсан ажиллана — цонхоо хаахгүй.')
              : 'Асаавал «Цомог» табаас авто принт асаасан цомгуудын угаах зураг төлөгдмөгц энэ компьютерээр шууд хэвлэгдэнэ. Зөвхөн хэвлэдэг нэг компьютер дээр асаана уу.'}
          </p>
        </div>
        <button type="button" onClick={() => setAutoPrintOn(!on)}
          className={`flex items-center gap-1.5 text-sm font-bold px-3 py-2 rounded-lg ${on ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-emerald-500 text-stone-950 hover:bg-emerald-400'}`}>
          <Power className="w-4 h-4" /> {on ? 'Унтраах' : 'Асаах'}
        </button>
      </div>
      {s.albums !== null && (
        <p className="text-xs mt-2">
          {s.albums === 0
            ? <span className="text-amber-300">Авто принт асаалттай цомог алга. Админ → «Цомог» табаас цомгийн «Авто принт» товчийг асаана уу.</span>
            : <span className="text-emerald-300">Авто принт асаалттай цомог: {s.albums}</span>}
        </p>
      )}
      {on && (
        <p className="text-stone-500 text-[11px] mt-2">
          Хэвлэх цонх асуулгүй шууд хэвлүүлэх бол Chrome-ыг <code className="text-stone-300">--kiosk-printing</code>-тэй (Zuragchin-avtomat-print.bat) нээж, принтерээ «Default» болгоно.
        </p>
      )}
      {s.log.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {s.log.map((l, k) => (
            <li key={k} className={`text-[11px] ${l.ok ? 'text-stone-400' : 'text-red-300'}`}>{l.t} — {l.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
