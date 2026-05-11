import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, LogOut, User, Plus, Image, Clock,
  CheckCircle2, FolderOpen, ChevronRight,
  Users, Shield, LayoutDashboard,
  ShoppingBag, ChevronDown, Settings, Printer,
  Calendar, Eye, Upload,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, hasRole } from '../lib/supabase';
import PhotographerProfileTab from './photographer/PhotographerProfileTab';

interface Album {
  id: string;
  name: string;
  title?: string;
  event_date: string;
  status: string;
  created_at: string;
}

interface Purchase {
  id: string;
  photo_id: string;
  type: string;
  gross_amount: number;
  created_at: string;
  expires_at: string;
}

export default function DashboardPage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [albums, setAlbums] = useState<Album[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [printOrders, setPrintOrders] = useState<any[]>([]);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [activeRole, setActiveRole] = useState<'buyer' | 'photographer' | 'organizer'>('buyer');

  useEffect(() => {
    if (!profile) return;
    // Зохион байгуулагч бол organizer tab, зурагчин бол photographer tab
    if (hasRole(profile, 'organizer')) {
      setActiveRole('organizer');
    } else if (hasRole(profile, 'photographer')) {
      setActiveRole('photographer');
    }
  }, [profile]);

  const isOrganizer    = hasRole(profile, 'organizer');
  const isPhotographer = hasRole(profile, 'photographer');
  const isAdmin        = hasRole(profile, 'admin');
  const isBuyer        = hasRole(profile, 'buyer');

  useEffect(() => {
    if (!profile) return;
    loadWalletBalance();
    if (isOrganizer) { loadOrganizerAlbums(); loadPendingCount(); }
    if (isBuyer) { loadPurchases(); loadPrintOrders(); }
  }, [profile]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function loadOrganizerAlbums() {
    const { data } = await supabase
      .from('albums')
      .select('id, name, title, event_date, status, created_at')
      .eq('owner_id', profile!.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setAlbums(data ?? []);
  }

  async function loadPendingCount() {
    const albumIds = (await supabase.from('albums').select('id').eq('owner_id', profile!.id))
      .data?.map((a: any) => a.id) ?? [];
    if (albumIds.length === 0) return;
    const { count } = await supabase
      .from('album_photographers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .in('album_id', albumIds);
    setPendingCount(count ?? 0);
  }

  async function loadWalletBalance() {
    const { data } = await supabase
      .from('wallets')
      .select('pending_balance')
      .eq('user_id', profile!.id)
      .maybeSingle();
    setWalletBalance(Number(data?.pending_balance ?? 0));
  }

  async function loadPurchases() {
    const { data } = await supabase
      .from('purchases')
      .select('id, photo_id, type, gross_amount, created_at')
      .eq('buyer_id', profile!.id)
      .eq('type', 'download')
      .order('created_at', { ascending: false });
    if (data) {
      setPurchases(data.map((p: any) => ({
        ...p,
        expires_at: new Date(new Date(p.created_at).getTime() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      })));
    }
  }

  const [publicAlbums, setPublicAlbums] = useState<any[]>([]);

  useEffect(() => { loadPublicAlbums(); }, []);

  async function loadPrintOrders() {
    const { data } = await supabase
      .from('print_orders')
      .select(`
        id, size, price, status, created_at, phone,
        photos!print_orders_photo_id_fkey ( watermarked_url ),
        profiles!print_orders_photographer_id_fkey ( name, photographer_id )
      `)
      .eq('buyer_id', profile!.id)
      .order('created_at', { ascending: false });
    setPrintOrders(data ?? []);
  }

  async function addPhotographerRole() {
    if (!profile || isPhotographer) return;
    const newRoles = [...(profile.role ?? []), 'photographer'];
    await supabase.from('profiles').update({ role: newRoles }).eq('id', profile.id);
    await refreshProfile();
  }

  async function loadPublicAlbums() {
    const { data } = await supabase
      .from('albums')
      .select('id, name, title, event_date, owner_id, visibility, is_public, share_link')
      .or('visibility.eq.public,is_public.eq.true')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(20);
    setPublicAlbums(data ?? []);
  }

  function daysLeft(expiresAt: string): number {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  const activePurchases = purchases.filter(p => daysLeft(p.expires_at) > 0);
  const walletStr = walletBalance > 0 ? `₮${walletBalance.toLocaleString()}` : '₮0';

  const statusLabel: Record<string, { label: string; color: string }> = {
    draft:  { label: 'Ноорог',    color: 'bg-stone-500/10 text-stone-400 border-stone-500/20' },
    active: { label: 'Идэвхтэй', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
    closed: { label: 'Хаагдсан', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  };

  const roleLabels: Record<string, string> = {
    buyer:        'Худалдан авагч',
    photographer: 'Зурагчин',
    organizer:    'Зохион байгуулагч',
    admin:        'Админ',
  };

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <Camera className="w-5 h-5 text-stone-950" />
            </div>
            <div>
              <span className="text-white font-bold tracking-tight">Zuragchin</span>
              <span className="text-amber-400 font-bold">.mn</span>
            </div>
          </button>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <button onClick={() => navigate('/admin')} className="hidden sm:flex items-center gap-2 text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-xl text-sm font-medium">
                <LayoutDashboard className="w-3.5 h-3.5" />Admin
              </button>
            )}
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setProfileDropdownOpen(o => !o)} className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-1.5">
                <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="hidden sm:block text-sm font-medium max-w-[120px] truncate">{profile?.name || profile?.email}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${profileDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {profileDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-stone-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden z-30">
                  <div className="px-4 py-3 border-b border-white/10">
                    <p className="text-white text-sm font-medium truncate">{profile?.name}</p>
                    <p className="text-stone-500 text-xs truncate">{profile?.email}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {profile?.role.map(r => (
                        <span key={r} className="text-xs bg-white/10 text-stone-400 px-2 py-0.5 rounded-full">{roleLabels[r] ?? r}</span>
                      ))}
                    </div>
                  </div>
                  <div className="py-1">
                    <button onClick={() => setProfileDropdownOpen(false)} className="w-full flex items-center gap-3 px-4 py-2.5 text-stone-300 hover:text-white hover:bg-white/5 text-sm">
                      <Settings className="w-4 h-4" />Тохиргоо
                    </button>
                    <button onClick={() => { setProfileDropdownOpen(false); signOut(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/5 text-sm">
                      <LogOut className="w-4 h-4" />Гарах
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-white text-3xl font-bold mb-1.5">
              Тавтай морилно уу, {profile?.name?.split(' ')[0] || ''}
            </h1>
            {/* Role switcher tabs — дараалал тогтмол: Худалдан авагч → Зурагчин → Зохион байгуулагч */}
            {(isPhotographer || isOrganizer) && (
              <div className="flex gap-1 mt-3 bg-white/5 border border-white/10 rounded-xl p-1 w-fit flex-wrap">
                <button onClick={() => setActiveRole('buyer')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeRole === 'buyer' ? 'bg-white/15 text-white' : 'text-stone-400 hover:text-white'}`}>
                  <ShoppingBag className="w-4 h-4" />Худалдан авагч
                </button>
                {isPhotographer && (
                  <button onClick={() => setActiveRole('photographer')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeRole === 'photographer' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-white'}`}>
                    <Camera className="w-4 h-4" />Зурагчин
                  </button>
                )}
                {isOrganizer && (
                  <button onClick={() => setActiveRole('organizer')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeRole === 'organizer' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-white'}`}>
                    <FolderOpen className="w-4 h-4" />Зохион байгуулагч
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-3 flex-wrap">
            {!isPhotographer && (
              <button onClick={addPhotographerRole} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-5 py-2.5 rounded-xl text-sm">
                <Camera className="w-4 h-4" />Зурагчин болох
              </button>
            )}
            <button onClick={() => navigate('/dashboard/albums/create')} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl">
              <Plus className="w-5 h-5" />Шинэ цомог
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {activeRole === 'buyer' && (
            <>
              <StatCard icon={<ShoppingBag className="w-5 h-5 text-blue-400" />} label="Татсан зурагнууд" value={activePurchases.length} />
              <StatCard icon={<Printer className="w-5 h-5 text-green-400" />} label="Угаалгах зурагнууд" value={printOrders.length} />
            </>
          )}
          {activeRole === 'photographer' && isPhotographer && (
            <>
              <StatCard icon={<Image className="w-5 h-5 text-blue-400" />} label="Миний зураг" value="—" />
              <StatCard icon={<CheckCircle2 className="w-5 h-5 text-green-400" />} label="Тооцоо" value="—" />
              <StatCard icon={<Clock className="w-5 h-5 text-amber-400" />} label="Хүлээгдэж буй" value={walletStr} />
            </>
          )}
          {activeRole === 'organizer' && isOrganizer && (
            <>
              <StatCard icon={<FolderOpen className="w-5 h-5 text-amber-400" />} label="Нийт цомог" value={albums.length} />
              <StatCard icon={<Users className="w-5 h-5 text-blue-400" />} label="Хүлээгдэж буй хүсэлт" value={pendingCount} />
              <StatCard icon={<CheckCircle2 className="w-5 h-5 text-green-400" />} label="Тооцоо" value="—" />
              <StatCard icon={<Clock className="w-5 h-5 text-amber-400" />} label="Хүлээгдэж буй" value={walletStr} />
            </>
          )}
          {isAdmin && (
            <StatCard icon={<Shield className="w-5 h-5 text-red-400" />} label="Платформ" value="Admin" onClick={() => navigate('/admin')} />
          )}
        </div>

        {/* ── ORGANIZER: Album list ── */}
        {activeRole === 'organizer' && isOrganizer && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-lg">Миний цомгууд</h2>
              <button onClick={() => navigate('/dashboard/albums/create')}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm">
                <Plus className="w-4 h-4" />Шинэ цомог
              </button>
            </div>

            {albums.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FolderOpen className="w-7 h-7 text-amber-400" />
                </div>
                <p className="text-white font-medium mb-1">Цомог байхгүй байна</p>
                <p className="text-stone-500 text-sm mb-4">Шинэ цомог үүсгэж зурагчидтай хуваалцаарай.</p>
                <button onClick={() => navigate('/dashboard/albums/create')}
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl text-sm">
                  <Plus className="w-4 h-4" />Цомог үүсгэх
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {albums.map(album => {
                  const st = statusLabel[album.status] ?? statusLabel.draft;
                  const displayName = album.title || album.name || '—';
                  return (
                    <div key={album.id}
                      className="bg-white/5 border border-white/10 hover:border-amber-500/30 rounded-2xl p-5 transition-all group cursor-pointer"
                      onClick={() => navigate(`/dashboard/albums/${album.id}`)}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Camera className="w-5 h-5 text-amber-400" />
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full border ${st.color}`}>{st.label}</span>
                      </div>
                      <h3 className="text-white font-semibold mb-1 truncate">{displayName}</h3>
                      <div className="flex items-center gap-1.5 text-stone-500 text-xs mb-4">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(album.event_date).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={e => { e.stopPropagation(); navigate(`/dashboard/albums/${album.id}/upload`); }}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 text-xs font-medium py-2 rounded-lg transition-colors">
                          <Upload className="w-3.5 h-3.5" />Зураг нэмэх
                        </button>
                        <button onClick={e => { e.stopPropagation(); navigate(`/album/${album.id}`); }}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-xs font-medium py-2 rounded-lg transition-colors">
                          <Eye className="w-3.5 h-3.5" />Харах
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PHOTOGRAPHER: Profile tab ── */}
        {activeRole === 'photographer' && isPhotographer && (
          <div className="mt-8">
            <PhotographerProfileTab />
          </div>
        )}

        {/* ── BUYER: Print orders ── */}
        {activeRole === 'buyer' && printOrders.length > 0 && (
          <div className="mt-8">
            <h2 className="text-white font-semibold text-lg mb-4">Угаалгах зурагнууд</h2>
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <ul className="divide-y divide-white/5">
                {printOrders.map((order: any) => (
                  <li key={order.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-12 h-12 bg-stone-900 rounded-xl overflow-hidden flex-shrink-0">
                      {order.photos?.watermarked_url
                        ? <img src={order.photos.watermarked_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Image className="w-5 h-5 text-stone-600" /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{order.size ?? '—'} хэмжээ</p>
                      <p className="text-stone-500 text-xs mt-0.5">Зурагчин: <span className="text-stone-300">{order.profiles?.name ?? '—'}</span></p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-amber-400 text-sm font-semibold">₮{Number(order.price ?? 0).toLocaleString()}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        order.status === 'ready' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                        order.status === 'delivered' ? 'bg-stone-500/10 text-stone-400 border-stone-500/20' :
                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {order.status === 'ready' ? 'Бэлэн' : order.status === 'delivered' ? 'Хүргэгдсэн' : 'Хүлээгдэж буй'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── BUYER: Public albums ── */}
        {activeRole === 'buyer' && (
          <div className="mt-10">
            <h2 className="text-white font-semibold text-lg mb-4">Нээлттэй цомгууд</h2>
            {publicAlbums.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
                <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FolderOpen className="w-7 h-7 text-amber-400" />
                </div>
                <p className="text-white font-medium mb-1">Цомог байхгүй байна</p>
                <p className="text-stone-500 text-sm">Зохион байгуулагчийн хуваалцсан QR эсвэл линкээр цомог үзнэ үү.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {publicAlbums.map(album => (
                  <button key={album.id} onClick={() => navigate(`/album/${album.id}`)}
                    className="bg-white/5 hover:bg-white/8 border border-white/10 hover:border-amber-500/30 rounded-2xl p-5 text-left transition-all group">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Camera className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{album.title || album.name}</p>
                        <p className="text-stone-500 text-xs">
                          {new Date(album.event_date).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-stone-600 group-hover:text-amber-400 flex-shrink-0" />
                    </div>
                    <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-1 rounded-full">Нээлттэй</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, onClick }: {
  icon: React.ReactNode; label: string; value: string | number; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-2xl p-5 flex items-center gap-3 text-left transition-all group w-full">
      <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-stone-400 text-xs">{label}</p>
        <p className="text-white font-semibold text-lg leading-tight">{value}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-stone-700 group-hover:text-stone-400 flex-shrink-0" />
    </button>
  );
}
