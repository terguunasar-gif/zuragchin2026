import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HandCoins, Loader2, RefreshCw, Check, X, ArrowRightLeft, Phone, SearchCheck, Upload, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { QPAY_FN_URL, OFFER_STATUS_LABEL, OfferStatus } from '../../lib/offers';

const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface Offer {
  id: string;
  photo_id: string;
  album_name: string;
  preview_url: string | null;
  filename: string | null;
  buyer_name: string;
  buyer_phone: string;
  message: string;
  list_price: number;
  offer_amount: number;
  counter_amount: number | null;
  final_amount: number | null;
  status: OfferStatus;
  auto_accepted: boolean;
  respond_by: string;
  pay_by: string | null;
  created_at: string;
}

interface TraceResult {
  orderCode: string; purchasedAt: string; buyerName: string; buyerPhone: string; amount: number;
  licenseAcceptedAt: string | null; downloadCount: number; albumName: string; filename: string; previewUrl: string;
}

const STATUS_CLS: Record<OfferStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  countered: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  accepted: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  paid: 'bg-emerald-500/25 text-emerald-200 border-emerald-500/40',
  rejected: 'bg-stone-500/15 text-stone-400 border-stone-500/30',
  cancelled: 'bg-stone-500/15 text-stone-500 border-stone-500/30',
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: ANON_KEY, 'Content-Type': 'application/json' };
}

/** Зурагчин / цомгийн эзэн: ирсэн үнийн саналууд, «Зураг шалгах» хэрэгсэл */
export default function PriceOffersPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [busy, setBusy] = useState<string | null>(null);
  const [counter, setCounter] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc('my_price_offers', { p_status: null });
    if (error) setMsg({ text: 'Санал ачаалахад алдаа: ' + error.message + ' (update-40-ийн SQL ажиллуулсан эсэхээ шалгана уу)', ok: false });
    setRows(((data ?? []) as Offer[]).map(o => ({
      ...o,
      // Хугацаа өнгөрсөн бол дэлгэц дээр цуцлагдсан гэж харуулна (сервер дараагийн уншилтад шинэчилнэ)
      status: (o.status === 'pending' || o.status === 'countered') && new Date(o.respond_by).getTime() < Date.now() ? 'cancelled'
        : o.status === 'accepted' && o.pay_by && new Date(o.pay_by).getTime() < Date.now() ? 'cancelled' : o.status,
    })));
    setLoading(false);
  }

  async function respond(o: Offer, action: 'accept' | 'reject' | 'counter') {
    let counterAmount: number | undefined;
    if (action === 'counter') {
      counterAmount = Number(counter[o.id]);
      if (!(counterAmount > o.offer_amount && counterAmount < o.list_price)) {
        setMsg({ text: `Эсрэг санал ₮${(o.offer_amount + 1).toLocaleString()} – ₮${(o.list_price - 1).toLocaleString()} хооронд байна`, ok: false });
        return;
      }
    }
    setBusy(o.id); setMsg(null);
    try {
      const res = await fetch(`${QPAY_FN_URL}/offer-respond`, {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ offerId: o.id, action, counterAmount }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Алдаа');
      const smsNote = data.sms === 'sent' ? ' Зочинд SMS илгээгдлээ.'
        : ` SMS явсангүй — зочинд ${o.buyer_phone} дугаараар холбогдож энэ холбоосыг өгнө үү: ${data.link}`;
      setMsg({ text: (action === 'accept' ? 'Зөвшөөрлөө.' : action === 'reject' ? 'Татгалзлаа.' : 'Эсрэг санал илгээлээ.') + smsNote, ok: true });
      await load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally { setBusy(null); }
  }

  const visible = useMemo(() => rows.filter(r => filter === 'all' || r.status === 'pending' || r.status === 'countered' || r.status === 'accepted'), [rows, filter]);
  const pendingCount = rows.filter(r => r.status === 'pending').length;

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 bg-stone-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <HandCoins className="w-5 h-5 text-amber-400" />
          <p className="text-white font-bold flex-1">Үнийн саналууд {pendingCount > 0 && <span className="text-amber-400">· {pendingCount}</span>}</p>
          <button onClick={load} className="p-2 rounded-lg border border-white/10 text-stone-400 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <p className="text-stone-500 text-xs leading-relaxed">
          Зочид таны зурагт үнээс доогуур санал илгээнэ. 48 цагийн дотор хариулаагүй санал автоматаар цуцлагдана.
          Зөвшөөрсөн бол зочин 24 цагийн дотор төлж, захиалгын дугаар суулгасан эх файлаа авна.
          Орлого ердийн худалдан авалттай адил хуваарилагдана.
        </p>

        {msg && (
          <div className={`flex items-start gap-2 rounded-xl p-3 text-sm border ${msg.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> <span className="break-all">{msg.text}</span>
          </div>
        )}

        <div className="flex gap-2">
          {(['open', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${filter === f ? 'bg-amber-500 border-amber-500 text-stone-950 font-semibold' : 'border-white/10 text-stone-300'}`}>
              {f === 'open' ? 'Идэвхтэй' : 'Бүгд'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
        ) : visible.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center text-stone-400 text-sm">Санал алга байна</div>
        ) : (
          <div className="space-y-3">
            {visible.map(o => (
              <div key={o.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-4">
                {o.preview_url
                  ? <img src={o.preview_url} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                  : <div className="w-20 h-20 rounded-xl bg-stone-800 flex-shrink-0" />}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] px-2 py-0.5 rounded-md border ${STATUS_CLS[o.status]}`}>
                      {OFFER_STATUS_LABEL[o.status]}{o.auto_accepted ? ' (автомат)' : ''}
                    </span>
                    <span className="text-stone-500 text-xs">{fmt(o.created_at)}</span>
                  </div>
                  <p className="text-white text-sm">
                    <span className="font-semibold">₮{Number(o.offer_amount).toLocaleString()}</span>
                    <span className="text-stone-500"> / үнэ ₮{Number(o.list_price).toLocaleString()} ({Math.round(o.offer_amount / o.list_price * 100)}%)</span>
                    {o.counter_amount !== null && <span className="text-sky-300"> · эсрэг ₮{Number(o.counter_amount).toLocaleString()}</span>}
                  </p>
                  <p className="text-stone-400 text-xs truncate">{o.album_name} · {o.filename}</p>
                  <p className="text-stone-300 text-xs flex items-center gap-1.5">
                    {o.buyer_name} · <a href={`tel:${o.buyer_phone}`} className="inline-flex items-center gap-1 text-amber-300"><Phone className="w-3 h-3" />{o.buyer_phone}</a>
                  </p>
                  {o.message && <p className="text-stone-400 text-xs italic">“{o.message}”</p>}

                  {o.status === 'pending' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button onClick={() => respond(o, 'accept')} disabled={busy === o.id}
                        className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-stone-950 font-semibold text-xs px-3 py-1.5 rounded-lg">
                        {busy === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Зөвшөөрөх
                      </button>
                      <button onClick={() => respond(o, 'reject')} disabled={busy === o.id}
                        className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 text-xs px-3 py-1.5 rounded-lg">
                        <X className="w-3.5 h-3.5" /> Татгалзах
                      </button>
                      <div className="flex items-center gap-1">
                        <input type="number" inputMode="numeric" placeholder="₮ эсрэг үнэ" value={counter[o.id] ?? ''}
                          onChange={e => setCounter(c => ({ ...c, [o.id]: e.target.value.replace(/[^\d]/g, '') }))}
                          className="w-28 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-sky-500/50" />
                        <button onClick={() => respond(o, 'counter')} disabled={busy === o.id || !counter[o.id]}
                          className="flex items-center gap-1 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-200 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40">
                          <ArrowRightLeft className="w-3.5 h-3.5" /> Санал болгох
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <TraceTool />
      </main>
    </div>
  );
}

/** Сошиал / зарын сайтаас олсон зургийг шалгаж, аль худалдан авалтаас гарсныг тогтооно */
function TraceTool() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [error, setError] = useState('');

  async function check(file: File) {
    setBusy(true); setError(''); setResult(null);
    try {
      const buf = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
      const text = new TextDecoder('latin1').decode(buf);
      const m = text.match(/<zm:Purchase>([0-9a-f-]{36})<\/zm:Purchase>/i) || text.match(/purchase:([0-9a-f-]{36})/i);
      const code = text.match(/ZM-[0-9A-F]{10}/)?.[0];
      if (!m) {
        throw new Error('Энэ файлд захиалгын дугаар олдсонгүй. Сошиал сайтууд мета өгөгдлийг устгадаг тул screenshot эсвэл дахин хадгалсан файлаас олдохгүй байж болно. Худалдан авагчаас эх файлыг нь авч шалгаарай.');
      }
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${QPAY_FN_URL}/trace-purchase`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId: m[1], orderCode: code }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Шалгаж чадсангүй');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
      <h2 className="text-white font-semibold flex items-center gap-2"><SearchCheck className="w-5 h-5 text-amber-400" /> Зураг шалгах</h2>
      <p className="text-stone-400 text-xs leading-relaxed">
        Таны зургийг хэн нэгэн дамлан зарж байгааг олсон бол тэр файлыг энд оруулна. Худалдан авсан файл бүрт захиалгын дугаар (ZM-…)
        суулгагддаг тул хэзээ, хэн худалдаж авсныг харуулна.
      </p>
      <input ref={fileRef} type="file" accept="image/jpeg,image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) check(f); }} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 text-white text-sm px-4 py-2 rounded-xl disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Файл сонгох
      </button>
      {error && <p className="text-red-300 text-sm">{error}</p>}
      {result && (
        <div className="flex gap-4 bg-stone-900 border border-amber-500/30 rounded-xl p-4">
          {result.previewUrl && <img src={result.previewUrl} alt="" className="w-20 h-20 rounded-lg object-cover" />}
          <div className="text-sm space-y-1">
            <p className="text-amber-300 font-semibold">{result.orderCode}</p>
            <p className="text-stone-300">Худалдан авсан: {fmt(result.purchasedAt)} · ₮{result.amount.toLocaleString()}</p>
            <p className="text-stone-300">Худалдан авагч: {result.buyerName} · {result.buyerPhone}</p>
            <p className="text-stone-400 text-xs">{result.albumName} · {result.filename}</p>
            <p className="text-stone-400 text-xs">
              {result.licenseAcceptedAt ? `Лицензийг ${fmt(result.licenseAcceptedAt)}-д зөвшөөрсөн` : 'Лицензийн зөвшөөрлийн бүртгэлгүй (хуучин худалдан авалт)'}
              {' · '}{result.downloadCount} удаа татсан
            </p>
            <p className="text-stone-500 text-xs">Дэлгэрэнгүй мэдээлэл (бүтэн утасны дугаар) хэрэгтэй бол сайтын админд хандана уу.</p>
          </div>
        </div>
      )}
    </section>
  );
}
