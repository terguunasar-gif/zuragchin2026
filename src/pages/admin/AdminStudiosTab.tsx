import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, EyeOff, Home, Loader2, Pencil, Plus, UserRound, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  fetchStudioOwners,
  isHomeStudio,
  listingPhase,
  listingSummary,
  normalizeStudio,
  statusBadgeClass,
  STUDIO_STATUS_LABEL,
  studioOwnerLabel,
  studioPlace,
  type Studio,
  type StudioOwner,
  type StudioStatus,
} from '../../lib/studios';
import AdminStudioEditor, { OwnerAssignDialog } from './AdminStudioEditor';

const FILTERS: { id: 'all' | StudioStatus; label: string }[] = [
  { id: 'all', label: 'Бүгд' },
  { id: 'pending', label: 'Хүлээгдэж буй' },
  { id: 'approved', label: 'Батлагдсан' },
  { id: 'rejected', label: 'Татгалзсан' },
  { id: 'draft', label: 'Ноорог' },
];

function phaseClass(studio: Studio): string {
  const phase = listingPhase(studio);
  if (phase === 'expired') return 'text-red-300';
  if (phase === 'scheduled') return 'text-amber-300';
  if (phase === 'open') return 'text-emerald-300';
  return 'text-stone-400';
}

export default function AdminStudiosTab() {
  const [rows, setRows] = useState<Studio[]>([]);
  const [owners, setOwners] = useState<Record<string, StudioOwner>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | StudioStatus>('pending');
  const [editor, setEditor] = useState<{ studio: Studio | null } | null>(null);
  const [assigning, setAssigning] = useState<Studio | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('studios').select('*').order('created_at', { ascending: false });
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    const studios = (data ?? []).map(row => normalizeStudio(row as Studio));
    setRows(studios);
    setError('');
    const ids = studios.map(row => row.owner_user_id).filter((id): id is string => Boolean(id));
    try {
      setOwners(await fetchStudioOwners(ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Эзэмшигчдийг ачааллахад алдаа гарлаа');
    }
    setLoading(false);
  }

  const visible = useMemo(
    () => rows.filter(row => filter === 'all' || row.status === filter),
    [rows, filter],
  );

  function remember(studio: Studio, owner: StudioOwner | null) {
    setRows(prev => {
      const exists = prev.some(row => row.id === studio.id);
      return exists
        ? prev.map(row => (row.id === studio.id ? normalizeStudio(studio) : row))
        : [normalizeStudio(studio), ...prev];
    });
    setOwners(prev => {
      const next = { ...prev };
      if (studio.owner_user_id && owner) next[studio.owner_user_id] = owner;
      return next;
    });
  }

  async function patch(studio: Studio, changes: Partial<Pick<Studio, 'status' | 'is_visible' | 'show_on_home'>>) {
    setBusyId(studio.id);
    setError('');
    const { error: updateError } = await supabase.from('studios').update(changes).eq('id', studio.id);
    setBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRows(prev => prev.map(row => (row.id === studio.id ? { ...row, ...changes } : row)));
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-white font-semibold">Фото студи</h2>
          <p className="text-stone-500 text-sm mt-1 max-w-2xl">
            Эзэмшигчийн илгээлт «хүлээгдэж буй» төлөвтэй. Админ өөрөө студи нэмж, зурагчин эзэмшигч оноож,
            жагсаалтын хугацаа болон нүүр хуудасны харагдацыг засна. Хайлт: батлагдсан, харагдах, хугацаандаа.
            Нүүр: үүн дээр нэмээд «нүүрэнд».
          </p>
        </div>
        <button
          onClick={() => setEditor({ studio: null })}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm px-4 py-2 rounded-xl"
        >
          <Plus className="w-4 h-4" /> Студи нэмэх
        </button>
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
          <table className="w-full text-sm min-w-[760px]">
            <thead className="text-stone-500 text-left">
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 font-medium">Студи</th>
                <th className="px-4 py-3 font-medium">Төлөв</th>
                <th className="px-4 py-3 font-medium">Хугацаа</th>
                <th className="px-4 py-3 font-medium">Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(studio => {
                const owner = studio.owner_user_id ? owners[studio.owner_user_id] : undefined;
                return (
                  <tr key={studio.id} className="border-b border-white/5 last:border-0 align-top">
                    <td className="px-4 py-3">
                      <a href={`/studios/${studio.slug}`} className="text-white font-medium hover:text-amber-300">{studio.name}</a>
                      <p className="text-stone-500 text-xs mt-0.5">{studioPlace(studio) || 'Байршилгүй'} · {studio.phone || 'утасгүй'}</p>
                      <p className="text-stone-400 text-xs mt-1">{owner ? studioOwnerLabel(owner) : studio.owner_user_id ? 'Эзэмшигч олдсонгүй' : 'Эзэмшигчгүй'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <span className={`text-xs border px-2 py-1 rounded-full ${statusBadgeClass(studio.status)}`}>
                          {STUDIO_STATUS_LABEL[studio.status]}
                          {studio.status === 'approved' && !studio.is_visible ? ' · нуусан' : ''}
                        </span>
                        <span className={`text-[11px] ${studio.show_on_home ? 'text-amber-300' : 'text-stone-500'}`}>
                          {studio.show_on_home
                            ? (isHomeStudio(studio) ? 'Нүүрэнд гарч байна' : 'Нүүрэнд (одоо гарахгүй)')
                            : 'Нүүргүй'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className={`text-xs font-medium ${phaseClass(studio)}`}>{listingSummary(studio)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {studio.status !== 'approved' && (
                          <button
                            disabled={busyId === studio.id}
                            onClick={() => void patch(studio, { status: 'approved', is_visible: true })}
                            className="inline-flex items-center gap-1 text-xs text-emerald-300 border border-emerald-500/30 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" /> Батлах
                          </button>
                        )}
                        {studio.status !== 'rejected' && (
                          <button
                            disabled={busyId === studio.id}
                            onClick={() => void patch(studio, { status: 'rejected', is_visible: false })}
                            className="inline-flex items-center gap-1 text-xs text-red-300 border border-red-500/30 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" /> Татгалзах
                          </button>
                        )}
                        {studio.status === 'approved' && (
                          <button
                            disabled={busyId === studio.id}
                            onClick={() => void patch(studio, { is_visible: !studio.is_visible })}
                            className="inline-flex items-center gap-1 text-xs text-stone-300 border border-white/10 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            {studio.is_visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            {studio.is_visible ? 'Нуух' : 'Харуулах'}
                          </button>
                        )}
                        <button
                          disabled={busyId === studio.id}
                          onClick={() => void patch(studio, { show_on_home: !studio.show_on_home })}
                          className="inline-flex items-center gap-1 text-xs text-amber-200 border border-amber-500/30 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          <Home className="w-3.5 h-3.5" />
                          {studio.show_on_home ? 'Нүүрнээс хаах' : 'Нүүрэнд гаргах'}
                        </button>
                        <button
                          onClick={() => setEditor({ studio })}
                          className="inline-flex items-center gap-1 text-xs text-stone-300 border border-white/10 px-2.5 py-1.5 rounded-lg"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Засах
                        </button>
                        <button
                          onClick={() => setAssigning(studio)}
                          className="inline-flex items-center gap-1 text-xs text-stone-300 border border-white/10 px-2.5 py-1.5 rounded-lg"
                        >
                          <UserRound className="w-3.5 h-3.5" /> Эзэмшигч
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editor && (
        <AdminStudioEditor
          studio={editor.studio}
          owner={editor.studio?.owner_user_id ? owners[editor.studio.owner_user_id] ?? null : null}
          onClose={() => setEditor(null)}
          onSaved={(saved, owner) => {
            const created = !editor.studio;
            remember(saved, owner);
            setEditor(null);
            if (created) setFilter('all');
          }}
        />
      )}

      {assigning && (
        <OwnerAssignDialog
          studio={assigning}
          owner={assigning.owner_user_id ? owners[assigning.owner_user_id] ?? null : null}
          onClose={() => setAssigning(null)}
          onSaved={owner => {
            const next = { ...assigning, owner_user_id: owner?.id ?? null };
            remember(next, owner);
            setAssigning(null);
          }}
        />
      )}
    </div>
  );
}
