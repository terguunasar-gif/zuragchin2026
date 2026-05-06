import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, Upload, Clock, CheckCircle2, X, Search,
  Plus, Copy, BadgeCheck, FolderSearch, Send, Lock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface MyAlbumRequest {
  id: string;
  album_id: string;
  album_name: string;
  event_date: string;
  organizer_name: string;
  revenue_model: string;
  status: 'pending' | 'approved' | 'rejected';
  joined_at: string;
}

interface AlbumResult {
  id: string;
  name: string;
  event_date: string;
  organizer_name: string;
  revenue_model: string;
  status: string;
  alreadyRequested: boolean;
}

export default function PhotographerAlbumsTab() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<MyAlbumRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // ZUR-ID
  const [copied, setCopied] = useState(false);
  const [generatingId, setGeneratingId] = useState(false);

  // Album search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AlbumResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (profile) loadMyAlbums();
  }, [profile]);

  async function loadMyAlbums() {
    setLoading(true);
    const { data } = await supabase
      .from('album_photographers')
      .select(`
        id,
        album_id,
        status,
        joined_at,
        albums!inner (
          name,
          event_date,
          revenue_model,
          owner_id,
          users!albums_owner_id_fkey ( name )
        )
      `)
      .eq('photographer_id', profile!.id)
      .order('joined_at', { ascending: false });

    if (data) {
      setRequests(data.map((r: any) => ({
        id: r.id,
        album_id: r.album_id,
        album_name: r.albums?.name ?? '',
        event_date: r.albums?.event_date ?? '',
        organizer_name: r.albums?.users?.name ?? 'Unknown',
        revenue_model: r.albums?.revenue_model ?? 'shared',
        status: r.status,
        joined_at: r.joined_at,
      })));
    }
    setLoading(false);
  }

  async function generateZurId() {
    setGeneratingId(true);
    const { data, error } = await supabase.rpc('generate_photographer_id');
    if (!error && data) {
      await supabase.from('users').update({ photographer_id: data }).eq('id', profile!.id);
      await refreshProfile();
    }
    setGeneratingId(false);
  }

  function copyZurId() {
    if (!profile?.photographer_id) return;
    navigator.clipboard.writeText(profile.photographer_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function searchAlbums() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setJoinSuccess(null);

    const { data } = await supabase
      .from('albums')
      .select(`
        id, name, event_date, status, revenue_model,
        users!albums_owner_id_fkey ( name )
      `)
      .eq('status', 'active')
      .or(`name.ilike.%${searchQuery}%`)
      .limit(20);

    const myAlbumIds = new Set(requests.map(r => r.album_id));

    setSearchResults((data ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      event_date: a.event_date,
      organizer_name: a.users?.name ?? 'Unknown',
      revenue_model: a.revenue_model ?? 'shared',
      status: a.status,
      alreadyRequested: myAlbumIds.has(a.id),
    })));
    setSearching(false);
  }

  async function sendJoinRequest(albumId: string, albumName: string) {
    if (!profile?.photographer_id) {
      alert('Цомогт нэгдэхийн тулд эхлээд ZUR-ID авна уу');
      return;
    }
    setJoining(albumId);
    const { error } = await supabase.from('album_photographers').insert({
      album_id: albumId,
      photographer_id: profile.id,
      status: 'pending',
    });
    if (!error) {
      setJoinSuccess(albumId);
      setSearchResults(prev => prev.map(a => a.id === albumId ? { ...a, alreadyRequested: true } : a));
      await loadMyAlbums();
    }
    setJoining(null);
  }

  const statusConfig = {
    pending: {
      label: 'Хүлээгдэж байна',
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      icon: <Lock className="w-3.5 h-3.5" />,
    },
    approved: {
      label: 'Зөвшөөрөгдсөн',
      badge: 'bg-green-500/10 text-green-400 border-green-500/20',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    rejected: {
      label: 'Татгалзсан',
      badge: 'bg-red-500/10 text-red-400 border-red-500/20',
      icon: <X className="w-3.5 h-3.5" />,
    },
  };

  const revenueLabel = (model: string) =>
    model === 'owned' ? 'Бүрэн өмчлөх (96%)' : 'Хуваалцах (86%)';
  const revenueColor = (model: string) =>
    model === 'owned' ? 'text-amber-400' : 'text-blue-400';

  return (
    <div className="space-y-6">
      {/* ── ZUR-ID card ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <BadgeCheck className="w-5 h-5 text-amber-400" />
          <p className="text-white font-semibold">Зурагчины ID</p>
        </div>
        <p className="text-stone-500 text-xs mb-4">
          Зохион байгуулагчид энэ ID-г ашиглан таныг цомогт нэмнэ.
        </p>
        {profile?.photographer_id ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-stone-900 border border-white/10 rounded-xl px-4 py-2.5">
              <span className="text-amber-400 font-mono font-bold text-lg tracking-widest">
                {profile.photographer_id}
              </span>
            </div>
            <button
              onClick={copyZurId}
              className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 hover:text-amber-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Хуулагдлаа' : 'Хуулах'}
            </button>
          </div>
        ) : (
          <button
            onClick={generateZurId}
            disabled={generatingId}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            {generatingId
              ? <div className="w-4 h-4 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
              : <BadgeCheck className="w-4 h-4" />
            }
            ZUR-ID авах
          </button>
        )}
      </div>

      {/* ── Album search ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <FolderSearch className="w-5 h-5 text-blue-400" />
          <p className="text-white font-semibold">Цомог хайх</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchAlbums()}
              placeholder="Цомгийн нэрээр хайх…"
              className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all"
            />
          </div>
          <button
            onClick={searchAlbums}
            disabled={searching || !searchQuery.trim()}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            {searching
              ? <div className="w-4 h-4 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
              : <Search className="w-4 h-4" />
            }
            Хайх
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="space-y-2">
            {searchResults.map(album => (
              <div key={album.id} className="flex items-center gap-4 bg-stone-900 border border-white/10 rounded-xl px-4 py-3">
                <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Camera className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{album.name}</p>
                  <p className="text-stone-500 text-xs mt-0.5">
                    {album.organizer_name} &middot;{' '}
                    {new Date(album.event_date).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  <span className={`text-xs font-medium ${revenueColor(album.revenue_model)}`}>
                    {revenueLabel(album.revenue_model)}
                  </span>
                </div>
                {album.alreadyRequested ? (
                  <span className="text-xs text-stone-500 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg flex-shrink-0">
                    Илгээсэн
                  </span>
                ) : (
                  <button
                    onClick={() => sendJoinRequest(album.id, album.name)}
                    disabled={joining === album.id}
                    className="flex items-center gap-1.5 text-xs font-semibold text-stone-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                  >
                    {joining === album.id
                      ? <div className="w-3.5 h-3.5 border border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
                      : <Send className="w-3.5 h-3.5" />
                    }
                    Хүсэлт илгээх
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── My albums list ── */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Camera className="w-7 h-7 text-amber-400" />
          </div>
          <p className="text-white font-medium mb-1.5">Цомог байхгүй байна</p>
          <p className="text-stone-500 text-sm mb-5 max-w-xs mx-auto">
            Дээрх хайлтыг ашиглан идэвхтэй цомгуудад нэгдэх хүсэлт илгээнэ үү.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-stone-500 text-xs font-medium uppercase tracking-wider">Миний цомгууд ({requests.length})</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <ul className="divide-y divide-white/5">
              {requests.map(req => {
                const cfg = statusConfig[req.status];
                return (
                  <li key={req.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      {req.status === 'pending'
                        ? <Lock className="w-5 h-5 text-amber-400/60" />
                        : <Camera className="w-5 h-5 text-amber-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{req.album_name}</p>
                      <p className="text-stone-500 text-xs mt-0.5">
                        {req.organizer_name} &middot;{' '}
                        {new Date(req.event_date).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <span className={`text-xs font-medium ${revenueColor(req.revenue_model)}`}>
                        {revenueLabel(req.revenue_model)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${cfg.badge}`}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                      {req.status === 'approved' && (
                        <button
                          onClick={() => navigate(`/dashboard/albums/${req.album_id}/upload`)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-stone-950 bg-amber-500 hover:bg-amber-400 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Зураг байршуулах
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}