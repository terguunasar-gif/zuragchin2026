import { useEffect, useState } from 'react';
import { TrendingUp, DollarSign, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface MonthlyFee {
  month: string;
  platform_fee: number;
  gross: number;
  count: number;
}

interface FeeTransaction {
  id: string;
  created_at: string;
  gross_amount: number;
  platform_fee_amount: number;
  buyer_name: string;
  album_name: string;
  type: string;
}

export default function AdminWalletTab() {
  const [platformBalance, setPlatformBalance] = useState(0);
  const [platformTotalEarned, setPlatformTotalEarned] = useState(0);
  const [monthlyFees, setMonthlyFees] = useState<MonthlyFee[]>([]);
  const [transactions, setTransactions] = useState<FeeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txExpanded, setTxExpanded] = useState(true);
  const [monthlyExpanded, setMonthlyExpanded] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    const [pwRes, purchasesRes] = await Promise.all([
      supabase.from('platform_wallet').select('balance,total_earned').maybeSingle(),
      supabase.from('purchases')
        .select('id,created_at,gross_amount,platform_fee_amount,buyer_name,type,albums(name)')
        .eq('payment_status', 'paid')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    setPlatformBalance(Number(pwRes.data?.balance ?? 0));
    setPlatformTotalEarned(Number(pwRes.data?.total_earned ?? 0));

    const rows = (purchasesRes.data ?? []) as unknown as Array<{
      id: string; created_at: string; gross_amount: number; platform_fee_amount: number;
      buyer_name: string; type: string; albums: { name: string } | null;
    }>;

    // Monthly breakdown
    const byMonth: Record<string, MonthlyFee> = {};
    for (const r of rows) {
      const month = r.created_at.slice(0, 7); // YYYY-MM
      if (!byMonth[month]) byMonth[month] = { month, platform_fee: 0, gross: 0, count: 0 };
      byMonth[month].platform_fee += Number(r.platform_fee_amount);
      byMonth[month].gross += Number(r.gross_amount);
      byMonth[month].count++;
    }
    setMonthlyFees(Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month)));

    setTransactions(rows.slice(0, 100).map(r => ({
      id: r.id,
      created_at: r.created_at,
      gross_amount: Number(r.gross_amount),
      platform_fee_amount: Number(r.platform_fee_amount),
      buyer_name: r.buyer_name ?? '—',
      album_name: r.albums?.name ?? '—',
      type: r.type,
    })));

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const maxFee = Math.max(...monthlyFees.map(m => m.platform_fee), 1);

  return (
    <div className="space-y-6">
      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center mb-4">
            <DollarSign className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-stone-500 text-xs mb-1">Platform Balance</p>
          <p className="text-amber-400 text-3xl font-bold">₮{platformBalance.toLocaleString()}</p>
        </div>
        <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-5">
          <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center mb-4">
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-stone-500 text-xs mb-1">Total Collected (all-time)</p>
          <p className="text-green-400 text-3xl font-bold">₮{platformTotalEarned.toLocaleString()}</p>
        </div>
      </div>

      {/* Monthly chart */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => setMonthlyExpanded(o => !o)}
          className="w-full flex items-center justify-between px-6 py-5 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold">Сарын задаргаа</p>
              <p className="text-stone-500 text-xs">{monthlyFees.length} сар</p>
            </div>
          </div>
          {monthlyExpanded ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
        </button>

        {monthlyExpanded && (
          <div className="border-t border-white/10 px-6 pb-6">
            {monthlyFees.length === 0 ? (
              <p className="text-stone-500 text-sm py-6 text-center">Өгөгдөл байхгүй байна.</p>
            ) : (
              <div className="space-y-3 pt-4">
                {monthlyFees.map(m => {
                  const barW = Math.round((m.platform_fee / maxFee) * 100);
                  const [year, mo] = m.month.split('-');
                  const label = `${year}/${mo}`;
                  return (
                    <div key={m.month} className="flex items-center gap-4">
                      <p className="text-stone-500 text-xs w-16 flex-shrink-0 text-right">{label}</p>
                      <div className="flex-1 relative h-7 bg-white/5 rounded-lg overflow-hidden">
                        <div
                          className="absolute left-0 top-0 h-full bg-amber-500/30 rounded-lg transition-all duration-500"
                          style={{ width: `${barW}%` }}
                        />
                        <div className="absolute inset-0 flex items-center px-3">
                          <span className="text-amber-400 text-xs font-semibold">₮{m.platform_fee.toLocaleString()}</span>
                        </div>
                      </div>
                      <p className="text-stone-600 text-xs w-20 flex-shrink-0 text-right">{m.count} sales</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fee transactions */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => setTxExpanded(o => !o)}
          className="w-full flex items-center justify-between px-6 py-5 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold">Шимтгэлийн гүйлгээ</p>
              <p className="text-stone-500 text-xs">Сүүлийн 100 гүйлгээ</p>
            </div>
          </div>
          {txExpanded ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
        </button>

        {txExpanded && (
          <div className="border-t border-white/10 overflow-x-auto">
            {transactions.length === 0 ? (
              <div className="px-6 py-8 text-center text-stone-500 text-sm">Гүйлгээ байхгүй байна.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-stone-950/20">
                    <th className="text-left px-6 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Огноо</th>
                    <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Цомог</th>
                    <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Худалдан авагч</th>
                    <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Борлуулалт</th>
                    <th className="text-right px-6 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Платформ шимтгэл</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-3 text-stone-400 text-xs whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-stone-300 text-xs truncate max-w-[140px]">{tx.album_name}</td>
                      <td className="px-4 py-3 text-stone-400 text-xs truncate max-w-[100px]">{tx.buyer_name}</td>
                      <td className="px-4 py-3 text-right text-white text-sm font-medium">
                        ₮{tx.gross_amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-right text-amber-400 font-semibold">
                        ₮{tx.platform_fee_amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
