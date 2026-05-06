import { useEffect, useState } from 'react';
import {
  Users, FolderOpen, DollarSign, TrendingUp, ShoppingBag,
  Camera, Image as ImageIcon, Clock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
  albums: { name: string } | null;
  photo_uploads: { filename: string } | null;
}

export default function AdminOverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentPurchases, setRecentPurchases] = useState<RecentPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

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
      supabase.from('purchases')
        .select('id,gross_amount,platform_fee_amount,payment_status,created_at,type,buyer_name,albums(name),photo_uploads(filename)')
        .order('created_at', { ascending: false })
        .limit(20),
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

    setRecentPurchases((purchasesRes.data ?? []) as unknown as RecentPurchase[]);
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

      {/* ── Recent purchases ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 bg-green-500/10 rounded-xl flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-white font-semibold">Сүүлийн борлуулалтууд</p>
            <p className="text-stone-500 text-xs">Сүүлийн 20 гүйлгээ</p>
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
                    </td>
                    <td className="px-4 py-3 text-stone-300 text-xs">{p.buyer_name || '—'}</td>
                    <td className="px-4 py-3 text-stone-300 text-xs truncate max-w-[120px]">
                      {(p.albums as { name: string } | null)?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-stone-400 text-xs">
                      <div className="flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-stone-600" />
                        <span className="truncate max-w-[80px]">
                          {(p.photo_uploads as { filename: string } | null)?.filename ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-semibold">₮{Number(p.gross_amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-amber-400 text-xs">₮{Number(p.platform_fee_amount).toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">
                      <StatusBadge status={p.payment_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
