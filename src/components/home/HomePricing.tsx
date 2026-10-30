import type { ReactNode } from 'react';
import { Gift, Lock, Sparkles, Store, Users } from 'lucide-react';
import { fmtMNT } from '../../lib/freePackages';
import { usePricing } from '../../lib/pricing';

/**
 * Нүүр хуудасны «Үнэ, төлбөр» хэсэг (доод талын танилцуулга видеоны доор).
 * Бүх үнэ platform_settings-ээс уншигдана — супер админ өөрчлөхөд энд шууд шинэчлэгдэнэ.
 */
export default function HomePricing() {
  const p = usePricing();
  if (!p || !p.enabled) return null;
  const price = (n: number) => (n > 0 ? fmtMNT(n) : 'Үнэгүй');
  const n = (x: number) => x.toLocaleString('en-US');

  return (
    <section aria-labelledby="pricing-title" className="mb-10 pb-10 border-b border-white/10">
      <div className="text-center mb-6">
        <h2 id="pricing-title" className="text-white text-xl sm:text-2xl font-bold">Үнэ, төлбөр</h2>
        <p className="text-stone-500 text-sm mt-1">Бүх төлбөрийг QPay-ээр төлнө. Нуугдмал хураамж байхгүй.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card icon={<Store className="w-5 h-5 text-amber-300" />} tint="bg-amber-500/15" title="«Худалдах» цомог"
          lead={<>Зурагчин бүр нэг цомогт <b className="text-white">{n(p.photoQuotaFree)} зураг үнэгүй</b> оруулна.</>}>
          {p.quotaPackages.map(q => <Row key={q.code || q.name} label={`Нэмэлт ${q.name.replace(/^\+?\s*/, '+')}`} value={price(q.price)} />)}
          <Note>AI бүүтийн зураг хязгаарт тооцогдохгүй.</Note>
          <Note>Зургийн үнийг зурагчин өөрөө тогтооно (доод үнэ {fmtMNT(p.minPhotoPrice)}). Худалдан авагч зургаа төлснөөс хойш {p.downloadDays} хоногт татаж авна.</Note>
          <Note>Зурагчид орлогоо {fmtMNT(p.payoutMin)}-өөс дээш болоход данс руугаа татна.</Note>
        </Card>

        <Card icon={<Gift className="w-5 h-5 text-emerald-300" />} tint="bg-emerald-500/15" title="«Үнэгүй хуваалцах» цомог"
          lead="Зургаа хамт олондоо үнэгүй тараах цомог. Багцаар төлнө:">
          {p.freePackages.map(f => (
            <Row key={f.code} label={`${f.name} · ${n(f.photos)} зураг · ${f.days} хоног`} value={price(f.price)} />
          ))}
        </Card>

        <Card icon={<Users className="w-5 h-5 text-teal-300" />} tint="bg-teal-500/15" title="Зочдын зураг"
          lead="Хамт олны гишүүд утсаараа авсан зургаа цомогт оруулж, бусадтайгаа үнэгүй хуваалцана. Зочдын зураг зарагдахгүй.">
          {p.guestPackages.map(g => <Row key={g.code} label={`${g.name} · нийт ${n(g.photos)} зураг`} value={price(g.price)} />)}
          <Note>Цомгийн эзэн нэг удаа төлнө. Зочин бүрт хязгаар байхгүй — бүх зочид нийт хязгаарыг хамтдаа ашиглана.</Note>
        </Card>

        <Card icon={<Lock className="w-5 h-5 text-sky-300" />} tint="bg-sky-500/15" title="Цомгийн нэмэлт үйлчилгээ"
          lead={<>Цомог үйл явдлаас хойш <b className="text-white">{p.albumOpenDays} хоног</b> нээлттэй байна. Хүссэн үедээ сунгаж болно — үлдсэн хоног дээр нэмэгдэнэ.</>}>
          {p.extendOptions.map(o => <Row key={o.days} label={`Хугацаа сунгах · ${o.days} хоног`} value={price(o.price)} />)}
          <Row label="4 оронтой кодоор түгжих" value={price(p.albumLockPrice)} />
          {p.listingPackages.map(l => <Row key={l.code} label={`Нүүр хуудсанд нийтлэх · ${l.name}`} value={price(l.price)} />)}
        </Card>

        <Card icon={<Sparkles className="w-5 h-5 text-fuchsia-300" />} tint="bg-fuchsia-500/15" title="AI үйлчилгээ"
          lead="Арга хэмжээн дээрх AI бүүт болон AI видео.">
          <Row label="AI бүүтийн нэг зураг" value={price(p.aiBoothPrice)} />
          {p.aiVideoEnabled && <Row label="AI бүүтийн нэг видео" value={price(p.aiVideoPrice)} />}
          <Row label="Цомог дахь AI бүүтийн зураг татах" value={price(p.aiAlbumPrice)} />
          {p.albumVideoEnabled && <Row label="Цомгийн зургаар AI видео загвар" value={price(p.albumVideoPrice)} />}
        </Card>
      </div>
    </section>
  );
}

function Card({ icon, tint, title, lead, children }: { icon: ReactNode; tint: string; title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 ${tint} rounded-xl flex items-center justify-center flex-shrink-0`}>{icon}</div>
        <h3 className="text-white font-semibold">{title}</h3>
      </div>
      <p className="text-stone-400 text-sm mb-3">{lead}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm border-b border-white/5 pb-2 last:border-0">
      <span className="text-stone-300">{label}</span>
      <span className={`font-semibold whitespace-nowrap ${value === 'Үнэгүй' ? 'text-emerald-400' : 'text-amber-300'}`}>{value}</span>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-stone-500 text-xs leading-relaxed">{children}</p>;
}
