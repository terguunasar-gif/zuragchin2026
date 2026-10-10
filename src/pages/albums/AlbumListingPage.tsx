import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Megaphone, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fmtMNT } from '../../lib/freePackages';
import { LISTING_CATEGORIES, ListingPackage, albumHref, loadListingPackages } from '../../lib/listing';
import BankLinks, { BankLink } from '../../components/BankLinks';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const LOCATIONS = [
  'Улаанбаатар', 'Дархан', 'Эрдэнэт', 'Баянхонгор', 'Өвөрхангай', 'Архангай', 'Булган', 'Орхон', 'Сэлэнгэ', 'Төв',
  'Дорнод', 'Сүхбаатар', 'Хэнтий', 'Дорноговь', 'Дундговь', 'Өмнөговь', 'Говьсүмбэр', 'Ховд', 'Баян-Өлгий', 'Увс',
  'Завхан', 'Говь-Алтай', 'Хөвсгөл',
];

interface AlbumInfo {
  id: string; name: string; title?: string; is_free: boolean; status: string; share_link: string;
  expires_at?: string | null; listed_until?: string | null; listing_hidden?: boolean;
  listing_category?: string; listing_location?: string; cover_photo_id?: string | null;
}
interface Invoice { invoiceId: string; qrImage: string; urls: BankLink[]; amount: number }

/** Цомгийг нүүр хуудсанд төлбөртэй, хугацаатай нийтлэх (цомгийн эзэн) */
export default function AlbumListingPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<AlbumInfo | null>(null);
  const [photos, setPhotos] = useState<{ id: string; preview_url: string }[]>([]);
  const [packages, setPackages] = useState<ListingPackage[]>([]);
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [selected, setSelected] = useState<ListingPackage | null>(null);
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => { load(); return () => { if (timer.current) window.clearInterval(timer.current); }; }, [albumId]);

  async function load() {
    if (!albumId) return;
    setLoading(true);
    const [{ data: a }, { data: ph }, pk] = await Promise.all([
      supabase.from('albums').select('id, name, title, is_free, status, share_link, expires_at, listed_until, listing_hidden, listing_category, listing_location, cover_photo_id').eq('id', albumId).maybeSingle(),
      supabase.from('photo_uploads').select('id, preview_url').eq('album_id', albumId).neq('source', 'ai_booth').order('created_at', { ascending: false }).limit(60),
      loadListingPackages(),
    ]);
    const al = a as AlbumInfo | null;
    setAlbum(al);
    setPhotos((ph ?? []) as { id: string; preview_url: string }[]);
    setPackages(pk);
    if (al) { setCategory(al.listing_category || ''); setLocation(al.listing_location || ''); setCover(al.cover_photo_id ?? null); }
    setLoading(false);
  }

  async function saveInfo(): Promise<boolean> {
    if (!category) { setError('Ангилал сонгоно уу'); return false; }
    setSaving(true); setError('');
    const { error: err } = await supabase.from('albums')
      .update({ listing_category: category, listing_location: location, cover_photo_id: cover }).eq('id', albumId);
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return false; }
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    return true;
  }

  async function buy(p: ListingPackage) {
    if (!(await saveInfo())) return;
    setBusy(p.code); setError(''); setSelected(p);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${QPAY_FN_URL}/listing-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: ANON_KEY },
        body: JSON.stringify({ albumId, packageCode: p.code }),
      });
      const data = await res.json();
      if (!res.ok || !data.invoiceId) throw new Error(data.error || 'QPay');
      setInvoice(data);
      timer.current = window.setInterval(async () => {
        try {
          const r = await fetch(`${QPAY_FN_URL}/check-listing/${data.invoiceId}`, { headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY } });
          const c = await r.json();
          if (c.isPaid) {
            if (timer.current) window.clearInterval(timer.current);
            setInvoice(null); setDone(true); load();
          }
        } catch { /* дахин оролдоно */ }
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(null);
    }
  }

  const fmtDate = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };
  const active = !!album?.listed_until && new Date(album.listed_until).getTime() > Date.now();
  const expired = !!album?.expires_at && new Date(album.expires_at).getTime() < Date.now();
  const blocked = !album ? '' : album.is_free ? 'Зөвхөн «Худалдах» горимын цомгийг нийтэлнэ. «Үнэгүй хуваалцах» цомгийг линкээр нь хуваалцана уу.'
    : album.status !== 'active' ? 'Цомог идэвхтэй биш байна.'
    : expired ? 'Цомгийн хугацаа дууссан байна. Эхлээд сунгана уу.'
    : album.listing_hidden ? 'Энэ цомгийн нийтлэлийг админ хаасан байна. Дэлгэрэнгүйг админтай холбогдож асууна уу.'
    : photos.length === 0 ? 'Цомогт зураг алга. Эхлээд зураг оруулна уу.' : '';

  const select = 'w-full bg-white/5 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-3 py-2.5 text-sm outline-none';

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 bg-stone-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <Megaphone className="w-5 h-5 text-amber-400" />
          <p className="text-white font-bold truncate">Нүүр хуудсанд нийтлэх{album ? ` · ${album.title || album.name}` : ''}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-amber-400 animate-spin" /></div>
        ) : !album ? (
          <p className="text-stone-400 text-center py-20">Цомог олдсонгүй.</p>
        ) : (
          <>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5">
              <p className="text-amber-200 font-semibold">Цомгоо олон хүнд хүргэ</p>
              <p className="text-amber-100/70 text-sm mt-1 leading-relaxed">
                Нийтлэгдсэн цомог Zuragchin.mn-ийн нүүр хуудас болон «Бүх цомог» хэсэгт харагдана. Хүмүүс өөрийн зургийг олж шууд
                худалдаж авна — орлого одоогийн хувиар зурагчин, зохион байгуулагчид хуваарилагдана.
              </p>
              {active && (
                <p className="text-white text-sm mt-3 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Нийтлэгдсэн · {fmtDate(album.listed_until)} хүртэл
                  {album.share_link && (
                    <a href={albumHref(album.share_link)} target="_blank" rel="noreferrer" className="text-amber-300 ml-2 inline-flex items-center gap-1 underline">Харах <ExternalLink className="w-3.5 h-3.5" /></a>
                  )}
                </p>
              )}
            </div>

            {done && (
              <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                <p className="text-white font-semibold">Төлбөр баталгаажлаа — цомог нүүр хуудсанд гарлаа!</p>
              </div>
            )}

            {blocked ? (
              <p className="text-stone-300 text-sm bg-white/5 border border-white/10 rounded-xl p-4">{blocked}</p>
            ) : (
              <>
                <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                  <p className="text-white font-semibold">1. Цомгийн мэдээлэл</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-xs text-stone-400 space-y-1.5 block">
                      <span>Ангилал *</span>
                      <select value={category} onChange={e => setCategory(e.target.value)} className={select}>
                        <option value="">Сонгох…</option>
                        {LISTING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-stone-400 space-y-1.5 block">
                      <span>Байршил</span>
                      <select value={location} onChange={e => setLocation(e.target.value)} className={select}>
                        <option value="">—</option>
                        {LOCATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  </div>
                  <div>
                    <p className="text-xs text-stone-400 mb-2">Нүүр зураг (усан тэмдэгтэй хувилбар харагдана)</p>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto pr-1">
                      {photos.map(p => (
                        <button key={p.id} onClick={() => setCover(p.id)}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 ${cover === p.id ? 'border-amber-400' : 'border-transparent opacity-80 hover:opacity-100'}`}>
                          <img src={p.preview_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                          {cover === p.id && <CheckCircle2 className="absolute top-1 right-1 w-5 h-5 text-amber-400 drop-shadow" />}
                        </button>
                      ))}
                    </div>
                    {!cover && <p className="text-stone-500 text-xs mt-2">Сонгохгүй бол хамгийн сүүлд оруулсан зураг нүүр болно.</p>}
                  </div>
                  <button onClick={saveInfo} disabled={saving}
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-sm px-4 py-2 rounded-xl">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
                    {saved ? 'Хадгалагдлаа' : 'Мэдээлэл хадгалах'}
                  </button>
                </section>

                {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</p>}

                <section className="space-y-3">
                  <p className="text-white font-semibold">2. Хугацаа сонгож төлөх</p>
                  {invoice && selected ? (
                    <div className="bg-stone-900 border border-white/10 rounded-2xl p-6 text-center">
                      <p className="text-white font-semibold mb-1">Нийтлэл · {selected.name} · {fmtMNT(invoice.amount)}</p>
                      <p className="text-stone-400 text-sm mb-4">QPay-ээр төлөхөд цомог автоматаар нүүр хуудсанд гарна.</p>
                      <img src={`data:image/png;base64,${invoice.qrImage}`} alt="QPay QR" className="w-52 h-52 mx-auto bg-white rounded-xl p-2 mb-4" />
                      <BankLinks urls={invoice.urls} />
                      <p className="text-stone-500 text-xs mt-4 flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Төлбөр хүлээж байна…</p>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {packages.map(p => (
                        <div key={p.code} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-white font-bold text-lg">{p.name}</p>
                            <p className="text-amber-400 font-bold text-lg">{fmtMNT(p.price)}</p>
                          </div>
                          <p className="text-stone-400 text-sm">Нүүр хуудсанд {p.days} хоног{active ? ' (одоогийн хугацаан дээр нэмэгдэнэ)' : ''}</p>
                          <button disabled={!!busy} onClick={() => buy(p)}
                            className="w-full mt-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                            {busy === p.code ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {active ? 'Сунгах' : 'QPay-ээр төлөх'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <p className="text-stone-500 text-xs leading-relaxed">
                  Нийтлэлийн төлбөр буцаагдахгүй. Хуурамч, зохисгүй агуулгатай цомгийг админ анхааруулгагүйгээр нууж болно.
                  Цомгийн хугацаа дуусвал нийтлэл мөн автоматаар харагдахаа болино.
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
