import { useEffect, useState } from 'react';
import {
  CheckCircle2, X, Loader2, Clock, Building2,
  CreditCard, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface PayoutRequest {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  bank_info: { bank_name: string; account_number: string; account_holder: string };
  admin_note: string;
  requested_at: string;
  processed_at: string | null;
  user_name: string;
  user_email: string;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: 'Хүлээгдэж буй', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: <Clock className="w-3 h-3" /> },
  approved: { label: 'Зөвшөөрсөн',    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',    icon: <CheckCircle2 className="w-3 h-3" /> },
  paid:     { label: 'Олгосон',        color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: 'Татгалзсан',     color: 'text-red-400 bg-red-500/10 border-red-500/20',       icon: <X className="w-3 h-3" /> },
};

export default function AdminPayoutsTab() {
  const { profile } = useAuth();

  const [pending, setPending] = useState<PayoutRequest[]>([]);
  const [history, setHistory] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const [noteModal, setNoteModal] = useState<{ request: PayoutRequest; action: 'paid' | 'rejected' } | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('payout_requests')
      .select('id,user_id,amount,status,bank_info,admin_note,requested_at,processed_at,users(name,email)')
      .order('requested_at', { ascending: false });

    const rows: PayoutRequest[] = (data ?? []).map((r: {
      id: string; user_id: string; amount: number; status: string;
      bank_info: { bank_name: string; account_number: string; account_holder: string };
      admin_note: string; requested_at: string; processed_at: string | null;
      users: { name: string; email: string } | null;
    }) => ({
      ...r,
      user_name: r.users?.name ?? 'Unknown',
      user_email: r.users?.email ?? '',
    }));

    setPending(rows.filter(r => r.status === 'pending'));
    setHistory(rows.filter(r => r.status !== 'pending'));
    setLoading(false);
  }

  async function processAction() {
    if (!noteModal) return;
    setProcessingId(noteModal.request.id);
    setActionError('');

    if (noteModal.action === 'paid') {
      const { data, error } = await supabase.rpc('approve_payout', {
        p_request_id: noteModal.request.id,
        p_admin_id:   profile!.id,
        p_admin_note: adminNote,
      });
      if (error || data?.error) {
        setActionError(error?.message ?? data?.error ?? 'Failed');
        setProcessingId(null);
        return;
      }
    } else {
      const { error } = await supabase
        .from('payout_requests')
        .update({ status: 'rejected', admin_note: adminNote, processed_at: new Date().toISOString() })
        .eq('id', noteModal.request.id);
      if (error) { setActionError(error.message); setProcessingId(null); return; }
    }

    setProcessingId(null);
    setNoteModal(null);
    setAdminNote('');
    await load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending requests */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Хүлээгдэж буй хүсэлтүүд</h3>
          <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full font-semibold">
            {pending.length}
          </span>
        </div>

        {pending.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-500/40 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">Хүлээгдэж буй хүсэлт байхгүй байна.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(req => (
              <PayoutRow
                key={req.id}
                req={req}
                processing={processingId === req.id}
                onApprove={() => { setNoteModal({ request: req, action: 'paid' }); setAdminNote(''); setActionError(''); }}
                onReject={() => { setNoteModal({ request: req, action: 'rejected' }); setAdminNote(''); setActionError(''); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => setHistoryExpanded(o => !o)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm">Боловсруулагдсан хүсэлтүүд</span>
            <span className="text-xs text-stone-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{history.length}</span>
          </div>
          {historyExpanded ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
        </button>

        {historyExpanded && (
          <div className="border-t border-white/10 divide-y divide-white/5">
            {history.length === 0 ? (
              <div className="px-6 py-8 text-center text-stone-500 text-sm">Түүх байхгүй.</div>
            ) : (
              history.map(req => (
                <PayoutRow key={req.id} req={req} processing={false} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Action modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={() => setNoteModal(null)} />
          <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">
                {noteModal.action === 'paid' ? 'Мөнгө олгох' : 'Татгалзах'}
              </h3>
              <button onClick={() => setNoteModal(null)} className="text-stone-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="bg-white/5 rounded-xl px-4 py-3 text-sm space-y-1">
              <p className="text-white font-semibold">₮{Number(noteModal.request.amount).toLocaleString()}</p>
              <p className="text-stone-300">{noteModal.request.user_name}</p>
              <p className="text-stone-500 text-xs">{noteModal.request.bank_info?.bank_name} — {noteModal.request.bank_info?.account_number}</p>
            </div>

            {noteModal.action === 'paid' && (
              <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-amber-400 text-sm">
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
                className={`flex-1 flex items-center justify-center gap-2 font-semibold py-2.5 rounded-xl transition-colors text-sm disabled:opacity-50 ${
                  noteModal.action === 'paid' ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'
                }`}
              >
                {processingId ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {noteModal.action === 'paid' ? 'Баталгаажуулах' : 'Татгалзах'}
              </button>
              <button onClick={() => setNoteModal(null)} className="px-4 text-stone-400 hover:text-white bg-white/5 border border-white/10 rounded-xl transition-colors text-sm">
                Цуцлах
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PayoutRow({ req, processing, onApprove, onReject }: {
  req: PayoutRequest;
  processing: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const cfg = STATUS_CFG[req.status] ?? STATUS_CFG.pending;
  const isPending = req.status === 'pending';

  return (
    <div className={`bg-white/5 border border-white/10 rounded-2xl px-5 py-4 ${isPending ? 'border-amber-500/20 bg-amber-500/5' : ''}`}>
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <p className="text-white font-bold text-base">₮{Number(req.amount).toLocaleString()}</p>
            <span className={`flex items-center gap-1 text-xs font-semibold border px-2.5 py-0.5 rounded-full ${cfg.color}`}>
              {cfg.icon}{cfg.label}
            </span>
          </div>
          <p className="text-stone-200 text-sm font-medium">{req.user_name}</p>
          <p className="text-stone-500 text-xs">{req.user_email}</p>
          <div className="flex flex-wrap items-center gap-3 text-stone-500 text-xs mt-1">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-stone-600" />
              {req.bank_info?.bank_name}
            </span>
            <span className="flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-stone-600" />
              {req.bank_info?.account_number}
            </span>
            <span className="text-stone-600">·</span>
            <span>{req.bank_info?.account_holder}</span>
          </div>
          <p className="text-stone-600 text-xs">
            {new Date(req.requested_at).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
          {req.admin_note && (
            <p className="text-stone-400 text-xs italic bg-stone-950/30 rounded-lg px-3 py-1.5 mt-1">
              Admin: {req.admin_note}
            </p>
          )}
        </div>

        {isPending && onApprove && onReject && (
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={onApprove}
              disabled={processing}
              className="flex items-center gap-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-500 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Олгох
            </button>
            <button
              onClick={onReject}
              disabled={processing}
              className="flex items-center gap-1.5 text-sm font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
              Татгалзах
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
