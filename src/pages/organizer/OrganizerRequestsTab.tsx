import { useEffect, useState } from 'react';
import {
  Camera, CheckCircle2, X, Clock, ChevronDown, ChevronUp,
  User, UserPlus, Search, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface JoinRequest {
  id: string;
  album_id: string;
  album_name: string;
  photographer_id: string;
  photographer_name: string;
  photographer_email: string;
  photographer_zid: string | null;
  status: 'pending' | 'approved' | 'rejected';
  joined_at: string;
}

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'all';

export default function OrganizerRequestsTab() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedAlbums, setExpandedAlbums] = useState<Set<string>>(new Set());

  // Manual add by ZUR-ID
  const [showAddForm, setShowAddForm] = useState(false);
  const [addAlbumId, setAddAlbumId] = useState('');
  const [addZurId, setAddZurId] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addSuccess, setAddSuccess] = useState('');

  // Albums owned by this organizer (for the select in add form)
  const [myAlbums, setMyAlbums] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (profile) { loadRequests(); loadMyAlbums(); }
  }, [profile]);

  async function loadMyAlbums() {
    const { data } = await supabase
      .from('albums')
      .select('id, name')
      .eq('owner_id', profile!.id)
      .order('created_at', { ascending: false });
    setMyAlbums(data ?? []);
  }

  async function loadRequests() {
    setLoading(true);
    const { data } = await supabase
      .from('album_photographers')
      .select(`
        id,
        album_id,
        photographer_id,
        status,
        joined_at,
        albums!inner ( name, owner_id ),
        users!album_photographers_photographer_id_fkey ( name, email, photographer_id )
      `)
      .eq('albums.owner_id', profile!.id)
      .order('joined_at', { ascending: false });

    if (data) {
      setRequests(data.map((r: any) => ({
        id: r.id,
        album_id: r.album_id,
        album_name: r.albums?.name ?? '',
        photographer_id: r.photographer_id,
        photographer_name: r.users?.name ?? 'Unknown',
        photographer_email: r.users?.email ?? '',
        photographer_zid: r.users?.photographer_id ?? null,
        status: r.status,
        joined_at: r.joined_at,
      })));
    }
    setLoading(false);
  }

  async function updateStatus(requestId: string, newStatus: 'approved' | 'rejected') {
    setUpdating(requestId);
    const { error } = await supabase
      .from('album_photographers')
      .update({ status: newStatus })
      .eq('id', requestId);
    if (!error) {
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: newStatus } : r));
    }
    setUpdating(null);
  }

  async function addByZurId() {
    setAddError('');
    setAddSuccess('');
    if (!addAlbumId) { setAddError('Цомог сонгоно уу'); return; }
    if (!addZurId.trim().toUpperCase().startsWith('ZUR-')) {
      setAddError('ZUR-XXXXX форматаар оруулна уу');
      return;
    }
    setAddLoading(true);

    // Find photographer by ZUR-ID
    const { data: photoUser } = await supabase
      .from('users')
      .select('id, name')
      .eq('photographer_id', addZurId.trim().toUpperCase())
      .maybeSingle();

    if (!photoUser) {
      setAddError('Энэ ZUR-ID-тэй зурагчин олдсонгүй');
      setAddLoading(false);
      return;
    }

    // Insert album_photographers record (approved directly)
    const { error } = await supabase
      .from('album_photographers')
      .insert({
        album_id: addAlbumId,
        photographer_id: photoUser.id,
        status: 'approved',
      });

    if (error) {
      setAddError(error.message.includes('unique') ? 'Энэ зурагчин аль хэдийн нэмэгдсэн байна' : error.message);
    } else {
      setAddSuccess(`${photoUser.name} амжилттай нэмэгдлээ`);
      setAddZurId('');
      await loadRequests();
    }
    setAddLoading(false);
  }

  function toggleAlbum(albumId: string) {
    setExpandedAlbums(prev => {
      const next = new Set(prev);
      if (next.has(albumId)) next.delete(albumId);
      else next.add(albumId);
      return next;
    });
  }

  const filtered = requests.filter(r => filter === 'all' || r.status === filter);
  const byAlbum = filtered.reduce<Record<string, { name: string; requests: JoinRequest[] }>>((acc, r) => {
    if (!acc[r.album_id]) acc[r.album_id] = { name: r.album_name, requests: [] };
    acc[r.album_id].requests.push(r);
    return acc;
  }, {});
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const statusBadge: Record<string, string> = {
    pending:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    approved: 'bg-green-500/10 text-green-400 border-green-500/20',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const statusIcon: Record<string, React.ReactNode> = {
    pending:  <Clock className="w-3.5 h-3.5" />,
    approved: <CheckCircle2 className="w-3.5 h-3.5" />,
    rejected: <X className="w-3.5 h-3.5" />,
  };
  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'pending',  label: `Хүлээгдэж байна${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { key: 'approved', label: 'Зөвшөөрөгдсөн' },
    { key: 'rejected', label: 'Татгалзсан' },
    { key: 'all',      label: 'Бүгд' },
  ];

  return (
    <div className="space-y-5">
      {/* Header actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                filter === f.key
                  ? 'bg-amber-500 text-stone-950'
                  : 'bg-white/5 border border-white/10 text-stone-300 hover:bg-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowAddForm(f => !f); setAddError(''); setAddSuccess(''); }}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          ZUR-ID-ээр нэмэх
        </button>
      </div>

      {/* Manual add by ZUR-ID */}
      {showAddForm && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <p className="text-white font-medium text-sm">ZUR-ID-ээр зурагчин нэмэх</p>
          {addError && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{addError}</p>
            </div>
          )}
          {addSuccess && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-green-400 text-sm">{addSuccess}</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={addAlbumId}
              onChange={e => setAddAlbumId(e.target.value)}
              className="bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
            >
              <option value="">Цомог сонгох…</option>
              {myAlbums.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div className="relative sm:col-span-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
              <input
                type="text"
                value={addZurId}
                onChange={e => setAddZurId(e.target.value.toUpperCase())}
                placeholder="ZUR-XXXXX"
                className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all"
              />
            </div>
            <button
              onClick={addByZurId}
              disabled={addLoading}
              className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              {addLoading
                ? <div className="w-4 h-4 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
                : <><UserPlus className="w-4 h-4" />Нэмэх</>
              }
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
        </div>
      ) : Object.keys(byAlbum).length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
          <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
            <Camera className="w-6 h-6 text-stone-500" />
          </div>
          <p className="text-white font-medium mb-1">
            {filter === 'pending' ? 'Хүлээгдэж буй хүсэлт байхгүй' : 'Хүсэлт байхгүй байна'}
          </p>
          <p className="text-stone-500 text-sm">
            {filter === 'pending'
              ? 'Таны цомогт нэгдэхийг хүссэн зурагчдын хүсэлт энд харагдана.'
              : 'Энэ шүүлтүүрт харуулах зүйл байхгүй.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byAlbum).map(([albumId, { name, requests: albumRequests }]) => {
            const isExpanded = expandedAlbums.has(albumId) || Object.keys(byAlbum).length === 1;
            return (
              <div key={albumId} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggleAlbum(albumId)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                      <Camera className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium">{name}</p>
                      <p className="text-stone-500 text-xs">{albumRequests.length} хүсэлт</p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
                </button>

                {isExpanded && (
                  <div className="divide-y divide-white/5 border-t border-white/10">
                    {albumRequests.map(req => (
                      <div key={req.id} className="flex items-center gap-4 px-5 py-4">
                        <div className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-stone-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm truncate">{req.photographer_name}</p>
                          <p className="text-stone-500 text-xs truncate">{req.photographer_email}</p>
                          {req.photographer_zid && (
                            <span className="inline-block mt-0.5 text-xs font-mono bg-white/10 text-stone-400 px-2 py-0.5 rounded">
                              {req.photographer_zid}
                            </span>
                          )}
                          <p className="text-stone-600 text-xs mt-0.5">
                            {new Date(req.joined_at).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>

                        {req.status === 'pending' ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => updateStatus(req.id, 'rejected')}
                              disabled={updating === req.id}
                              className="flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {updating === req.id
                                ? <div className="w-3.5 h-3.5 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                                : <X className="w-3.5 h-3.5" />}
                              Татгалзах
                            </button>
                            <button
                              onClick={() => updateStatus(req.id, 'approved')}
                              disabled={updating === req.id}
                              className="flex items-center gap-1.5 text-xs font-semibold text-stone-950 bg-amber-500 hover:bg-amber-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {updating === req.id
                                ? <div className="w-3.5 h-3.5 border border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
                                : <CheckCircle2 className="w-3.5 h-3.5" />}
                              Зөвшөөрөх
                            </button>
                          </div>
                        ) : (
                          <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border flex-shrink-0 ${statusBadge[req.status]}`}>
                            {statusIcon[req.status]}
                            <span className="capitalize">{req.status}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
