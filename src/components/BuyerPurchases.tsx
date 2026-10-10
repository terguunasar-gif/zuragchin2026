import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Download, Loader2, Printer, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { listPurchaseHistory } from '../lib/purchaseHistory';

export interface BuyerPurchaseRow {
  id: string; qpay_invoice_id: string; created_at: string; album_name: string; share_link: string;
  preview_url: string | null; filename: string | null; type: 'download' | 'print'; print_size: string;
  gross_amount: number; print_status: string;
}

/** Нэвтэрсэн худалдан авагчийн захиалгууд. Энэ төхөөрөмж дээр нэвтрэлгүй төлсөн захиалгуудыг ч өөрт нь холбоно. */
export function useBuyerPurchases(enabled: boolean) {
  const [rows, setRows] = useState<BuyerPurchaseRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ids = listPurchaseHistory().map(h => h.invoiceId).filter(Boolean);
      if (ids.length) await supabase.rpc('claim_purchases', { p_invoice_ids: ids });
      const { data } = await supabase.rpc('my_purchases');
      if (!cancelled) {
        setRows(((data ?? []) as BuyerPurchaseRow[]).map(r => ({ ...r, gross_amount: Number(r.gross_amount) })));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return { rows, loading };
}

const PRINT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Угаалгаж байна', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  printed: { label: 'Бэлэн — очиж авна уу', cls: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  delivered: { label: 'Хүлээлгэж өгсөн', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
};

export default function BuyerPurchases({ rows, loading }: { rows: BuyerPurchaseRow[]; loading: boolean }) {
  const navigate = useNavigate();

  // Захиалга (нэхэмжлэх) бүрээр бүлэглэнэ
  const orders = useMemo(() => {
    const map = new Map<string, BuyerPurchaseRow[]>();
    for (const r of rows) {
      const k = r.qpay_invoice_id || r.id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()].map(([invoiceId, items]) => ({ invoiceId, items }));
  }, [rows]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  return (
    <div className="mt-8">
      <h2 className="text-white font-semibold text-lg mb-4">Миний худалдан авалт</h2>
      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
      ) : orders.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
          <Receipt className="w-8 h-8 text-stone-600 mx-auto mb-3" />
          <p className="text-white font-medium mb-1">Худалдан авалт алга</p>
          <p className="text-stone-500 text-sm">Нэвтэрсэн үедээ худалдан авсан, эсвэл энэ төхөөрөмж дээр төлсөн захиалгууд энд харагдана.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(({ invoiceId, items }) => {
            const total = items.reduce((s, i) => s + i.gross_amount, 0);
            const first = items[0];
            return (
              <button key={invoiceId} onClick={() => navigate(`/receipt/${invoiceId}`)}
                className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/30 rounded-2xl p-4 transition-colors">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-white font-semibold truncate">{first.album_name || 'Цомог'}</p>
                    <p className="text-stone-500 text-xs">{fmtDate(first.created_at)} · №{invoiceId.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-amber-400 font-semibold text-sm">₮{Math.round(total).toLocaleString('en-US')}</span>
                    <ChevronRight className="w-4 h-4 text-stone-500" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {items.map(it => (
                    <div key={it.id} className="flex items-center gap-2 bg-stone-900/60 rounded-xl p-1.5 pr-3">
                      {it.preview_url
                        ? <img src={it.preview_url} alt="" loading="lazy" className="w-12 h-12 object-cover rounded-lg" />
                        : <div className="w-12 h-12 rounded-lg bg-stone-800" />}
                      <div>
                        <p className="text-stone-200 text-xs flex items-center gap-1">
                          {it.type === 'print'
                            ? <><Printer className="w-3 h-3 text-amber-400" /> Угаалгах {it.print_size?.replace('x', '×')}</>
                            : <><Download className="w-3 h-3 text-purple-400" /> Татах</>}
                        </p>
                        {it.type === 'print' && PRINT_STATUS[it.print_status] && (
                          <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${PRINT_STATUS[it.print_status].cls}`}>
                            {PRINT_STATUS[it.print_status].label}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
