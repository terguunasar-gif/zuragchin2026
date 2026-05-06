import { useEffect, useState } from 'react';
import {
  Wallet, ArrowUpCircle, Clock, CheckCircle2, AlertCircle,
  Loader2, Building2, CreditCard, User, Plus, TrendingUp,
  Download, Printer, BarChart3, X, Image as ImageIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface WalletData {
  pending_balance: number;
  settled_balance: number;
  total_earned: number;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  created_at: string;
  photo_id: string | null;
  photo_uploads: { preview_url: string; filename: string } | null;
}

interface PayoutRequest {
  id: string;
  amount: number;
  status: string;
  bank_info: { bank_name: string; account_number: string; account_holder: string };
  requested_at: string;
  processed_at: string | null;
  admin_note: string;
}

const MIN_PAYOUT = 10000;

const BANKS = [
  'Хаан банк',
  'Голомт банк',
  'Хас банк',
  'Төрийн банк',
  'TDB (Худалдаа хөгжлийн банк)',
  'Капитал банк',
  'Ардын банк',
];

const TX_TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string; sign: string }> = {
  download_sale: { label: 'Татах борлуулалт', icon: <Download className="w-3.5 h-3.5" />,     color: 'text-green-400',  sign: '+' },
  print_sale:    { label: 'Хэвлэх борлуулалт', icon: <Printer className="w-3.5 h-3.5" />,      color: 'text-green-400',  sign: '+' },
  sale:          { label: 'Борлуулалт',         icon: <Download className="w-3.5 h-3.5" />,     color: 'text-green-400',  sign: '+' },
  commission:    { label: 'Комисс',             icon: <TrendingUp className="w-3.5 h-3.5" />,   color: 'text-blue-400',   sign: '+' },
  settlement:    { label: 'Тооцоо',             icon: <BarChart3 className="w-3.5 h-3.5" />,    color: 'text-amber-400',  sign: '+' },
  payout:        { label: 'Мөнгө татах',        icon: <ArrowUpCircle className="w-3.5 h-3.5" />, color: 'text-red-400',   sign: '−' },
};

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: 'Хүлээгдэж буй', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: <Clock className="w-3 h-3" /> },
  approved: { label: 'Зөвшөөрсөн',    color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: <CheckCircle2 className="w-3 h-3" /> },
  paid:     { label: 'Олгосон',        color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: 'Татгалзсан',     color: 'text-red-400 bg-red-500/10 border-red-500/20',       icon: <X className="w-3 h-3" /> },
};

export default function WalletTab() {
  const { profile } = useAuth();

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState(false);

  useEffect(() => { if (profile) load(); }, [profile]);

  async function load() {
    setLoading(true);
    const [walletRes, txRes, payoutRes] = await Promise.all([
      supabase.from('wallets').select('pending_balance,settled_balance,total_earned').eq('user_id', profile!.id).maybeSingle(),
      supabase.from('wallet_transactions')
        .select('id,amount,type,description,created_at,photo_id,photo_uploads(preview_url,filename)')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('payout_requests')
        .select('id,amount,status,bank_info,requested_at,processed_at,admin_note')
        .eq('user_id', profile!.id)
        .order('requested_at', { ascending: false }),
    ]);
    setWallet(walletRes.data ?? { pending_balance: 0, settled_balance: 0, total_earned: 0 });
    setTransactions((txRes.data ?? []) as unknown as Transaction[]);
    setPayoutRequests(payoutRes.data ?? []);
    setLoading(false);
  }

  async function submitPayout() {
    setPayoutError('');
    const amount = parseFloat(payoutAmount);
    if (isNaN(amount) || amount < MIN_PAYOUT) {
      setPayoutError(`Хамгийн бага дүн ₮${MIN_PAYOUT.toLocaleString()}`);
      return;
    }
    if ((wallet?.settled_balance ?? 0) < amount) {
      setPayoutError('Тооцоологдсон үлдэгдэл хүрэлцэхгүй байна');
      return;
    }
    if (!bankName || !accountNumber.trim() || !accountHolder.trim()) {
      setPayoutError('Бүх мэдээллийг бөглөнө үү');
      return;
    }

    setPayoutSubmitting(true);
    const { error } = await supabase.from('payout_requests').insert({
      user_id: profile!.id,
      amount,
      status: 'pending',
      bank_info: { bank_name: bankName, account_number: accountNumber.trim(), account_holder: accountHolder.trim() },
    });

    if (error) {
      setPayoutError(error.message);
    } else {
      setPayoutSuccess(true);
      setShowPayoutForm(false);
      setBankName(''); setAccountNumber(''); setAccountHolder(''); setPayoutAmount('');
      await load();
    }
    setPayoutSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const settledBalance = Number(wallet?.settled_balance ?? 0);
  const canRequestPayout = settledBalance >= MIN_PAYOUT;
  const hasPendingPayout = payoutRequests.some(p => p.status === 'pending');

  return (
    <div className="space-y-6">
      {/* ── Balance cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BalanceCard
          label="Хүлээгдэж буй"
          sublabel="Pending balance"
          value={wallet?.pending_balance ?? 0}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-400"
          icon={<Clock className="w-5 h-5" />}
        />
        <BalanceCard
          label="Тооцоологдсон"
          sublabel="Settled balance"
          value={wallet?.settled_balance ?? 0}
          iconBg="bg-green-500/10"
          iconColor="text-green-400"
          icon={<CheckCircle2 className="w-5 h-5" />}
          highlight
        />
        <BalanceCard
          label="Нийт орлого"
          sublabel="Total earned"
          value={wallet?.total_earned ?? 0}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-400"
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      {/* ── Payout section ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center">
              <ArrowUpCircle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-white font-semibold">Мөнгө татах</p>
              <p className="text-stone-500 text-xs">Хамгийн бага дүн: ₮{MIN_PAYOUT.toLocaleString()}</p>
            </div>
          </div>
          {!showPayoutForm && (
            <button
              onClick={() => { setShowPayoutForm(true); setPayoutSuccess(false); }}
              disabled={!canRequestPayout || hasPendingPayout}
              title={!canRequestPayout ? `₮${MIN_PAYOUT.toLocaleString()} хүрсний дараа боломжтой` : hasPendingPayout ? 'Хүлээгдэж буй хүсэлт байна' : ''}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-semibold px-4 py-2 rounded-xl transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Хүсэлт гаргах
            </button>
          )}
        </div>

        {/* Status messages */}
        <div className="px-6">
          {payoutSuccess && (
            <div className="mt-4 flex items-center gap-2.5 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-green-400 text-sm">Хүсэлт амжилттай илгээгдлээ.</p>
            </div>
          )}
          {!canRequestPayout && !showPayoutForm && (
            <div className="mt-4 flex items-center gap-2.5 bg-white/5 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-stone-500 flex-shrink-0" />
              <p className="text-stone-500 text-sm">
                Тооцоологдсон үлдэгдэл ₮{MIN_PAYOUT.toLocaleString()}-аас бага байна.
                Мөнгө татахын тулд тооцоо хийлгэнэ үү.
              </p>
            </div>
          )}
          {hasPendingPayout && !showPayoutForm && (
            <div className="mt-4 flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="text-amber-400 text-sm">Хүлээгдэж буй хүсэлт байна. Администратор хянаж байна.</p>
            </div>
          )}
        </div>

        {/* Payout form */}
        {showPayoutForm && (
          <div className="px-6 py-5 space-y-4 border-t border-white/10">
            {payoutError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{payoutError}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-stone-400 text-sm mb-1.5">
                  <Wallet className="w-3.5 h-3.5 text-stone-500" />
                  Дүн (₮)
                </label>
                <input
                  type="number"
                  value={payoutAmount}
                  onChange={e => setPayoutAmount(e.target.value)}
                  placeholder={`Min ₮${MIN_PAYOUT.toLocaleString()}`}
                  max={settledBalance}
                  className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none transition-all text-sm"
                />
                <p className="text-stone-600 text-xs mt-1">Боломжтой: ₮{settledBalance.toLocaleString()}</p>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-stone-400 text-sm mb-1.5">
                  <Building2 className="w-3.5 h-3.5 text-stone-500" />
                  Банкны нэр
                </label>
                <select
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                  className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 text-white rounded-xl px-4 py-2.5 outline-none transition-all text-sm appearance-none"
                >
                  <option value="" disabled>Банк сонгох…</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-stone-400 text-sm mb-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-stone-500" />
                  Дансны дугаар
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value)}
                  placeholder="1234567890"
                  className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-stone-400 text-sm mb-1.5">
                  <User className="w-3.5 h-3.5 text-stone-500" />
                  Дансны эзэн
                </label>
                <input
                  type="text"
                  value={accountHolder}
                  onChange={e => setAccountHolder(e.target.value)}
                  placeholder="Овог Нэр"
                  className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none transition-all text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={submitPayout}
                disabled={payoutSubmitting}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                {payoutSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
                Илгээх
              </button>
              <button
                onClick={() => { setShowPayoutForm(false); setPayoutError(''); }}
                className="text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Цуцлах
              </button>
            </div>
          </div>
        )}

        {/* Payout history */}
        {payoutRequests.length > 0 && (
          <div className="px-6 pb-5 space-y-2">
            <p className="text-stone-500 text-xs font-medium uppercase tracking-wider pt-4 pb-1">Хүсэлтийн түүх</p>
            {payoutRequests.map(req => {
              const cfg = STATUS_CFG[req.status] ?? STATUS_CFG.pending;
              return (
                <div key={req.id} className="flex items-center gap-4 bg-white/5 rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-white text-sm font-medium">₮{Number(req.amount).toLocaleString()}</p>
                      <span className={`flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded-full ${cfg.color}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </div>
                    <p className="text-stone-500 text-xs truncate">
                      {req.bank_info?.bank_name} — {req.bank_info?.account_number}
                    </p>
                    <p className="text-stone-600 text-xs">
                      {new Date(req.requested_at).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </p>
                    {req.admin_note && <p className="text-stone-400 text-xs mt-1 italic">{req.admin_note}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Transaction history table ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-white font-semibold">Гүйлгээний түүх</p>
              <p className="text-stone-500 text-xs">{transactions.length} гүйлгээ</p>
            </div>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-stone-500 text-sm">
            Гүйлгээ байхгүй байна.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-stone-950/20">
                  <th className="text-left px-6 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider whitespace-nowrap">Огноо</th>
                  <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider whitespace-nowrap">Төрөл</th>
                  <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Зураг</th>
                  <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider whitespace-nowrap">Дүн</th>
                  <th className="text-right px-6 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider whitespace-nowrap">Төлөв</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {transactions.map(tx => {
                  const meta = TX_TYPE_META[tx.type] ?? TX_TYPE_META.sale;
                  const isPayout = tx.type === 'payout';
                  return (
                    <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                      {/* Огноо */}
                      <td className="px-6 py-3 text-stone-400 text-xs whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        <br />
                        <span className="text-stone-600">
                          {new Date(tx.created_at).toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      {/* Төрөл */}
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1.5 text-xs font-medium ${meta.color}`}>
                          {meta.icon}
                          {meta.label}
                        </span>
                        {tx.description && (
                          <p className="text-stone-600 text-xs mt-0.5 truncate max-w-[180px]">{tx.description}</p>
                        )}
                      </td>
                      {/* Зураг */}
                      <td className="px-4 py-3">
                        {tx.photo_uploads ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={(tx.photo_uploads as { preview_url: string; filename: string }).preview_url}
                              alt={(tx.photo_uploads as { preview_url: string; filename: string }).filename}
                              className="w-8 h-8 object-cover rounded-lg flex-shrink-0"
                            />
                            <span className="text-stone-400 text-xs truncate max-w-[100px]">
                              {(tx.photo_uploads as { preview_url: string; filename: string }).filename}
                            </span>
                          </div>
                        ) : (
                          <span className="text-stone-700 text-xs">—</span>
                        )}
                      </td>
                      {/* Дүн */}
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${meta.color}`}>
                        {meta.sign}₮{Number(tx.amount).toLocaleString()}
                      </td>
                      {/* Төлөв */}
                      <td className="px-6 py-3 text-right">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${isPayout ? 'text-red-400' : 'text-green-400'}`}>
                          {isPayout
                            ? <><ArrowUpCircle className="w-3 h-3" /> Гарсан</>
                            : <><CheckCircle2 className="w-3 h-3" /> Тооцогдсон</>
                          }
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BalanceCard({ icon, iconBg, iconColor, label, sublabel, value, highlight = false }: {
  icon: React.ReactNode; iconBg: string; iconColor: string;
  label: string; sublabel: string; value: number; highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 border ${highlight ? 'bg-green-500/5 border-green-500/20' : 'bg-white/5 border-white/10'}`}>
      <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center mb-4`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-stone-500 text-xs mb-0.5">{sublabel}</p>
      <p className="text-stone-400 text-xs mb-2">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-green-400' : 'text-white'}`}>
        ₮{Number(value).toLocaleString()}
      </p>
    </div>
  );
}
