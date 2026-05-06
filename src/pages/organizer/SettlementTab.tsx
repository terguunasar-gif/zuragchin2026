import { useEffect, useState } from 'react';
import {
  BarChart3, CheckCircle2, AlertCircle, Loader2, X,
  TrendingUp, Users, Image as ImageIcon, ChevronDown, ChevronUp,
  Calendar, Banknote, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PhotographerStat {
  photographer_id: string;
  name: string;
  sold_count: number;
  pool_share: number;
  percentage: number;
  projected_amount: number;
}

interface AlbumRevenue {
  id: string;
  name: string;
  event_date: string;
  unsettled_count: number;
  unsettled_revenue: number;
  owner_amount: number;
  photographer_pool: number;
  last_settled_at: string | null;
  photographer_stats: PhotographerStat[];
}

interface SettlementHistoryRow {
  id: string;
  settled_at: string;
  total_revenue: number;
  owner_amount: number;
  photographer_pool_amount: number;
  settlement_details: SettlementDetail[];
}

interface SettlementDetail {
  photographer_id: string;
  name: string;
  sold_count: number;
  percentage: number;
  amount: number;
}

interface SettlementResult {
  settlement_id: string;
  total_revenue: number;
  owner_amount: number;
  platform_amount: number;
  photographer_pool: number;
  sold_count: number;
  details: SettlementDetail[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettlementTab() {
  const { profile } = useAuth();

  const [albums, setAlbums] = useState<AlbumRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmAlbum, setConfirmAlbum] = useState<AlbumRevenue | null>(null);
  const [settling, setSettling] = useState(false);
  const [settlementResult, setSettlementResult] = useState<SettlementResult | null>(null);
  const [error, setError] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [historyMap, setHistoryMap] = useState<Record<string, SettlementHistoryRow[]>>({});
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  useEffect(() => { if (profile) load(); }, [profile]);

  async function load() {
    setLoading(true);
    const { data: albumData } = await supabase
      .from('albums')
      .select('id, name, event_date')
      .eq('owner_id', profile!.id)
      .order('event_date', { ascending: false });

    if (!albumData || albumData.length === 0) { setAlbums([]); setLoading(false); return; }

    const enriched: AlbumRevenue[] = await Promise.all(albumData.map(async a => {
      const [purchasesRes, settlementRes, statsRes] = await Promise.all([
        supabase.from('purchases')
          .select('gross_amount,owner_amount,photographer_pool_amount')
          .eq('album_id', a.id).eq('payment_status', 'paid').eq('settled', false),
        supabase.from('album_settlements')
          .select('settled_at').eq('album_id', a.id)
          .order('settled_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('purchases')
          .select('photographer_id,photographer_pool_amount,users!purchases_photographer_id_fkey(name)')
          .eq('album_id', a.id).eq('payment_status', 'paid').eq('settled', false),
      ]);

      const purchases = purchasesRes.data ?? [];
      const totalPool = purchases.reduce((s, p) => s + Number(p.photographer_pool_amount), 0);
      const totalCount = purchases.length;

      // Aggregate per-photographer
      const statsMap: Record<string, { name: string; sold_count: number; pool_share: number }> = {};
      for (const p of statsRes.data ?? []) {
        const uid = p.photographer_id;
        const uName = (p.users as { name: string } | null)?.name ?? 'Unknown';
        if (!statsMap[uid]) statsMap[uid] = { name: uName, sold_count: 0, pool_share: 0 };
        statsMap[uid].sold_count++;
        statsMap[uid].pool_share += Number(p.photographer_pool_amount);
      }
      const photographer_stats: PhotographerStat[] = Object.entries(statsMap).map(([id, s]) => ({
        photographer_id: id,
        name: s.name,
        sold_count: s.sold_count,
        pool_share: s.pool_share,
        percentage: totalCount > 0 ? Math.round((s.sold_count / totalCount) * 10000) / 100 : 0,
        projected_amount: totalPool > 0 ? Math.round(totalPool * (s.sold_count / Math.max(totalCount, 1)) * 100) / 100 : 0,
      }));

      return {
        id: a.id,
        name: a.name,
        event_date: a.event_date,
        unsettled_count: purchases.length,
        unsettled_revenue: purchases.reduce((s, p) => s + Number(p.gross_amount), 0),
        owner_amount: purchases.reduce((s, p) => s + Number(p.owner_amount), 0),
        photographer_pool: totalPool,
        last_settled_at: settlementRes.data?.settled_at ?? null,
        photographer_stats,
      };
    }));

    setAlbums(enriched);
    setLoading(false);
  }

  async function loadHistory(albumId: string) {
    const { data } = await supabase.from('album_settlements')
      .select('id,settled_at,total_revenue,owner_amount,photographer_pool_amount,settlement_details')
      .eq('album_id', albumId)
      .order('settled_at', { ascending: false });
    setHistoryMap(prev => ({ ...prev, [albumId]: (data ?? []) as unknown as SettlementHistoryRow[] }));
  }

  function toggleHistory(albumId: string) {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      if (next.has(albumId)) { next.delete(albumId); }
      else { next.add(albumId); if (!historyMap[albumId]) loadHistory(albumId); }
      return next;
    });
  }

  async function executeSettlement() {
    if (!confirmAlbum) return;
    setSettling(true);
    setError('');
    const { data, error: rpcErr } = await supabase.rpc('settle_album', {
      p_album_id: confirmAlbum.id,
      p_settled_by: profile!.id,
    });
    if (rpcErr || !data || data.error) {
      setError(rpcErr?.message ?? data?.error ?? 'Settlement failed');
      setSettling(false);
      return;
    }
    setConfirmAlbum(null);
    setSettlementResult(data as SettlementResult);
    setSettling(false);
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
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg">Тооцоо хийх</h2>
        <p className="text-stone-400 text-sm mt-0.5">
          Тооцоо хийснээр фотографчдын хүлээгдэж буй орлого тооцоологдсон болж шилжинэ.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {albums.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
          <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-7 h-7 text-stone-500" />
          </div>
          <p className="text-white font-medium mb-1">Цомог байхгүй байна</p>
          <p className="text-stone-500 text-sm">Эхлээд цомог үүсгэнэ үү.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {albums.map(album => {
            const histExpanded = expandedHistory.has(album.id);
            const history = historyMap[album.id] ?? [];

            return (
              <div key={album.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                {/* Album header */}
                <div className="px-6 py-5 flex flex-wrap items-start gap-4 justify-between border-b border-white/10">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-base truncate">{album.name}</p>
                    <p className="text-stone-500 text-xs mt-0.5 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(album.event_date).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </p>
                    {album.last_settled_at && (
                      <p className="text-stone-600 text-xs mt-1">
                        Сүүлийн тооцоо: {new Date(album.last_settled_at).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setConfirmAlbum(album)}
                    disabled={album.unsettled_count === 0}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-semibold px-4 py-2 rounded-xl transition-colors text-sm flex-shrink-0"
                  >
                    <Banknote className="w-4 h-4" />
                    Тооцоо хийх
                  </button>
                </div>

                {/* Revenue summary chips */}
                <div className="px-6 py-4 flex flex-wrap gap-3 border-b border-white/5">
                  <Chip
                    icon={<ImageIcon className="w-3.5 h-3.5 text-amber-400" />}
                    label={`${album.unsettled_count} тооцоологдоогүй борлуулалт`}
                  />
                  <Chip
                    icon={<TrendingUp className="w-3.5 h-3.5 text-green-400" />}
                    label={`Нийт: ₮${album.unsettled_revenue.toLocaleString()}`}
                  />
                  <Chip
                    icon={<Banknote className="w-3.5 h-3.5 text-blue-400" />}
                    label={`Таны хувь: ₮${album.owner_amount.toLocaleString()}`}
                  />
                </div>

                {/* Live photographer stats table */}
                {album.photographer_stats.length > 0 && (
                  <div className="px-6 pb-4">
                    <p className="text-stone-500 text-xs font-medium uppercase tracking-wider pt-4 pb-2">
                      Зурагчдын статистик
                    </p>
                    <div className="bg-stone-950/30 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left px-4 py-2.5 text-stone-500 font-medium text-xs">Зурагчин</th>
                            <th className="text-right px-4 py-2.5 text-stone-500 font-medium text-xs">Зарсан зураг</th>
                            <th className="text-right px-4 py-2.5 text-stone-500 font-medium text-xs">Хувь</th>
                            <th className="text-right px-4 py-2.5 text-stone-500 font-medium text-xs">Хүлээгдэж буй дүн</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {album.photographer_stats.map(s => (
                            <tr key={s.photographer_id}>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Users className="w-3.5 h-3.5 text-stone-400" />
                                  </div>
                                  <span className="text-white text-sm">{s.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right text-stone-300">{s.sold_count}</td>
                              <td className="px-4 py-2.5 text-right text-stone-300">{s.percentage}%</td>
                              <td className="px-4 py-2.5 text-right text-amber-400 font-semibold">
                                ₮{s.projected_amount.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {album.photographer_stats.length > 1 && (
                          <tfoot>
                            <tr className="border-t border-white/10 bg-white/5">
                              <td className="px-4 py-2.5 text-stone-400 text-xs font-medium" colSpan={2}>Нийт (фотографчид)</td>
                              <td className="px-4 py-2.5 text-right text-stone-400 text-xs">
                                {album.photographer_stats.reduce((s, p) => s + p.percentage, 0).toFixed(1)}%
                              </td>
                              <td className="px-4 py-2.5 text-right text-amber-400 font-semibold text-xs">
                                ₮{album.photographer_pool.toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}

                {album.unsettled_count === 0 && (
                  <div className="px-6 py-4 flex items-center gap-2 text-stone-500 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500/50" />
                    Тооцоологдоогүй борлуулалт байхгүй байна.
                  </div>
                )}

                {/* Settlement history toggle */}
                <div className="border-t border-white/5">
                  <button
                    onClick={() => toggleHistory(album.id)}
                    className="w-full flex items-center justify-between px-6 py-3 text-stone-400 hover:text-white hover:bg-white/5 transition-colors text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Тооцооны түүх
                    </span>
                    {histExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {histExpanded && (
                    <div className="px-6 pb-4 space-y-2">
                      {history.length === 0 ? (
                        <p className="text-stone-500 text-sm py-2">Тооцоо хийгдээгүй байна.</p>
                      ) : (
                        history.map(h => (
                          <div key={h.id} className="bg-stone-950/30 rounded-xl overflow-hidden">
                            {/* History row */}
                            <button
                              onClick={() => setExpandedReport(expandedReport === h.id ? null : h.id)}
                              className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/5 transition-colors"
                            >
                              <div className="flex-1 min-w-0 text-left">
                                <p className="text-white text-sm font-medium">
                                  ₮{Number(h.total_revenue).toLocaleString()} нийт орлого
                                </p>
                                <p className="text-stone-500 text-xs mt-0.5">
                                  {new Date(h.settled_at).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  {' · '}{h.settlement_details?.length ?? 0} зурагчин
                                </p>
                              </div>
                              <ChevronRight className={`w-4 h-4 text-stone-500 transition-transform ${expandedReport === h.id ? 'rotate-90' : ''}`} />
                            </button>
                            {expandedReport === h.id && h.settlement_details && (
                              <div className="border-t border-white/5">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-white/5 bg-stone-950/20">
                                      <th className="text-left px-4 py-2 text-stone-500 font-medium text-xs">Зурагчин</th>
                                      <th className="text-right px-4 py-2 text-stone-500 font-medium text-xs">Зарсан</th>
                                      <th className="text-right px-4 py-2 text-stone-500 font-medium text-xs">Хувь</th>
                                      <th className="text-right px-4 py-2 text-stone-500 font-medium text-xs">Дүн</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5">
                                    {h.settlement_details.map(d => (
                                      <tr key={d.photographer_id}>
                                        <td className="px-4 py-2 text-white text-xs">{d.name}</td>
                                        <td className="px-4 py-2 text-right text-stone-400 text-xs">{d.sold_count}</td>
                                        <td className="px-4 py-2 text-right text-stone-400 text-xs">{d.percentage}%</td>
                                        <td className="px-4 py-2 text-right text-amber-400 font-semibold text-xs">₮{Number(d.amount).toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Confirmation modal ── */}
      {confirmAlbum && (
        <ConfirmModal
          album={confirmAlbum}
          settling={settling}
          onConfirm={executeSettlement}
          onCancel={() => setConfirmAlbum(null)}
        />
      )}

      {/* ── Success modal ── */}
      {settlementResult && (
        <SettlementResultModal
          result={settlementResult}
          onClose={() => setSettlementResult(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-1.5 text-xs text-stone-400">
      {icon}{label}
    </div>
  );
}

function ConfirmModal({
  album, settling, onConfirm, onCancel,
}: {
  album: AlbumRevenue;
  settling: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <p className="text-white font-semibold">Тооцоо хийх</p>
          <button onClick={onCancel} className="text-stone-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Album + amounts */}
          <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm">
            <p className="text-white font-medium">{album.name}</p>
            <div className="flex justify-between text-stone-400">
              <span>Нийт борлуулалт</span>
              <span className="text-white font-semibold">{album.unsettled_count} зураг</span>
            </div>
            <div className="flex justify-between text-stone-400">
              <span>Нийт орлого</span>
              <span className="text-white font-semibold">₮{album.unsettled_revenue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-stone-400">
              <span>Таны хувь (10%)</span>
              <span className="text-amber-400 font-semibold">₮{album.owner_amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-stone-400">
              <span>Фотографчдын хувь (86%)</span>
              <span className="text-blue-400 font-semibold">₮{album.photographer_pool.toLocaleString()}</span>
            </div>
          </div>

          {/* Photographer breakdown */}
          {album.photographer_stats.length > 0 && (
            <div className="bg-stone-950/40 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-2.5 text-stone-500 font-medium">Зурагчин</th>
                    <th className="text-right px-4 py-2.5 text-stone-500 font-medium">Зарсан</th>
                    <th className="text-right px-4 py-2.5 text-stone-500 font-medium">Хувь</th>
                    <th className="text-right px-4 py-2.5 text-stone-500 font-medium">Дүн</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {album.photographer_stats.map(s => (
                    <tr key={s.photographer_id}>
                      <td className="px-4 py-2.5 text-white">{s.name}</td>
                      <td className="px-4 py-2.5 text-right text-stone-400">{s.sold_count}</td>
                      <td className="px-4 py-2.5 text-right text-stone-400">{s.percentage}%</td>
                      <td className="px-4 py-2.5 text-right text-amber-400 font-semibold">₮{s.projected_amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Irreversibility warning */}
          <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-400 text-sm font-medium">
              Тооцоо хийсний дараа өөрчлөх боломжгүй.
              Фотографчдын орлого нэн даруй тооцоологдсон болж шилжинэ.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              disabled={settling}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold py-3 rounded-xl transition-colors"
            >
              {settling
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Боловсруулж байна…</>
                : <><Banknote className="w-4 h-4" /> Баталгаажуулах</>
              }
            </button>
            <button
              onClick={onCancel}
              disabled={settling}
              className="px-5 text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-sm"
            >
              Цуцлах
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettlementResultModal({ result, onClose }: { result: SettlementResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 sticky top-0 bg-stone-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-500/10 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-white font-semibold">Тооцоо амжилттай!</p>
              <p className="text-stone-500 text-xs">{result.sold_count} борлуулалт тооцоологдлоо</p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Нийт орлого', value: result.total_revenue },
              { label: 'Таны хувь', value: result.owner_amount, hl: true },
              { label: 'Фотографчид', value: result.photographer_pool },
              { label: 'Платформ', value: result.platform_amount },
            ].map(c => (
              <div key={c.label} className={`rounded-xl px-4 py-3 ${c.hl ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-stone-950/30'}`}>
                <p className="text-stone-500 text-xs mb-1">{c.label}</p>
                <p className={`font-semibold ${c.hl ? 'text-amber-400' : 'text-white'}`}>
                  ₮{Number(c.value).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {/* Photographer table */}
          <div>
            <p className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-3">Зурагчин бүрийн дүн</p>
            <div className="bg-stone-950/30 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs">Зурагчин</th>
                    <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs">Зарсан</th>
                    <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs">Хувь</th>
                    <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs">Дүн</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {result.details.map(d => (
                    <tr key={d.photographer_id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center">
                            <Users className="w-3.5 h-3.5 text-stone-400" />
                          </div>
                          <span className="text-white">{d.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-stone-300">{d.sold_count}</td>
                      <td className="px-4 py-3 text-right text-stone-300">{d.percentage}%</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-semibold">₮{Number(d.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button onClick={onClose} className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl transition-colors">
            Хаах
          </button>
        </div>
      </div>
    </div>
  );
}
