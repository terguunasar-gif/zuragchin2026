import { useEffect, useMemo, useState } from 'react';
import { Loader2, X, Download, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/** Админ: нэг хэрэглэгчийн борлуулалт, шимтгэл, түүнд очих мөнгөний дэлгэрэнгүй */
interface Row {
  id: string;
  created_at: string;
  album_id: string;
  photographer_id: string;
  type: 'download' | 'print';
  print_size: string | null;
  gross_amount: number;
  qpay_fee_amount: number;
  platform_fee_amount: number;
  owner_amount: number;
  photographer_pool_amount: number;
  buyer_name: string | null;
}

const COLS = 'id, created_at, album_id, photographer_id, type, print_size, gross_amount, qpay_fee_amount, platform_fee_amount, owner_amount, photographer_pool_amount, buyer_name';
const n = (v: unknown) => Number(v) || 0;
const fmt = (v: number) => `₮${Math.round(v).toLocaleString()}`;

export default function AdminUserEarningsModal({ user, onClose }: {
  user: { id: string; name: string; email: string };
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [albumNames, setAlbumNames] = useState<Record<string, string>>({});
  const [wallet, setWallet] = useState<{ pending_balance: number; settled_balance: number; total_earned: number } | null>(null);
  const [payouts, setPayouts] = useState<{ approved: number; pending: number }>({ approved: 0, pending: 0 });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: ownAlbums } = await supabase.from('albums').select('id, name').eq('owner_id', user.id);
      const ownIds = (ownAlbums ?? []).map(a => a.id as string);
      const [asPhotographer, asOwner, w, p] = await Promise.all([
        supabase.from('purchases').select(COLS).eq('payment_status', 'paid').eq('photographer_id', user.id)
          .order('created_at', { ascending: false }).limit(2000),
        ownIds.length
          ? supabase.from('purchases').select(COLS).eq('payment_status', 'paid').in('album_id', ownIds)
              .order('created_at', { ascending: false }).limit(2000)
          : Promise.resolve({ data: [] as Row[] }),
        supabase.from('wallets').select('pending_balance, settled_balance, total_earned').eq('user_id', user.id).maybeSingle(),
        supabase.from('payout_requests').select('amount, status').eq('user_id', user.id),
      ]);
      const map = new Map<string, Row>();
      for (const r of [...(asPhotographer.data ?? []), ...(asOwner.data ?? [])] as Row[]) map.set(r.id, r);
      const all = [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const albumIds = [...new Set(all.map(r => r.album_id))];
      const names: Record<string, string> = {};
      for (const a of ownAlbums ?? []) names[a.id as string] = a.name as string;
      const missing = albumIds.filter(id => !names[id]);
      if (missing.length) {
        const { data: more } = await supabase.from('albums').select('id, name').in('id', missing);
        for (const a of more ?? []) names[a.id as string] = a.name as string;
      }
      setRows(all);
      setOwned(new Set(ownIds));
      setAlbumNames(names);
      setWallet(w.data ? { pending_balance: n(w.data.pending_balance), settled_balance: n(w.data.settled_balance), total_earned: n(w.data.total_earned) } : null);
      let approved = 0, pending = 0;
      for (const x of p.data ?? []) {
        if (x.status === 'approved') approved += n(x.amount);
        else if (x.status === 'pending') pending += n(x.amount);
      }
      setPayouts({ approved, pending });
      setLoading(false);
    })();
  }, [user.id]);

  /** Мөр бүрээс энэ хэрэглэгчид очих хэсэг: зурагчны хувь + цомгийн эзний шимтгэл */
  const share = (r: Row) => ({
    photographer: r.photographer_id === user.id ? n(r.photographer_pool_amount) : 0,
    owner: owned.has(r.album_id) ? n(r.owner_amount) : 0,
  });

  const totals = useMemo(() => {
    const t = { count: 0, gross: 0, qpay: 0, platform: 0, owner: 0, photographer: 0, toUser: 0 };
    for (const r of rows) {
      const s = share(r);
      t.count++; t.gross += n(r.gross_amount); t.qpay += n(r.qpay_fee_amount); t.platform += n(r.platform_fee_amount);
      t.owner += s.owner; t.photographer += s.photographer; t.toUser += s.owner + s.photographer;
    }
    return t;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, owned]);

  const byAlbum = useMemo(() => {
    const m = new Map<string, { count: number; gross: number; qpay: number; platform: number; owner: number; photographer: number; ownerOfAlbum: number }>();
    for (const r of rows) {
      const s = share(r);
      const a = m.get(r.album_id) ?? { count: 0, gross: 0, qpay: 0, platform: 0, owner: 0, photographer: 0, ownerOfAlbum: 0 };
      a.count++; a.gross += n(r.gross_amount); a.qpay += n(r.qpay_fee_amount); a.platform += n(r.platform_fee_amount);
      a.owner += s.owner; a.photographer += s.photographer;
      m.set(r.album_id, a);
    }
    return [...m.entries()].sort((x, y) => y[1].gross - x[1].gross);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, owned]);

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-5xl shadow-2xl my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <p className="text-white font-semibold">Орлогын дэлгэрэнгүй — {user.name}</p>
            <p className="text-stone-500 text-xs">{user.email} · зөвхөн төлөгдсөн борлуулалт</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Нийт задаргаа */}
            <div>
              <p className="text-stone-400 text-xs uppercase tracking-wider mb-2">Борлуулалтын задаргаа ({totals.count} ширхэг)</p>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <Stat label="Нийт борлуулалт" value={fmt(totals.gross)} />
                <Stat label="QPay шимтгэл" value={`− ${fmt(totals.qpay)}`} tone="muted" />
                <Stat label="Платформын шимтгэл" value={`− ${fmt(totals.platform)}`} tone="amber" />
                <Stat label="Зурагчны хувь" value={fmt(totals.photographer)} tone="blue" />
                <Stat label="Цомгийн эзний шимтгэл" value={fmt(totals.owner)} tone="orange" />
                <Stat label="Энэ хэрэглэгчид" value={fmt(totals.toUser)} tone="green" />
              </div>
              <p className="text-stone-500 text-[11px] mt-2">
                «Нийт борлуулалт»-д энэ хүний зурагласан зургууд болон түүний эзэмшдэг цомогт бусад зурагчны зарсан зургууд орно.
                Бусдын зарсан зургийн зурагчны хувь өөр хүнд очдог тул «Энэ хэрэглэгчид» дүнд ороогүй.
              </p>
            </div>

            {/* Хэтэвч */}
            <div>
              <p className="text-stone-400 text-xs uppercase tracking-wider mb-2">Хэтэвч ба мөнгө татах</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <Stat label="Нийт олсон" value={fmt(wallet?.total_earned ?? 0)} tone="green" />
                <Stat label="Хүлээгдэж буй" value={fmt(wallet?.pending_balance ?? 0)} />
                <Stat label="Татах боломжтой" value={fmt(wallet?.settled_balance ?? 0)} tone="green" />
                <Stat label="Шилжүүлсэн" value={fmt(payouts.approved)} tone="blue" />
                <Stat label="Татах хүсэлт (хүлээгдэж буй)" value={fmt(payouts.pending)} tone="amber" />
              </div>
            </div>

            {/* Цомгоор */}
            {byAlbum.length > 0 && (
              <div>
                <p className="text-stone-400 text-xs uppercase tracking-wider mb-2">Цомгоор</p>
                <div className="overflow-x-auto border border-white/10 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 text-stone-500 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">Цомог</th>
                        <th className="text-right px-3 py-2">Тоо</th>
                        <th className="text-right px-3 py-2">Борлуулалт</th>
                        <th className="text-right px-3 py-2">QPay</th>
                        <th className="text-right px-3 py-2">Платформ</th>
                        <th className="text-right px-3 py-2">Зурагчны хувь</th>
                        <th className="text-right px-3 py-2">Эзний шимтгэл</th>
                        <th className="text-right px-3 py-2">Энэ хэрэглэгчид</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byAlbum.map(([id, a]) => (
                        <tr key={id} className="border-t border-white/5">
                          <td className="px-3 py-2 text-white">
                            {albumNames[id] ?? 'Цомог'}
                            {owned.has(id) && <span className="ml-2 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">эзэн</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-stone-300">{a.count}</td>
                          <td className="px-3 py-2 text-right text-white">{fmt(a.gross)}</td>
                          <td className="px-3 py-2 text-right text-stone-500">{fmt(a.qpay)}</td>
                          <td className="px-3 py-2 text-right text-amber-300">{fmt(a.platform)}</td>
                          <td className="px-3 py-2 text-right text-blue-300">{fmt(a.photographer)}</td>
                          <td className="px-3 py-2 text-right text-orange-300">{fmt(a.owner)}</td>
                          <td className="px-3 py-2 text-right text-green-400 font-semibold">{fmt(a.photographer + a.owner)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Борлуулалт бүр */}
            <div>
              <p className="text-stone-400 text-xs uppercase tracking-wider mb-2">Борлуулалт бүрээр</p>
              {rows.length === 0 ? (
                <p className="text-stone-500 text-sm">Төлөгдсөн борлуулалт алга.</p>
              ) : (
                <div className="overflow-x-auto border border-white/10 rounded-xl max-h-[420px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-stone-900 sticky top-0 text-stone-500">
                      <tr>
                        <th className="text-left px-3 py-2">Огноо</th>
                        <th className="text-left px-3 py-2">Цомог</th>
                        <th className="text-left px-3 py-2">Төрөл</th>
                        <th className="text-left px-3 py-2">Худалдан авагч</th>
                        <th className="text-right px-3 py-2">Үнэ</th>
                        <th className="text-right px-3 py-2">QPay</th>
                        <th className="text-right px-3 py-2">Платформ</th>
                        <th className="text-right px-3 py-2">Зурагчин</th>
                        <th className="text-right px-3 py-2">Эзэн</th>
                        <th className="text-right px-3 py-2">Энэ хэрэглэгчид</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => {
                        const s = share(r);
                        return (
                          <tr key={r.id} className="border-t border-white/5">
                            <td className="px-3 py-2 text-stone-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString('mn-MN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="px-3 py-2 text-stone-200 max-w-[160px] truncate">{albumNames[r.album_id] ?? '—'}</td>
                            <td className="px-3 py-2 text-stone-300 whitespace-nowrap">
                              {r.type === 'download'
                                ? <span className="inline-flex items-center gap-1"><Download className="w-3 h-3" />Татах</span>
                                : <span className="inline-flex items-center gap-1"><Printer className="w-3 h-3" />{r.print_size || 'Угаалгах'}</span>}
                            </td>
                            <td className="px-3 py-2 text-stone-400 max-w-[120px] truncate">{r.buyer_name || '—'}</td>
                            <td className="px-3 py-2 text-right text-white">{fmt(n(r.gross_amount))}</td>
                            <td className="px-3 py-2 text-right text-stone-500">{fmt(n(r.qpay_fee_amount))}</td>
                            <td className="px-3 py-2 text-right text-amber-300">{fmt(n(r.platform_fee_amount))}</td>
                            <td className={`px-3 py-2 text-right ${r.photographer_id === user.id ? 'text-blue-300' : 'text-stone-600'}`}>{fmt(n(r.photographer_pool_amount))}</td>
                            <td className={`px-3 py-2 text-right ${owned.has(r.album_id) ? 'text-orange-300' : 'text-stone-600'}`}>{fmt(n(r.owner_amount))}</td>
                            <td className="px-3 py-2 text-right text-green-400 font-semibold">{fmt(s.photographer + s.owner)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' | 'blue' | 'orange' | 'muted' }) {
  const color = { green: 'text-green-400', amber: 'text-amber-300', blue: 'text-blue-300', orange: 'text-orange-300', muted: 'text-stone-400' }[tone ?? 'muted'] ?? 'text-white';
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
      <p className="text-stone-500 text-[11px] leading-tight">{label}</p>
      <p className={`font-semibold mt-1 ${tone ? color : 'text-white'}`}>{value}</p>
    </div>
  );
}
