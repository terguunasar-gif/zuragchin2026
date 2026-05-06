import { useEffect, useState } from 'react';
import {
  Shield, TrendingUp, DollarSign, Calendar, Loader2,
  AlertCircle, ChevronDown, ChevronUp, CheckCircle2,
  Clock, X, ArrowUpCircle, Building2, CreditCard,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface PlatformWallet {
  balance: number;
  total_earned: number;
  updated_at: string;
}

interface PayoutRequest {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  bank_info: { bank_name: string; account_number: string; account_holder: string };
  admin_note: string;
  requested_at: string;
  processed_at: string | null;
  users: { name: string; email: string } | null;
}

interface RevenueRow {
  date: string;
  platform_fee: number;
  gross: number;
  count: number;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: 'Хүлээгдэж буй', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: <Clock className="w-3 h-3" /> },
  approved: { label: 'Зөвшөөрсөн',    color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: <CheckCircle2 className="w-3 h-3" /> },
  paid:     { label: 'Олгосон',        color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: 'Татгалзсан',     color: 'text-red-400 bg-red-500/10 border-red-500/20',       icon: <X className="w-3 h-3" /> },
};

export default function AdminPlatformTab() {
  const { profile } = useAuth();

  const [platformWallet, setPlatformWallet] = useState<PlatformWallet | null>(null);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [revenueRows, setRevenueRows] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revenueExpanded, setRevenueExpanded] = useState(true);
  const [payoutsExpanded, setPayoutsExpanded] = useState(true);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Note modal state
  const [noteModal, setNoteModal] = useState<{ requestId: string; userId: string; action: 'paid' | 'rejected' } | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (profile?.role?.includes('admin')) load();
  }, [profile]);

  useEffect(() => {
    if (profile?.role?.includes('admin')) loadRevenue();
  }, [dateFrom, dateTo, profile]);

  async function load() {
    setLoading(true);
    const [pwRes, prRes] = await Promise.all([
      supabase.from('platform_wallet').select('balance,total_earned,updated_at').maybeSingle(),
      supabase
        .from('payout_requests')
        .select('id,user_id,amount,status,bank_info,admin_note,requested_at,processed_at,users(name,email)')
        .order('requested_at', { ascending: false }),
    ]);
    setPlatformWallet(pwRes.data ?? null);
    setPayoutRequests((prRes.data ?? []) as unknown as PayoutRequest[]);
    setLoading(false);
  }

  async function loadRevenue() {
    const { data } = await supabase
      .from('purchases')
      .select('created_at,platform_fee_amount,gross_amount')
      .eq('payment_status', 'paid')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59Z');

    if (!data) { setRevenueRows([]); return; }

    const byDate: Record<string, RevenueRow> = {};
    for (const p of data) {
      const date = p.created_at.slice(0, 10);
      if (!byDate[date]) byDate[date] = { date, platform_fee: 0, gross: 0, count: 0 };
      byDate[date].platform_fee += Number(p.platform_fee_amount);
      byDate[date].gross += Number(p.gross_amount);
      byDate[date].count++;
    }
    setRevenueRows(Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)));
  }

  async function processAction() {
    if (!noteModal) return;
    setProcessingId(noteModal.requestId);
    setActionError('');

    if (noteModal.action === 'paid') {
      // Use the approve_payout RPC which atomically debits settled_balance
      const { data, error } = await supabase.rpc('approve_payout', {
        p_request_id: noteModal.requestId,
        p_admin_id:   profile!.id,
        p_admin_note: adminNote,
      });
      if (error || data?.error) {
        setActionError(error?.message ?? data?.error ?? 'Failed to approve payout');
        setProcessingId(null);
        return;
      }
    } else {
      // Reject — just update status
      const { error } = await supabase
        .from('payout_requests')
        .update({ status: 'rejected', admin_note: adminNote, processed_at: new Date().toISOString() })
        .eq('id', noteModal.requestId);
      if (error) {
        setActionError(error.message);
        setProcessingId(null);
        return;
      }
    }

    setPayoutRequests(prev =>
      prev.map(r => r.id === noteModal.requestId
        ? { ...r, status: noteModal.action, admin_note: adminNote, processed_at: new Date().toISOString() }
        : r,
      ),
    );
    setProcessingId(null);
    setNoteModal(null);
    setAdminNote('');
    // Refresh platform wallet in case approve reduced it
    const { data: pw } = await supabase.from('platform_wallet').select('balance,total_earned,updated_at').maybeSingle();
    if (pw) setPlatformWallet(pw);
  }

  if (!profile?.role?.includes('admin')) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Shield className="w-12 h-12 text-stone-600 mx-auto mb-3" />
          <p className="text-stone-400 text-sm">Admin access required.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const totalFeeInRange   = revenueRows.reduce((s, r) => s + r.platform_fee, 0);
  const totalGrossInRange = revenueRows.reduce((s, r) => s + r.gross, 0);
  const totalSalesInRange = revenueRows.reduce((s, r) => s + r.count, 0);
  const pendingPayouts    = payoutRequests.filter(r => r.status === 'pending');
  const pendingTotal      = pendingPayouts.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-6">
      {/* ── Platform wallet cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          iconColor="text-amber-400" iconBg="bg-amber-500/10"
          label="Platform Balance"
          value={platformWallet?.balance ?? 0}
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          iconColor="text-green-400" iconBg="bg-green-500/10"
          label="Total Collected (all-time)"
          value={platformWallet?.total_earned ?? 0}
          highlight
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          iconColor="text-amber-400" iconBg="bg-amber-500/10"
          label={`Pending Payouts (${pendingPayouts.length})`}
          value={pendingTotal}
        />
      </div>

      {/* ── Revenue by date ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => setRevenueExpanded(o => !o)}
          className="w-full flex items-center justify-between px-6 py-5 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold">Орлогын тайлан</p>
              <p className="text-stone-500 text-xs">
                ₮{totalFeeInRange.toLocaleString()} платформ шимтгэл · {totalSalesInRange} борлуулалт
              </p>
            </div>
          </div>
          {revenueExpanded ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
        </button>

        {revenueExpanded && (
          <div className="border-t border-white/10">
            {/* Date filters */}
            <div className="px-6 py-4 flex flex-wrap items-center gap-3 border-b border-white/5">
              <Calendar className="w-4 h-4 text-stone-500" />
              <input
                type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-white/5 border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 outline-none focus:border-amber-500/50 transition-colors"
              />
              <span className="text-stone-500 text-sm">—</span>
              <input
                type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-white/5 border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>

            {/* Totals row */}
            <div className="px-6 py-3 grid grid-cols-3 gap-4 bg-stone-950/20 border-b border-white/5">
              <div><p className="text-stone-500 text-xs">Нийт орлого</p><p className="text-white font-semibold">₮{totalGrossInRange.toLocaleString()}</p></div>
              <div><p className="text-stone-500 text-xs">Платформ шимтгэл (3%)</p><p className="text-amber-400 font-semibold">₮{totalFeeInRange.toLocaleString()}</p></div>
              <div><p className="text-stone-500 text-xs">Борлуулалт</p><p className="text-white font-semibold">{totalSalesInRange}</p></div>
            </div>

            {revenueRows.length === 0 ? (
              <div className="px-6 py-8 text-center text-stone-500 text-sm">Энэ хугацаанд орлого байхгүй.</div>
            ) : (
              <div className="divide-y divide-white/5">
                {revenueRows.map(row => (
                  <div key={row.date} className="flex items-center gap-4 px-6 py-3">
                    <p className="text-stone-400 text-sm w-28 flex-shrink-0">
                      {new Date(row.date).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </p>
                    <div className="flex-1 grid grid-cols-3 gap-4 text-sm">
                      <span className="text-stone-300">₮{row.gross.toLocaleString()}</span>
                      <span className="text-amber-400 font-medium">₮{row.platform_fee.toLocaleString()} шимтгэл</span>
                      <span className="text-stone-500">{row.count} борлуулалт</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Payout requests ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => setPayoutsExpanded(o => !o)}
          className="w-full flex items-center justify-between px-6 py-5 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-500/10 rounded-xl flex items-center justify-center">
              <ArrowUpCircle className="w-5 h-5 text-green-400" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold">Мөнгө татах хүсэлтүүд</p>
              <p className="text-stone-500 text-xs">
                {pendingPayouts.length} хүлээгдэж буй · {payoutRequests.length} нийт
              </p>
            </div>
          </div>
          {payoutsExpanded ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
        </button>

        {payoutsExpanded && (
          <div className="border-t border-white/10 divide-y divide-white/5">
            {payoutRequests.length === 0 ? (
              <div className="px-6 py-8 text-center text-stone-500 text-sm">Хүсэлт байхгүй байна.</div>
            ) : (
              payoutRequests.map(req => {
                const cfg = STATUS_CFG[req.status] ?? STATUS_CFG.pending;
                const isProcessing = processingId === req.id;
                return (
                  <div key={req.id} className="px-6 py-4">
                    <div className="flex flex-wrap gap-4 items-start">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <p className="text-white font-semibold text-base">₮{Number(req.amount).toLocaleString()}</p>
                          <span className={`flex items-center gap-1 text-xs font-semibold border px-2.5 py-0.5 rounded-full ${cfg.color}`}>
                            {cfg.icon}{cfg.label}
                          </span>
                        </div>
                        <p className="text-stone-300 text-sm">{req.users?.name ?? 'Unknown'}</p>
                        <p className="text-stone-500 text-xs">{req.users?.email}</p>
                        <div className="flex items-center gap-2 text-stone-500 text-xs mt-1">
                          <Building2 className="w-3.5 h-3.5 text-stone-600" />
                          {req.bank_info?.bank_name}
                          <CreditCard className="w-3.5 h-3.5 text-stone-600 ml-1" />
                          {req.bank_info?.account_number}
                          <span className="text-stone-600">·</span>
                          {req.bank_info?.account_holder}
                        </div>
                        <p className="text-stone-600 text-xs">
                          {new Date(req.requested_at).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {req.admin_note && (
                          <p className="text-stone-400 text-xs italic bg-white/5 rounded-lg px-3 py-1.5 mt-1">
                            {req.admin_note}
                          </p>
                        )}
                      </div>

                      {req.status === 'pending' && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => { setNoteModal({ requestId: req.id, userId: req.user_id, action: 'paid' }); setAdminNote(''); setActionError(''); }}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-500 disabled:opacity-50 px-3 py-2 rounded-xl transition-colors"
                          >
                            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Олгох
                          </button>
                          <button
                            onClick={() => { setNoteModal({ requestId: req.id, userId: req.user_id, action: 'rejected' }); setAdminNote(''); setActionError(''); }}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 disabled:opacity-50 px-3 py-2 rounded-xl transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Татгалзах
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── Note + confirm modal ── */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={() => setNoteModal(null)} />
          <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">
                {noteModal.action === 'paid' ? 'Мөнгө олгох' : 'Татгалзах'}
              </h3>
              <button onClick={() => setNoteModal(null)} className="text-stone-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {noteModal.action === 'paid' && (
              <div className="flex items-start gap-2.5 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-green-400 text-sm">
                  Хэрэглэгчийн тооцоологдсон үлдэгдлээс хасагдана. Буцаах боломжгүй.
                </p>
              </div>
            )}

            {actionError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{actionError}</p>
              </div>
            )}

            <div>
              <label className="text-stone-400 text-sm mb-1.5 block">Admin тэмдэглэл (заавал биш)</label>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                rows={3}
                placeholder="Хэрэглэгчид харагдах тэмдэглэл…"
                className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none transition-colors text-sm resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={processAction}
                disabled={!!processingId}
                className={`flex-1 flex items-center justify-center gap-2 font-semibold py-2.5 rounded-xl transition-colors text-sm ${
                  noteModal.action === 'paid'
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                } disabled:opacity-50`}
              >
                {processingId ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {noteModal.action === 'paid' ? 'Баталгаажуулах' : 'Татгалзах'}
              </button>
              <button
                onClick={() => setNoteModal(null)}
                className="px-4 text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-sm"
              >
                Цуцлах
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, iconColor, iconBg, label, value, highlight = false }: {
  icon: React.ReactNode; iconColor: string; iconBg: string;
  label: string; value: number; highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 border ${highlight ? 'bg-green-500/5 border-green-500/20' : 'bg-white/5 border-white/10'}`}>
      <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center mb-4`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-stone-500 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-green-400' : 'text-white'}`}>
        ₮{Number(value).toLocaleString()}
      </p>
    </div>
  );
}
