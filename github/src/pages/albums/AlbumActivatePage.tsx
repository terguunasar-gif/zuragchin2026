import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Gift, Image as ImageIcon, Loader2, Lock, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { FreePackage, fmtMNT, loadFreePackages } from '../../lib/freePackages';
import BankLinks, { BankLink } from '../../components/BankLinks';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface AlbumInfo {
  id: string; name: string; title?: string; is_free: boolean;
  free_activated?: boolean; photo_limit?: number | null; package_code?: string | null; expires_at?: string | null;
}
interface Invoice { invoiceId: string; qrImage: string; urls: BankLink[]; amount: number }

/** «Үнэгүй хуваалцах» цомгийг багц сонгож идэвхжүүлэх (зохион байгуулагч) */
export default function AlbumActivatePage() {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<AlbumInfo | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [packages, setPackages] = useState<FreePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [selected, setSelected] = useState<FreePackage | null>(null);
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => { load(); return () => { if (timer.current) window.clearInterval(timer.current); }; }, [albumId]);

  async function load() {
    if (!albumId) return;
    setLoading(true);
    const [{ data: a }, { count }, pk] = await Promise.all([
      supabase.from('albums').select('id, name, title, is_free, free_activated, photo_limit, package_code, expires_at').eq('id', albumId).maybeSingle(),
      supabase.from('photo_uploads').select('id', { count: 'exact', head: true }).eq('album_id', albumId).neq('source', 'ai_booth'),
      loadFreePackages(),
    ]);
    setAlbum(a as AlbumInfo | null);
    setPhotoCount(count ?? 0);
    setPackages(pk);
    setLoading(false);
  }

  async function activateTrial() {
    setBusy('trial'); setError('');
    const { error: err } = await supabase.rpc('activate_free_trial', { p_album_id: albumId });
    setBusy(null);
    if (err) { setError(err.message); return; }
    setDone(true);
    load();
  }

  async function buy(p: FreePackage) {
    setBusy(p.code); setError(''); setSelected(p);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${QPAY_FN_URL}/package-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: ANON_KEY },
        body: JSON.stringify({ albumId, packageCode: p.code }),
      });
      const data = await res.json();
      if (!res.ok || !data.invoiceId) throw new Error(data.error || 'QPay');
      setInvoice(data);
      timer.current = window.setInterval(async () => {
        try {
          const r = await fetch(`${QPAY_FN_URL}/check-package/${data.invoiceId}`, { headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY } });
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

  const albumName = album?.title || album?.name || '';
  const fmtDate = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 bg-stone-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <Gift className="w-5 h-5 text-emerald-400" />
          <p className="text-white font-bold truncate">Цомог идэвхжүүлэх{albumName ? ` · ${albumName}` : ''}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-amber-400 animate-spin" /></div>
        ) : !album ? (
          <p className="text-stone-400 text-center py-20">Цомог олдсонгүй.</p>
        ) : !album.is_free ? (
          <p className="text-stone-400 text-center py-20">Энэ цомог «Худалдах» горимд байна. Багц шаардлагагүй.</p>
        ) : (
          <>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5">
              <p className="text-emerald-200 font-semibold">«Үнэгүй хуваалцах» цомог</p>
              <p className="text-emerald-100/70 text-sm mt-1 leading-relaxed">
                Зочид усан тэмдэггүй зургуудаа үнэгүй татна. Цомгийг нээхийн тулд зургийн тоонд тохирох багцыг нэг удаа төлнө.
              </p>
              <div className="flex flex-wrap gap-4 mt-3 text-sm">
                <span className="text-white flex items-center gap-1.5"><ImageIcon className="w-4 h-4 text-emerald-400" /> Одоо {photoCount} зураг</span>
                {album.free_activated && (
                  <span className="text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Идэвхтэй · {album.photo_limit} хүртэл зураг · {fmtDate(album.expires_at)} хүртэл
                  </span>
                )}
              </div>
            </div>

            {done && (
              <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                <div>
                  <p className="text-white font-semibold">Цомог идэвхжлээ!</p>
                  <p className="text-stone-400 text-sm">Цомгийн линкээ зочдод хуваалцаарай.</p>
                </div>
              </div>
            )}

            {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</p>}

            {invoice && selected ? (
              <div className="bg-stone-900 border border-white/10 rounded-2xl p-6 text-center">
                <p className="text-white font-semibold mb-1">«{selected.name}» багц · {fmtMNT(invoice.amount)}</p>
                <p className="text-stone-400 text-sm mb-4">QPay-ээр төлөхөд цомог автоматаар идэвхжинэ.</p>
                <img src={`data:image/png;base64,${invoice.qrImage}`} alt="QPay QR" className="w-52 h-52 mx-auto bg-white rounded-xl p-2 mb-4" />
                <BankLinks urls={invoice.urls} />
                <p className="text-stone-500 text-xs mt-4 flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Төлбөр хүлээж байна…</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {packages.map(p => {
                  const tooSmall = photoCount > p.photos;
                  const isTrial = p.price === 0;
                  const trialUsed = isTrial && !!album.package_code;
                  const current = album.free_activated && album.package_code === p.code;
                  const disabled = tooSmall || trialUsed || current || !!busy;
                  return (
                    <div key={p.code} className={`rounded-2xl border p-5 ${current ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 bg-white/5'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-white font-bold text-lg flex items-center gap-2">
                          {isTrial ? <Sparkles className="w-4 h-4 text-amber-400" /> : null}{p.name}
                        </p>
                        <p className="text-amber-400 font-bold text-lg">{isTrial ? 'Үнэгүй' : fmtMNT(p.price)}</p>
                      </div>
                      <p className="text-stone-400 text-sm">{p.photos.toLocaleString()} хүртэл зураг · {p.days} хоног</p>
                      {tooSmall && <p className="text-stone-500 text-xs mt-2 flex items-center gap-1"><Lock className="w-3 h-3" /> Цомогт {photoCount} зураг байна</p>}
                      {trialUsed && <p className="text-stone-500 text-xs mt-2">Туршилтыг ашигласан</p>}
                      <button disabled={disabled} onClick={() => (isTrial ? activateTrial() : buy(p))}
                        className="w-full mt-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-stone-950 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                        {busy === p.code ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {current ? 'Одоогийн багц' : isTrial ? 'Туршилт эхлүүлэх' : album.free_activated ? 'Энэ багц руу шилжих' : 'QPay-ээр төлөх'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-stone-500 text-xs leading-relaxed">
              Зургийн тоо багцын хязгаарт хүрвэл илүү том багц авч нэмэх боломжтой. Хугацаа дуусахад цомог хаагдах ба
              хэн ч сунгалтын төлбөр төлж дахин нээж болно. AI бүүтийн зургууд багцад тооцогдохгүй (тусдаа төлбөртэй).
            </p>
          </>
        )}
      </main>
    </div>
  );
}
