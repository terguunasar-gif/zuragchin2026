import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, Search, LogOut, User, ArrowLeft,
  Calendar, Image, CheckCircle2, Clock, Upload,
  X, AlertCircle, Phone, Mail, Facebook, Instagram,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface AlbumSummary {
  id: string;
  name: string;
  event_date: string;
  organizer_name: string;
  photo_count: number;
  description: string;
  is_free: boolean;
  download_price: number;
}

interface JoinStatus {
  [albumId: string]: 'none' | 'pending' | 'approved' | 'rejected';
}

interface OrganizerContact {
  name: string;
  contact_info: Record<string, string>;
  description: string;
  is_free: boolean;
  download_price: number;
}

export default function AlbumsPage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [filtered, setFiltered] = useState<AlbumSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [joinStatuses, setJoinStatuses] = useState<JoinStatus>({});

  const [modalAlbum, setModalAlbum] = useState<AlbumSummary | null>(null);
  const [organizer, setOrganizer] = useState<OrganizerContact | null>(null);
  const [loadingOrganizer, setLoadingOrganizer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => { loadAlbums(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? albums.filter(a => a.name.toLowerCase().includes(q) || a.organizer_name.toLowerCase().includes(q)) : albums);
  }, [search, albums]);

  async function loadAlbums() {
    setLoading(true);
    const { data: albumData } = await supabase
      .from('albums_with_stats')
      .select('id, name, event_date, organizer_name, photo_count, description, is_free, download_price')
      .eq('status', 'active')
      .order('event_date', { ascending: false });

    if (!albumData) { setLoading(false); return; }
    setAlbums(albumData);
    setFiltered(albumData);

    if (profile) {
      const { data: requests } = await supabase
        .from('album_photographers')
        .select('album_id, status')
        .eq('photographer_id', profile.id);
      const statusMap: JoinStatus = {};
      for (const r of requests ?? []) statusMap[r.album_id] = r.status;
      setJoinStatuses(statusMap);
    }
    setLoading(false);
  }

  async function openJoinModal(album: AlbumSummary) {
    setModalAlbum(album);
    setSubmitSuccess(false);
    setSubmitError('');
    setOrganizer(null);
    setLoadingOrganizer(true);

    const { data } = await supabase
      .from('users')
      .select('name, contact_info')
      .eq('id', await getOwnerId(album.id))
      .maybeSingle();

    setOrganizer(data ? {
      name: data.name,
      contact_info: data.contact_info ?? {},
      description: album.description,
      is_free: album.is_free,
      download_price: album.download_price,
    } : null);
    setLoadingOrganizer(false);
  }

  async function getOwnerId(albumId: string): Promise<string> {
    const { data } = await supabase.from('albums').select('owner_id').eq('id', albumId).maybeSingle();
    return data?.owner_id ?? '';
  }

  async function submitJoinRequest() {
    if (!modalAlbum || !profile) return;
    setSubmitting(true);
    setSubmitError('');
    const { error } = await supabase.from('album_photographers').insert({
      album_id: modalAlbum.id,
      photographer_id: profile.id,
      status: 'pending',
    });
    if (error) {
      setSubmitError(error.message);
    } else {
      setSubmitSuccess(true);
      setJoinStatuses(prev => ({ ...prev, [modalAlbum.id]: 'pending' }));
    }
    setSubmitting(false);
  }

  function closeModal() {
    setModalAlbum(null);
    setOrganizer(null);
    setSubmitSuccess(false);
    setSubmitError('');
  }

  const statusTag = (albumId: string) => {
    const s = joinStatuses[albumId];
    if (s === 'pending') return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
        <Clock className="w-3.5 h-3.5" />Хүсэлт хүлээгдэж байна
      </span>
    );
    if (s === 'approved') return (
      <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 text-xs font-semibold text-stone-950 bg-amber-500 hover:bg-amber-400 px-3 py-1.5 rounded-lg transition-colors">
        <Upload className="w-3.5 h-3.5" />Зураг байршуулах
      </button>
    );
    if (s === 'rejected') return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
        <X className="w-3.5 h-3.5" />Татгалзсан
      </span>
    );
    return (
      <button onClick={() => openJoinModal(filtered.find(a => a.id === albumId)!)} className="flex items-center gap-1.5 text-xs font-semibold text-stone-950 bg-amber-500 hover:bg-amber-400 px-3 py-1.5 rounded-lg transition-colors">
        <Camera className="w-3.5 h-3.5" />Зурагчнаар нэгдэх
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button onClick={() => navigate('/')} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <Camera className="w-5 h-5 text-stone-950" />
              </div>
              <div>
                <span className="text-white font-bold tracking-tight">Zuragchin</span>
                <span className="text-amber-400 font-bold">.mn</span>
              </div>
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-stone-300">
              <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium leading-none">{profile?.name || profile?.email}</p>
                <p className="text-xs text-stone-500 mt-0.5 capitalize">{profile?.role?.join(', ')}</p>
              </div>
            </div>
            <button onClick={signOut} className="flex items-center gap-2 text-stone-400 hover:text-white transition-colors text-sm">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Гарах</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-white text-3xl font-bold mb-2">Цомог хайх</h1>
          <p className="text-stone-400">Идэвхтэй арга хэмжээний цомгуудаас хайж, зурагчнаар нэгдэнэ үү.</p>
        </div>
        <div className="relative mb-8 max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Цомгийн нэр эсвэл зохион байгуулагчаар хайх..."
            className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl pl-12 pr-4 py-3 outline-none transition-all duration-200"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Camera className="w-8 h-8 text-stone-500" />
            </div>
            <p className="text-white font-medium text-lg mb-2">Цомог олдсонгүй</p>
            <p className="text-stone-500">{search ? 'Өөр хайлтын үгээр оролдоно уу.' : 'Одоогоор идэвхтэй цомог байхгүй байна.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(album => (
              <AlbumCard key={album.id} album={album} statusTag={statusTag(album.id)} />
            ))}
          </div>
        )}
      </main>

      {modalAlbum && (
        <JoinModal
          album={modalAlbum}
          organizer={organizer}
          loadingOrganizer={loadingOrganizer}
          submitting={submitting}
          success={submitSuccess}
          error={submitError}
          onConfirm={submitJoinRequest}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

function AlbumCard({ album, statusTag }: { album: AlbumSummary; statusTag: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 group">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <Camera className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold truncate">{album.name}</h3>
          <p className="text-stone-500 text-sm truncate">by {album.organizer_name}</p>
        </div>
      </div>
      {album.description && <p className="text-stone-400 text-sm leading-relaxed line-clamp-2">{album.description}</p>}
      <div className="flex items-center gap-4 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          {new Date(album.event_date).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <span className="flex items-center gap-1.5">
          <Image className="w-3.5 h-3.5" />{album.photo_count} зураг
        </span>
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <span className="text-stone-500 text-xs">
          {album.is_free ? <span className="text-green-400 font-medium">Үнэгүй татах</span> : <span>₮{album.download_price.toLocaleString()} / photo</span>}
        </span>
        {statusTag}
      </div>
    </div>
  );
}

function JoinModal({ album, organizer, loadingOrganizer, submitting, success, error, onConfirm, onClose }: {
  album: AlbumSummary;
  organizer: OrganizerContact | null;
  loadingOrganizer: boolean;
  submitting: boolean;
  success: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const contactIcons: Record<string, React.ReactNode> = {
    phone: <Phone className="w-4 h-4" />,
    email: <Mail className="w-4 h-4" />,
    facebook: <Facebook className="w-4 h-4" />,
    instagram: <Instagram className="w-4 h-4" />,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <h2 className="text-white font-semibold text-lg">Зурагчнаар нэгдэх</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="bg-white/5 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Camera className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-white font-medium">{album.name}</p>
                <p className="text-stone-500 text-sm">{new Date(album.event_date).toLocaleDateString('mn-MN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            {album.description && <p className="text-stone-400 text-sm leading-relaxed pl-12">{album.description}</p>}
            <div className="flex gap-4 pl-12 text-xs text-stone-500">
              <span className="flex items-center gap-1"><Image className="w-3.5 h-3.5" />{album.photo_count} зураг байршуулсан</span>
              <span>{album.is_free ? <span className="text-green-400">Үнэгүй татах</span> : <span>₮{album.download_price.toLocaleString()} / зураг</span>}</span>
            </div>
          </div>
          <div>
            <p className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-3">Зохион байгуулагчтай холбоо барих</p>
            {loadingOrganizer ? (
              <div className="flex items-center gap-2 text-stone-500 text-sm">
                <div className="w-4 h-4 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />Уншиж байна...
              </div>
            ) : organizer ? (
              <div className="space-y-2">
                <p className="text-white font-medium">{organizer.name}</p>
                {Object.entries(organizer.contact_info).length > 0 ? (
                  <div className="space-y-1.5">
                    {Object.entries(organizer.contact_info).map(([key, val]) =>
                      val ? (
                        <div key={key} className="flex items-center gap-2.5 text-stone-300 text-sm">
                          <span className="text-stone-500">{contactIcons[key] ?? <Mail className="w-4 h-4" />}</span>
                          <span className="capitalize text-stone-500 w-16">{key}</span>
                          <span>{val}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                ) : <p className="text-stone-500 text-sm">Холбоо барих мэдээлэл байхгүй байна.</p>}
              </div>
            ) : <p className="text-stone-500 text-sm">Зохион байгуулагчийн мэдээлэл байхгүй.</p>}
          </div>
          {error && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          {success ? (
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-white font-medium">Хүсэлт илгээгдлээ!</p>
              <p className="text-stone-400 text-sm">Зохион байгуулагч таны хүсэлтийг хянах болно.</p>
              <button onClick={onClose} className="mt-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">Болсон</button>
            </div>
          ) : (
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2.5 rounded-xl transition-colors text-sm">Цуцлах</button>
              <button onClick={onConfirm} disabled={submitting} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
                {submitting ? <div className="w-4 h-4 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" /> : <><Camera className="w-4 h-4" />Хүсэлт илгээх</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
