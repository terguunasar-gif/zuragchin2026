import { useEffect, useRef, useState } from 'react';

const PAGE = 50;
import {
  Users, FolderOpen, DollarSign, TrendingUp, ShoppingBag,
  Camera, Image as ImageIcon, Clock, Printer, Loader2, SlidersHorizontal,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { QPAY_FN_URL } from '../../lib/offers';
import { printPurchase } from '../../lib/printPhoto';
import type { PhotoAdjust } from '../../lib/photoAdjust';
import PrintEditor from '../../components/PrintEditor';
import AutoPrintBar from '../../components/AutoPrintBar';
import { readAutoPrintAlbums } from '../../lib/autoPrintAlbums';
import { reloadIfOutdated } from '../../lib/appVersion';

interface Stats {
  totalUsers: number;
  organizers: number;
  photographers: number;
  buyers: number;
  totalAlbums: number;
  activeAlbums: number;
  revenueMonth: number;
  revenueAllTime: number;
  platformFeeAllTime: number;
}

interface RecentPurchase {
  id: string;
  gross_amount: number;
  platform_fee_amount: number;
  payment_status: string;
  created_at: string;
  type: string;
  buyer_name: string;
  buyer_phone?: string | null;
  qpay_invoice_id?: string | null;
  albums: { name: string } | null;
  print_size?: string | null;
  print_status?: 'pending' | 'printed' | 'delivered' | null;
  photo_uploads: { filename: string; preview_url?: string | null; thumb_url?: string | null } | null;
}

export default function AdminOverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentPurchases, setRecentPurchases] = useState<RecentPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  // Борлуулалтын жагсаалт: шүүлтүүр + «Илүү харах»
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [phoneQ, setPhoneQ] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  // Pending захиалгыг гараар батлах
  const [confirmFor, setConfirmFor] = useState<RecentPurchase | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [viewPhoto, setViewPhoto] = useState<RecentPurchase | null>(null);
  // Угаах захиалгыг (принтер гацсан үед дахин) хэвлэх
  const [printing, setPrinting] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecentPurchase | null>(null);
  // Авто принт асаалттай цомгийн тоо (null = ачаалж байна)
  const [apAlbums, setApAlbums] = useState<number | null>(null);
  useEffect(() => { readAutoPrintAlbums().then(s => setApAlbums(s.size)).catch(() => {}); }, []);

  async function doPrint(p: RecentPurchase, adjust?: PhotoAdjust) {
    if (reloadIfOutdated('Принт')) return;
    setPrinting(p.id);
    try {
      await printPurchase(p.id, adjust);
      if (!p.print_status || p.print_status === 'pending') {
        setRecentPurchases(prev => prev.map(x => (x.id === p.id ? { ...x, print_status: 'printed' } : x)));
      }
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : 'Хэвлэхэд алдаа гарлаа', ok: false });
    } finally {
      setPrinting(null);
    }
  }

  async function checkQpay(p: RecentPurchase) {
    if (!p.qpay_invoice_id) return;
    setConfirmBusy(true); setNote(null);
    try {
      const res = await fetch(`${QPAY_FN_URL}/check-payment/${p.qpay_invoice_id}`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } });
      const d = await res.json().catch(() => ({}));
      setNote(d.isPaid
        ? { text: 'QPay-д төлөгдсөн байсан — «paid» боллоо, угаах/татах дараалалд орлоо.', ok: true }
        : { text: 'QPay-д энэ нэхэмжлэх төлөгдөөгүй байна.', ok: false });
      if (d.isPaid) { setConfirmFor(null); await reloadPurchases(); }
    } catch (e) {
      setNote({ text: 'Шалгаж чадсангүй: ' + (e as Error).message, ok: false });
    } finally { setConfirmBusy(false); }
  }

  async function confirmManual(p: RecentPurchase, credit: boolean) {
    if (!p.qpay_invoice_id) return;
    setConfirmBusy(true); setNote(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${QPAY_FN_URL}/admin/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ invoiceId: p.qpay_invoice_id, credit }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.error || `HTTP ${res.status}`);
      const via = d.via === 'qpay' ? 'QPay-д төлөгдсөн байсан' : d.via === 'cash' ? 'Бэлнээр (хэтэвчинд нэмээгүй)' : d.via === 'already' ? 'Аль хэдийн төлөгдсөн' : 'Гараар (орлого хуваарилсан)';
      setNote({ text: `Баталгаажлаа — ${via}. Угаах/татах дараалалд орлоо.`, ok: true });
      setConfirmFor(null);
      await reloadPurchases();
    } catch (e) {
      setNote({ text: 'Баталгаажуулж чадсангүй: ' + (e as Error).message + ' (qpay function-ийг шинэчилж deploy хийсэн эсэхийг шалгана уу)', ok: false });
    } finally { setConfirmBusy(false); }
  }

  useEffect(() => { load(); }, []);

  function purchasesQuery(from: number) {
    let q = supabase.from('purchases')
      .select('id,gross_amount,platform_fee_amount,payment_status,created_at,type,buyer_name,buyer_phone,qpay_invoice_id,print_size,print_status,albums(name),photo_uploads(filename,preview_url,thumb_url)')
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('payment_status', statusFilter);
    const digits = phoneQ.replace(/\D/g, '');
    if (digits) q = q.ilike('buyer_phone', `%${digits}%`);
    return q.range(from, from + PAGE - 1);
  }

  async function reloadPurchases() {
    setMoreBusy(true);
    const { data } = await purchasesQuery(0);
    const rows = (data ?? []) as unknown as RecentPurchase[];
    setRecentPurchases(rows);
    setHasMore(rows.length === PAGE);
    setMoreBusy(false);
  }

  async function loadMore() {
    setMoreBusy(true);
    const { data } = await purchasesQuery(recentPurchases.length);
    const rows = (data ?? []) as unknown as RecentPurchase[];
    setRecentPurchases(prev => [...prev, ...rows.filter(r => !prev.some(x => x.id === r.id))]);
    setHasMore(rows.length === PAGE);
    setMoreBusy(false);
  }

  // Шүүлтүүр солигдоход жагсаалтыг эхнээс нь
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const t = setTimeout(() => { void reloadPurchases(); }, 300);
    return () => clearTimeout(t);
  }, [statusFilter, phoneQ]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [usersRes, albumsRes, allTimeRes, monthRes, pwRes, purchasesRes] = await Promise.all([
      supabase.from('users').select('role'),
      supabase.from('albums').select('status'),
      supabase.from('purchases').select('gross_amount,platform_fee_amount').eq('payment_status', 'paid'),
      supabase.from('purchases').select('gross_amount').eq('payment_status', 'paid').gte('created_at', monthStart.toISOString()),
      supabase.from('platform_wallet').select('total_earned').maybeSingle(),
      purchasesQuery(0),
    ]);

    const users = usersRes.data ?? [];
    const albums = albumsRes.data ?? [];
    const allPurchases = allTimeRes.data ?? [];
    const monthPurchases = monthRes.data ?? [];

    setStats({
      totalUsers: users.length,
      organizers: users.filter(u => (u.role as unknown as string[]).includes('organizer')).length,
      photographers: users.filter(u => (u.role as unknown as string[]).includes('photographer')).length,
      buyers: users.filter(u => (u.role as unknown as string[]).includes('buyer')).length,
      totalAlbums: albums.length,
      activeAlbums: albums.filter(a => a.status === 'active').length,
      revenueMonth: monthPurchases.reduce((s, p) => s + Number(p.gross_amount), 0),
      revenueAllTime: allPurchases.reduce((s, p) => s + Number(p.gross_amount), 0),
      platformFeeAllTime: Number(pwRes.data?.total_earned ?? 0),
    });

    const first = (purchasesRes.data ?? []) as unknown as RecentPurchase[];
    setRecentPurchases(first);
    setHasMore(first.length === PAGE);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="space-y-6">
      {/* ── Main stat grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users className="w-5 h-5" />} iconBg="bg-blue-500/10" iconColor="text-blue-400"
          label="Нийт хэрэглэгч" value={s.totalUsers}
          sub={`${s.organizers} org · ${s.photographers} photo · ${s.buyers} buyer`} />
        <StatCard icon={<FolderOpen className="w-5 h-5" />} iconBg="bg-amber-500/10" iconColor="text-amber-400"
          label="Нийт цомог" value={s.totalAlbums}
          sub={`${s.activeAlbums} идэвхтэй`} />
        <StatCard icon={<DollarSign className="w-5 h-5" />} iconBg="bg-green-500/10" iconColor="text-green-400"
          label="Энэ сарын орлого" value={`₮${s.revenueMonth.toLocaleString()}`}
          sub="paid purchases" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} iconBg="bg-green-500/10" iconColor="text-green-400"
          label="Нийт орлого" value={`₮${s.revenueAllTime.toLocaleString()}`}
          sub="all-time" highlight />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center mb-4">
            <TrendingUp className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-stone-500 text-xs mb-1">Платформ шимтгэл (нийт)</p>
          <p className="text-amber-400 text-2xl font-bold">₮{s.platformFeeAllTime.toLocaleString()}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4">
            <Camera className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-stone-500 text-xs mb-1">Идэвхтэй цомог</p>
          <p className="text-white text-2xl font-bold">{s.activeAlbums}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center mb-4">
            <ShoppingBag className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-stone-500 text-xs mb-1">Нийт борлуулалт</p>
          <p className="text-white text-2xl font-bold">{recentPurchases.length > 0 ? '20+' : '0'}</p>
        </div>
      </div>

      {/* ── Автомат принт (хэвлэдэг компьютер дээр) ── */}
      <AutoPrintBar
        storageKey="zm_autoprint_admin"
        fetchPending={async () => {
          const albums = await readAutoPrintAlbums();
          setApAlbums(albums.size);
          if (!albums.size) return [];
          const { data, error } = await supabase.from('purchases')
            .select('id,buyer_name,buyer_phone,print_size,created_at,photo_uploads(filename)')
            .eq('type', 'print').eq('payment_status', 'paid').eq('print_status', 'pending')
            .in('album_id', [...albums])
            .order('created_at', { ascending: false }).limit(100);
          if (error) throw error;
          return ((data ?? []) as unknown as { id: string; buyer_name: string | null; buyer_phone: string | null; print_size: string | null; created_at: string; photo_uploads: { filename: string } | null }[])
            .map(p => ({ id: p.id, createdAt: p.created_at, label: `${p.photo_uploads?.filename ?? 'зураг'} · ${(p.print_size ?? '').replace('x', '×')} · ${p.buyer_name || p.buyer_phone || ''}` }));
        }}
        onPrinted={id => setRecentPurchases(prev => prev.map(x => (x.id === id ? { ...x, print_status: 'printed' } : x)))}
        note={apAlbums === null ? null : apAlbums === 0
          ? <span className="text-amber-300">Авто принт асаалттай цомог алга. «Цомог» табаас хэвлэх цомгийнхоо «Авто принт» товчийг асаана уу.</span>
          : <span className="text-emerald-300">Авто принт асаалттай цомог: {apAlbums} («Цомог» табаас өөрчилнө)</span>}
      />

      {/* ── Recent purchases ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/10 flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 bg-green-500/10 rounded-xl flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-white font-semibold">Сүүлийн борлуулалтууд</p>
            <p className="text-stone-500 text-xs">{recentPurchases.length} гүйлгээ харагдаж байна</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {(['all', 'paid', 'pending'] as const).map(v => (
              <button key={v} onClick={() => setStatusFilter(v)}
                className={`text-xs px-3 py-1.5 rounded-lg border ${statusFilter === v ? 'bg-amber-500 text-stone-950 border-amber-500 font-semibold' : 'border-white/10 text-stone-300 hover:bg-white/5'}`}>
                {v === 'all' ? 'Бүгд' : v === 'paid' ? 'Төлсөн' : 'Хүлээгдэж буй'}
              </button>
            ))}
            <input value={phoneQ} onChange={e => setPhoneQ(e.target.value)} inputMode="numeric" placeholder="Утсаар хайх"
              className="w-36 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/50" />
          </div>
        </div>

        {recentPurchases.length === 0 ? (
          <div className="px-6 py-12 text-center text-stone-500 text-sm">Борлуулалт байхгүй байна.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-stone-950/20">
                  <th className="text-left px-6 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Огноо</th>
                  <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Худалдан авагч</th>
                  <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Цомог</th>
                  <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Зураг</th>
                  <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Дүн</th>
                  <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Шимтгэл</th>
                  <th className="text-right px-6 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Төлөв</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentPurchases.map(p => (
                  <tr key={p.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-3 text-stone-400 text-xs whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString('mn-MN', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                      <span className="block text-stone-500">
                        {new Date(p.created_at).toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-300 text-xs">
                      {p.buyer_name || '—'}
                      {p.buyer_phone && <span className="block text-stone-500">{p.buyer_phone}</span>}
                    </td>
                    <td className="px-4 py-3 text-stone-300 text-xs truncate max-w-[120px]">
                      {(p.albums as { name: string } | null)?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-stone-400 text-xs">
                      {p.photo_uploads?.preview_url || p.photo_uploads?.thumb_url ? (
                        <button onClick={() => setViewPhoto(p)} title="Зургийг харах"
                          className="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 hover:underline">
                          <img src={p.photo_uploads.thumb_url || p.photo_uploads.preview_url || ''} alt="" loading="lazy"
                            className="w-8 h-8 rounded object-cover bg-white/5 flex-shrink-0" />
                          <span className="truncate max-w-[80px]">{p.photo_uploads.filename ?? '—'}</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-stone-600" />
                          <span className="truncate max-w-[80px]">{p.photo_uploads?.filename ?? '—'}</span>
                        </div>
                      )}
                      <span className="block text-stone-500 mt-0.5">{p.type === 'print' ? `Угаах${p.print_size ? ` · ${p.print_size}` : ''}` : 'Татах'}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-semibold">₮{Number(p.gross_amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-amber-400 text-xs">₮{Number(p.platform_fee_amount).toLocaleString()}</td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <StatusBadge status={p.payment_status} />
                      {p.qpay_invoice_id && p.payment_status === 'pending' && (
                        <button onClick={() => { setNote(null); setConfirmFor(p); }}
                          className="block ml-auto mt-1 text-xs text-amber-400 hover:underline">Батлах →</button>
                      )}
                      {p.qpay_invoice_id && p.payment_status === 'paid' && (
                        <span className="block mt-1 text-xs">
                          <a href={`/receipt/${p.qpay_invoice_id}`} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">Баримт</a>
                          <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/receipt/${p.qpay_invoice_id}`)}
                            className="ml-1 text-stone-400 hover:text-white">· Хуулах</button>
                        </span>
                      )}
                      {p.type === 'print' && p.payment_status === 'paid' && (
                        <span className="flex items-center justify-end gap-1.5 mt-1.5">
                          <button onClick={() => { if (!reloadIfOutdated('Засвар')) setEditing(p); }}
                            title="Хэвлэхийн өмнө гэрэл, өнгө, тайралтыг тохируулах"
                            className="flex items-center gap-1 border border-white/15 hover:border-amber-500/50 text-stone-300 text-[11px] px-2 py-1 rounded-lg">
                            <SlidersHorizontal className="w-3 h-3" /> Засах
                          </button>
                          <button onClick={() => doPrint(p)} disabled={printing === p.id}
                            title="Принтер гацсан, муу гарсан үед дахин хэвлэх. SMS дахин явахгүй."
                            className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-[11px] font-bold px-2 py-1 rounded-lg">
                            {printing === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />}
                            {!p.print_status || p.print_status === 'pending' ? 'Принт' : 'Дахин принт'}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <div className="px-6 py-4 border-t border-white/5 text-center">
                <button onClick={loadMore} disabled={moreBusy}
                  className="text-sm px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white disabled:opacity-50">
                  {moreBusy ? 'Ачаалж байна…' : `Илүү харах (+${PAGE})`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {viewPhoto && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setViewPhoto(null)}>
          <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-3 text-sm">
              <div className="text-white">
                <b>{viewPhoto.photo_uploads?.filename}</b>
                <span className="text-stone-400"> · {viewPhoto.type === 'print' ? `Угаах${viewPhoto.print_size ? ` ${viewPhoto.print_size}` : ''}` : 'Татах'} · ₮{Number(viewPhoto.gross_amount).toLocaleString()} · {viewPhoto.buyer_name || '—'} {viewPhoto.buyer_phone || ''}</span>
              </div>
              <button onClick={() => setViewPhoto(null)} className="text-stone-300 hover:text-white px-3 py-1 rounded-lg bg-white/10">Хаах ✕</button>
            </div>
            <img src={viewPhoto.photo_uploads?.preview_url || viewPhoto.photo_uploads?.thumb_url || ''} alt={viewPhoto.photo_uploads?.filename ?? ''}
              className="w-full max-h-[80vh] object-contain rounded-xl bg-stone-900" />
            {viewPhoto.payment_status === 'pending' && viewPhoto.qpay_invoice_id && (
              <div className="mt-3 text-right">
                <button onClick={() => { const p = viewPhoto; setViewPhoto(null); setNote(null); setConfirmFor(p); }}
                  className="text-sm px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold">Батлах →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <PrintEditor
          purchaseId={editing.id}
          title={`${(editing.print_size ?? '').replace('x', '×')} · ${editing.buyer_name || ''}`}
          onClose={() => setEditing(null)}
          onPrint={adjust => { const p = editing; setEditing(null); void doPrint(p, adjust); }}
        />
      )}

      {note && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-lg text-sm px-4 py-3 rounded-xl shadow-xl ${note.ok ? 'bg-emerald-500 text-stone-950' : 'bg-red-500 text-white'}`}
          onClick={() => setNote(null)}>
          {note.text}
        </div>
      )}

      {confirmFor && (() => {
        const same = recentPurchases.filter(x => x.qpay_invoice_id === confirmFor.qpay_invoice_id);
        const total = same.reduce((sum, x) => sum + Number(x.gross_amount), 0);
        return (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => !confirmBusy && setConfirmFor(null)}>
            <div className="bg-stone-900 border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <p className="text-white font-semibold text-lg">Захиалга батлах</p>
              <p className="text-stone-400 text-sm mt-1">
                {confirmFor.buyer_name || '—'} {confirmFor.buyer_phone ? `· ${confirmFor.buyer_phone}` : ''}<br />
                Нэг нэхэмжлэхэд {same.length} зураг · нийт ₮{total.toLocaleString()} (бүгд хамт батлагдана)
              </p>
              <div className="mt-5 space-y-2">
                <button disabled={confirmBusy} onClick={() => checkQpay(confirmFor)}
                  className="w-full text-left px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50">
                  <span className="text-white text-sm font-semibold">1. QPay-аас шалгах</span>
                  <span className="block text-stone-400 text-xs">Төлсөн бол ердийнхөөр баталгаажна. Эхлээд үүнийг дарна уу.</span>
                </button>
                <button disabled={confirmBusy} onClick={() => { if (confirm('Мөнгө платформын QPay/данс руу орсон гэдгийг шалгасан уу? Зурагчин, эзэнд орлого хуваарилагдана.')) void confirmManual(confirmFor, true); }}
                  className="w-full text-left px-4 py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 disabled:opacity-50">
                  <span className="text-amber-300 text-sm font-semibold">2. Мөнгө орсон (QPay / данс) — батлах</span>
                  <span className="block text-stone-400 text-xs">Төлөв «paid» болж, орлого зурагчин/эзэнд ердийнхөөр хуваарилагдана.</span>
                </button>
                <button disabled={confirmBusy} onClick={() => { if (confirm('Бэлнээр авсан гэж батлах уу? Хэтэвчинд мөнгө нэмэгдэхгүй.')) void confirmManual(confirmFor, false); }}
                  className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50">
                  <span className="text-white text-sm font-semibold">3. Бэлнээр авсан — батлах</span>
                  <span className="block text-stone-400 text-xs">Зөвхөн «paid» болгоно, хэтэвчинд мөнгө нэмэхгүй (мөнгө гарт байгаа).</span>
                </button>
              </div>
              <button disabled={confirmBusy} onClick={() => setConfirmFor(null)} className="mt-4 w-full text-sm text-stone-400 hover:text-white">
                {confirmBusy ? 'Түр хүлээнэ үү…' : 'Болих'}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function StatCard({ icon, iconBg, iconColor, label, value, sub, highlight = false }: {
  icon: React.ReactNode; iconBg: string; iconColor: string;
  label: string; value: string | number; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 border ${highlight ? 'bg-green-500/5 border-green-500/20' : 'bg-white/5 border-white/10'}`}>
      <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center mb-4`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-stone-500 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-green-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-stone-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    paid:    'text-green-400 bg-green-500/10 border-green-500/20',
    pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    failed:  'text-red-400 bg-red-500/10 border-red-500/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium border px-2 py-0.5 rounded-full ${cfg[status] ?? cfg.pending}`}>
      {status === 'paid' ? <Clock className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {status}
    </span>
  );
}
