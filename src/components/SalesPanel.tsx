import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Phone, Printer, Receipt, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Зурагчин (өөрийн зураг) болон зохион байгуулагч (өөрийн цомог)-ийн борлуулалт,
// угаалгах захиалгын жагсаалт. Мэдээллийг my_sales() RPC-ээс авна.

export interface SaleRow {
  id: string;
  created_at: string;
  qpay_invoice_id: string;
  album_id: string;
  album_name: string;
  photo_id: string;
  preview_url: string | null;
  filename: string | null;
  type: 'download' | 'print';
  print_size: string;
  gross_amount: number;
  photographer_amount: number;
  owner_amount: number;
  is_my_photo: boolean;
  is_my_album: boolean;
  buyer_name: string;
  buyer_phone: string;
  print_status: 'pending' | 'printed' | 'delivered';
  photographer_id: string;
  photographer_name: string;
}

export interface SalesSummary {
  soldCount: number;
  myEarnings: number;
  openPrints: number;
}

const STATUS_LABEL: Record<SaleRow['print_status'], string> = {
  pending: 'Хүлээгдэж буй',
  printed: 'Угаасан',
  delivered: 'Хүлээлгэж өгсөн',
};

const STATUS_STYLE: Record<SaleRow['print_status'], string> = {
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  printed: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  delivered: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

/** Хэрэглэгчийн хувь: өөрийн зураг бол зурагчны хувь, өөрийн цомог бол эзний хувь (хоёулаа байж болно). */
export function myShare(r: SaleRow): number {
  return (r.is_my_photo ? Number(r.photographer_amount) : 0) + (r.is_my_album ? Number(r.owner_amount) : 0);
}

export function summarize(rows: SaleRow[]): SalesSummary {
  return {
    soldCount: rows.length,
    myEarnings: Math.round(rows.reduce((s, r) => s + myShare(r), 0)),
    openPrints: rows.filter(r => r.type === 'print' && r.print_status !== 'delivered').length,
  };
}

export function useMySales() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function reload() {
    setLoading(true);
    const { data, error: err } = await supabase.rpc('my_sales');
    if (err) setError(err.message);
    else { setError(''); setRows((data ?? []) as SaleRow[]); }
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);
  return { rows, setRows, loading, error, reload };
}

function fmt(n: number) {
  return '₮' + Math.round(n).toLocaleString('en-US');
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SalesPanel({
  mode, sales,
}: {
  mode: 'photographer' | 'organizer';
  sales: ReturnType<typeof useMySales>;
}) {
  const { rows, setRows, loading, error, reload } = sales;
  const [filter, setFilter] = useState<'all' | 'print' | 'download'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Зурагчин: зөвхөн өөрийн зураг. Зохион байгуулагч: өөрийн цомгийн бүх борлуулалт.
  const scoped = useMemo(
    () => rows.filter(r => (mode === 'photographer' ? r.is_my_photo : r.is_my_album)),
    [rows, mode],
  );
  const visible = scoped.filter(r => filter === 'all' || r.type === filter);
  const sum = summarize(scoped);

  async function changeStatus(r: SaleRow, status: SaleRow['print_status']) {
    if (status === r.print_status) return;
    setBusyId(r.id);
    const { error: err } = await supabase.rpc('set_print_status', { p_purchase_id: r.id, p_status: status });
    setBusyId(null);
    if (err) { window.alert('Төлөв солиход алдаа гарлаа: ' + err.message); return; }
    setRows(prev => prev.map(x => (x.id === r.id ? { ...x, print_status: status } : x)));
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-white font-semibold text-lg">
          {mode === 'photographer' ? 'Борлуулалт ба угаалгах захиалга' : 'Цомгуудын борлуулалт'}
        </h2>
        <div className="flex items-center gap-2">
          {(['all', 'print', 'download'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filter === f ? 'bg-amber-500 text-stone-950 border-amber-500' : 'text-stone-400 border-white/10 hover:text-white'}`}>
              {f === 'all' ? 'Бүгд' : f === 'print' ? 'Угаалгах' : 'Татах'}
            </button>
          ))}
          <button onClick={reload} title="Шинэчлэх"
            className="p-2 rounded-lg border border-white/10 text-stone-400 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-stone-500 text-xs">Зарагдсан</p>
          <p className="text-white text-xl font-bold mt-1">{sum.soldCount}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-stone-500 text-xs">{mode === 'photographer' ? 'Миний орлого' : 'Миний хувь'}</p>
          <p className="text-emerald-400 text-xl font-bold mt-1">{fmt(sum.myEarnings)}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-stone-500 text-xs">Хүлээлгэж өгөөгүй угаалгах</p>
          <p className="text-amber-400 text-xl font-bold mt-1">{sum.openPrints}</p>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">Ачааллахад алдаа гарлаа: {error}</p>}

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
      ) : visible.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl py-12 text-center">
          <Receipt className="w-8 h-8 text-stone-600 mx-auto mb-2" />
          <p className="text-stone-400 text-sm">Одоогоор борлуулалт алга.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(r => (
            <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {r.preview_url
                  ? <img src={r.preview_url} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                  : <div className="w-14 h-14 rounded-lg bg-stone-800 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium flex items-center gap-1.5">
                    {r.type === 'print'
                      ? <><Printer className="w-3.5 h-3.5 text-amber-400" /> Угаалгах {r.print_size.replace('x', '×')}</>
                      : <><Download className="w-3.5 h-3.5 text-purple-400" /> Татах</>}
                    <span className="text-stone-500 font-normal">· {fmt(Number(r.gross_amount))}</span>
                  </p>
                  <p className="text-stone-500 text-xs truncate">
                    {r.album_name} · {fmtDate(r.created_at)} · №{(r.qpay_invoice_id || '').slice(0, 8).toUpperCase()}
                  </p>
                  {mode === 'organizer' && r.photographer_name && (
                    <p className="text-stone-500 text-xs truncate">Зурагчин: {r.photographer_name}</p>
                  )}
                  {r.type === 'print' && (
                    <p className="text-stone-300 text-xs flex items-center gap-1 mt-0.5">
                      {r.buyer_name || 'Худалдан авагч'}
                      {r.buyer_phone && (
                        <a href={`tel:${r.buyer_phone}`} className="inline-flex items-center gap-1 text-sky-400 hover:underline ml-1">
                          <Phone className="w-3 h-3" />{r.buyer_phone}
                        </a>
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 sm:justify-end flex-shrink-0">
                <div className="text-right">
                  <p className="text-stone-500 text-[11px]">{mode === 'photographer' ? 'Миний орлого' : 'Миний хувь'}</p>
                  <p className="text-emerald-400 text-sm font-semibold">{fmt(myShare(r))}</p>
                </div>
                {r.type === 'print' && (
                  <select
                    value={r.print_status}
                    disabled={busyId === r.id}
                    onChange={e => changeStatus(r, e.target.value as SaleRow['print_status'])}
                    className={`text-xs font-medium rounded-lg border px-2 py-1.5 bg-stone-900 outline-none ${STATUS_STYLE[r.print_status]}`}
                  >
                    {(Object.keys(STATUS_LABEL) as SaleRow['print_status'][]).map(s => (
                      <option key={s} value={s} className="bg-stone-900 text-white">{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
