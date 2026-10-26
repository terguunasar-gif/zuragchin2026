import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus, Store, Trash2 } from 'lucide-react';
import StudioChrome from '../components/StudioChrome';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  listingPhase,
  normalizeStudio,
  statusBadgeClass,
  STUDIO_STATUS_LABEL,
  studioPlace,
  type Studio,
} from '../lib/studios';

export default function MyStudiosPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('studios')
      .select('*')
      .eq('owner_user_id', profile.id)
      .order('updated_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) setError(loadError.message);
        else setRows((data ?? []).map(row => normalizeStudio(row as Studio)));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile]);

  async function remove(studio: Studio) {
    if (!confirm(`«${studio.name}» студийг устгах уу?`)) return;
    const { error: deleteError } = await supabase.from('studios').delete().eq('id', studio.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setRows(prev => prev.filter(row => row.id !== studio.id));
  }

  return (
    <StudioChrome backTo="/studios" backLabel="Студи хайх">
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Миний студи</h1>
            <p className="text-stone-400 text-sm mt-1">Ноорог, хүлээгдэж буй болон батлагдсан студи.</p>
          </div>
          <button
            onClick={() => navigate('/studios/new')}
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm px-4 py-2 rounded-xl"
          >
            <Plus className="w-4 h-4" /> Нэмэх
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : rows.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <Store className="w-8 h-8 text-stone-500 mx-auto mb-3" />
            <p className="text-white font-medium mb-1">Студи бүртгэлгүй байна</p>
            <p className="text-stone-500 text-sm mb-4">Газрын зураг дээр цэг тавиад студи илгээнэ үү.</p>
            <button onClick={() => navigate('/studios/new')} className="text-amber-400 text-sm font-medium">Студи бүртгүүлэх</button>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map(studio => (
              <li key={studio.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-wrap items-center gap-3">
                <button onClick={() => navigate(`/studios/${studio.slug}`)} className="text-left min-w-0 flex-1">
                  <p className="text-white font-semibold">{studio.name}</p>
                  <p className="text-stone-500 text-xs mt-1 truncate">{studioPlace(studio) || 'Байршил дутуу'}</p>
                </button>
                <span className={`text-xs border px-2 py-1 rounded-full ${statusBadgeClass(studio.status)}`}>
                  {STUDIO_STATUS_LABEL[studio.status]}
                  {studio.status === 'approved' && !studio.is_visible ? ' · нуусан' : ''}
                  {studio.status === 'approved' && studio.is_visible && listingPhase(studio) === 'expired' ? ' · хугацаа дууссан' : ''}
                  {studio.status === 'approved' && studio.is_visible && listingPhase(studio) === 'scheduled' ? ' · эхлээгүй' : ''}
                </span>
                <button
                  onClick={() => navigate(`/studios/${studio.slug}/edit`)}
                  className="inline-flex items-center gap-1 text-sm text-stone-300 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg"
                >
                  <Pencil className="w-3.5 h-3.5" /> Засах
                </button>
                <button
                  onClick={() => void remove(studio)}
                  className="inline-flex items-center gap-1 text-sm text-red-300 hover:text-red-200 border border-red-500/20 px-3 py-1.5 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Устгах
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </StudioChrome>
  );
}
