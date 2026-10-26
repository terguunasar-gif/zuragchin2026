import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  normalizeStudio,
  statusBadgeClass,
  STUDIO_STATUS_LABEL,
  studioPlace,
  type Studio,
  type StudioStatus,
} from '../../lib/studios';

const FILTERS: { id: 'all' | StudioStatus; label: string }[] = [
  { id: 'all', label: 'Бүгд' },
  { id: 'pending', label: 'Хүлээгдэж буй' },
  { id: 'approved', label: 'Батлагдсан' },
  { id: 'rejected', label: 'Татгалзсан' },
  { id: 'draft', label: 'Ноорог' },
];

export default function AdminStudiosTab() {
  const [rows, setRows] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | StudioStatus>('pending');

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('studios').select('*').order('created_at', { ascending: false });
    if (loadError) setError(loadError.message);
    else {
      setError('');
      setRows((data ?? []).map(row => normalizeStudio(row as Studio)));
    }
    setLoading(false);
  }

  const visible = useMemo(
    () => rows.filter(row => filter === 'all' || row.status === filter),
    [rows, filter],
  );

  async function setStatus(studio: Studio, status: StudioStatus, isVisible: boolean) {
    setBusyId(studio.id);
    setError('');
    const { error: updateError } = await supabase
      .from('studios')
      .update({ status, is_visible: isVisible })
      .eq('id', studio.id);
    setBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRows(prev => prev.map(row => (row.id === studio.id ? { ...row, status, is_visible: isVisible } : row)));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-semibold">Фото студи</h2>
        <p className="text-stone-500 text-sm mt-1">
          Эзэмшигчийн илгээлт «хүлээгдэж буй» төлөвтэй, хайлтад гарахгүй. Батлахад батлагдсан, харагдана.
          Зурагчны профайлаас тусдаа.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(item => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              filter === item.id ? 'bg-amber-500 text-stone-950 border-amber-500' : 'border-white/10 text-stone-400'
            }`}
          >
            {item.label}
            <span className="ml-1 opacity-70">{item.id === 'all' ? rows.length : rows.filter(row => row.status === item.id).length}</span>
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {visible.length === 0 ? (
        <p className="text-stone-500 text-sm py-8">Энэ шүүлтүүрт студи алга.</p>
      ) : (
        <div className="overflow-x-auto border border-white/10 rounded-2xl">
          <table className="w-full text-sm">
            <thead className="text-stone-500 text-left">
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 font-medium">Студи</th>
                <th className="px-4 py-3 font-medium">Төлөв</th>
                <th className="px-4 py-3 font-medium">Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(studio => (
                <tr key={studio.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <a href={`/studios/${studio.slug}`} className="text-white font-medium hover:text-amber-300">{studio.name}</a>
                    <p className="text-stone-500 text-xs mt-0.5">{studioPlace(studio) || 'Байршилгүй'} · {studio.phone || 'утасгүй'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs border px-2 py-1 rounded-full ${statusBadgeClass(studio.status)}`}>
                      {STUDIO_STATUS_LABEL[studio.status]}
                      {studio.status === 'approved' && !studio.is_visible ? ' · нуусан' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {studio.status !== 'approved' && (
                        <button
                          disabled={busyId === studio.id}
                          onClick={() => void setStatus(studio, 'approved', true)}
                          className="inline-flex items-center gap-1 text-xs text-emerald-300 border border-emerald-500/30 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" /> Батлах
                        </button>
                      )}
                      {studio.status !== 'rejected' && (
                        <button
                          disabled={busyId === studio.id}
                          onClick={() => void setStatus(studio, 'rejected', false)}
                          className="inline-flex items-center gap-1 text-xs text-red-300 border border-red-500/30 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" /> Татгалзах
                        </button>
                      )}
                      {studio.status === 'approved' && (
                        <button
                          disabled={busyId === studio.id}
                          onClick={() => void setStatus(studio, 'approved', !studio.is_visible)}
                          className="inline-flex items-center gap-1 text-xs text-stone-300 border border-white/10 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          {studio.is_visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {studio.is_visible ? 'Нуух' : 'Харуулах'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
