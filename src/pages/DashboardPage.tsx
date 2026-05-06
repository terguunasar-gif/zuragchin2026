import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, LogOut, User, Plus, Image, Clock,
  CheckCircle2, FolderOpen, ChevronRight, Search,
  Users, Wallet, BarChart3, Shield, LayoutDashboard,
  ShoppingBag, UserPlus, ChevronDown, Settings, Briefcase,
  Download, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, hasRole } from '../lib/supabase';
import OrganizerRequestsTab from './organizer/OrganizerRequestsTab';
import OrganizerListingsTab from './organizer/OrganizerListingsTab';
import PhotographerAlbumsTab from './photographer/PhotographerAlbumsTab';
import SettlementTab from './organizer/SettlementTab';
import WalletTab from './wallet/WalletTab';
import AdminPlatformTab from './admin/AdminPlatformTab';

interface Album {
  id: string;
  name: string;
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
  photo?: {
    preview_url: string;
    original_url: string;
    album?: { name: string };
  };
}

type OrganizerTab = 'albums' | 'requests' | 'listings' | 'settlement' | 'wallet';
type PhotographerTab = 'albums' | 'wallet';
type AdminTab = 'platform' | 'wallet';
type BuyerTab = 'purchases' | 'downloads' | 'wallet';

export default function DashboardPage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [albums, setAlbums] = useState<Album[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [activeOrgTab, setActiveOrgTab] = useState<OrganizerTab>('albums');
  const [activePhotoTab, setActivePhotoTab] = useState<PhotographerTab>('albums');
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>('platform');
  const [activeBuyerTab, setActiveBuyerTab] = useState<BuyerTab>('purchases');
  const [pendingCount, setPendingCount] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [addingRole, setAddingRole] = useState<'photographer' | 'organizer' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isOrganizer    = hasRole(profile, 'organizer');
  const isPhotographer = hasRole(profile, 'photographer');
  const isAdmin        = hasRole(profile, 'admin');
  const isBuyer        = hasRole(profile, 'buyer');

  const canAddPhotographer = isBuyer && !isPhotographer && !isAdmin;
  const canAddOrganizer    = isBuyer && !isOrganizer && !isAdmin;

  useEffect(() => {
    if (!profile) return;
    loadWalletBalance();
    if (isOrganizer) { loadOrganizerAlbums(); loadPendingCount(); }
    if (isBuyer) loadPurchases();
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
    setLoadingAlbums(true);
    const { data } = await supabase
      .from('albums')
      .select('id, name, event_date, status, created_at')
      .eq('owner_id', profile!.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setAlbums(data ?? []);
    setLoadingAlbums(false);
  }

  async function loadPendingCount() {
    const albumIds = (await supabase.from('albums').select('id').eq('owner_id', profile!.id))
      .data?.map(a => a.id) ?? [];
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
    setLoadingPurchases(true);
    const { data } = await supabase
      .from('purchases')
      .select(`
        id, photo_id, type, gross_amount, created_at,
        photo_uploads!purchases_photo_id_fkey (
          preview_url, original_url,
          albums!photo_uploads_album_id_fkey ( name )
        )
      `)
      .eq('buyer_id', profile!.id)
      .eq('type', 'download')
      .order('created_at', { ascending: false });

    if (data) {
      setPurchases(data.map((p: any) => ({
        ...p,
        expires_at: new Date(new Date(p.created_at).getTime() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        photo: p.photo_uploads ? {
          preview_url: p.photo_uploads.preview_url,
          original_url: p.photo_uploads.original_url,
          album: p.photo_uploads.albums,
        } : undefined,
      })));
    }
    setLoadingPurchases(false);
  }

  async function addRole(role: 'photographer' | 'organizer') {
    if (!profile) return;
    setAddingRole(role);
    const newRoles = [...profile.role, role];
    await supabase.from('users').update({ role: newRoles }).eq('id', profile.id);
    await refreshProfile();
    setAddingRole(null);
  }

  function daysLeft(expiresAt: string): number {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  const statusBadge: Record<string, string> = {
    active: 'bg-green-500/10 text-green-400 border-green-500/20',
    draft:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    closed: 'bg-stone-500/10 text-stone-400 border-stone-500/20',
  };

  const roleLabels: Record<string, string> = {
    buyer:        'Худалдан авагч',
    photographer: 'Зурагчин',
    organizer:    'Зохион байгуулагч',
    admin:        'Админ',
  };

  const activePurchases = purchases.filter(p => daysLeft(p.expires_at) > 0);

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <Camera className="w-5 h-5 text-stone-950" />
            </div>
            <div>
              <span className="text-white font-bold tracking-tight">Zuragchin</span>
              <span className="text-amber-400 font-bold">.mn</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="hidden sm:flex items-center gap-2 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-xl transition-colors text-sm font-medium"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Admin
              </button>
            )}

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setProfileDropdownOpen(o => !o)}
                className="flex items-center gap-2 text-stone-300 hover:text-white transition-colors bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-1.5"
              >
                <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="hidden sm:block text-sm font-medium max-w-[120px] truncate">
                  {profile?.name || profile?.email}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-stone-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden z-30">
                  <div className="px-4 py-3 border-b border-white/10">
                    <p className="text-white text-sm font-medium truncate">{profile?.name}</p>
                    <p className="text-stone-500 text-xs truncate">{profile?.email}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {profile?.role.map(r => (
                        <span key={r} className="text-xs bg-white/10 text-stone-400 px-2 py-0.5 rounded-full">
                          {roleLabels[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { setProfileDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-stone-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                    >
                      <Settings className="w-4 h-4" />
                      Тохиргоо
                    </button>
                    <button
                      onClick={() => { setProfileDropdownOpen(false); signOut(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors text-sm"
                    >
                      <LogOut className="w-4 h-4" />
                      Гарах
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Welcome */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-white text-3xl font-bold mb-1.5">
              Тавтай морилно уу, {profile?.name?.split(' ')[0] || ''}
            </h1>
            <p className="text-stone-400 text-sm">
              {profile?.role.map(r => roleLabels[r] ?? r).join(' · ')}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {isPhotographer && (
              <>
                <button
                  onClick={() => navigate('/listings')}
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-5 py-2.5 rounded-xl transition-all duration-200 text-sm"
                >
                  <Briefcase className="w-4 h-4" />
                  Ажлын зар
                </button>
                <button
                  onClick={() => navigate('/albums')}
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-5 py-2.5 rounded-xl transition-all duration-200 text-sm"
                >
                  <Search className="w-4 h-4" />
                  Цомог хайх
                </button>
              </>
            )}
            {isOrganizer && (
              <button
                onClick={() => navigate('/dashboard/albums/create')}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl transition-all duration-200"
              >
                <Plus className="w-5 h-5" />
                Шинэ цомог
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {isOrganizer && (
            <StatCard
              icon={<FolderOpen className="w-5 h-5 text-amber-400" />}
              label="Цомог"
              value={albums.length}
              onClick={() => setActiveOrgTab('albums')}
            />
          )}
          {isPhotographer && (
            <StatCard
              icon={<Image className="w-5 h-5 text-blue-400" />}
              label="Миний зураг"
              value="—"
              onClick={() => setActivePhotoTab('albums')}
            />
          )}
          {isBuyer && !isOrganizer && !isPhotographer && !isAdmin && (
            <StatCard
              icon={<ShoppingBag className="w-5 h-5 text-blue-400" />}
              label="Татсан зураг"
              value={activePurchases.length}
              onClick={() => setActiveBuyerTab('downloads')}
            />
          )}
          {isOrganizer && (
            <StatCard
              icon={<Users className="w-5 h-5 text-blue-400" />}
              label="Хүсэлт"
              value={pendingCount}
              onClick={() => setActiveOrgTab('requests')}
            />
          )}
          {(isOrganizer || isPhotographer) && (
            <StatCard
              icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}
              label="Тооцоо"
              value="—"
              onClick={() => isOrganizer ? setActiveOrgTab('settlement') : undefined}
            />
          )}
          <StatCard
            icon={<Clock className="w-5 h-5 text-amber-400" />}
            label="Хүлээгдэж буй"
            value={walletBalance > 0 ? `₮${walletBalance.toLocaleString()}` : '₮0'}
            onClick={() => {
              if (isOrganizer) setActiveOrgTab('wallet');
              else if (isPhotographer) setActivePhotoTab('wallet');
              else if (isAdmin) setActiveAdminTab('wallet');
              else setActiveBuyerTab('wallet');
            }}
          />
        </div>

        {/* Organizer section */}
        {isOrganizer && (
          <section className="mb-10">
            <SectionHeading label="Зохион байгуулагч" />
            <div className="flex flex-wrap gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-fit mb-6">
              <TabButton active={activeOrgTab === 'albums'}     onClick={() => setActiveOrgTab('albums')}     icon={<FolderOpen className="w-4 h-4" />}  label="Цомог" />
              <TabButton active={activeOrgTab === 'requests'}   onClick={() => setActiveOrgTab('requests')}   icon={<Users className="w-4 h-4" />}      label="Хүсэлт" badge={pendingCount > 0 ? pendingCount : undefined} />
              <TabButton active={activeOrgTab === 'listings'}   onClick={() => setActiveOrgTab('listings')}   icon={<Briefcase className="w-4 h-4" />}   label="Зарлал" />
              <TabButton active={activeOrgTab === 'settlement'} onClick={() => setActiveOrgTab('settlement')} icon={<BarChart3 className="w-4 h-4" />}   label="Тооцоо" />
              <TabButton active={activeOrgTab === 'wallet'}     onClick={() => setActiveOrgTab('wallet')}     icon={<Wallet className="w-4 h-4" />}      label="Хэтэвч" />
            </div>

            {activeOrgTab === 'albums' && (
              <div className="bg-white/5 border border-white/10 rounded-2xl">
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                  <h2 className="text-white font-semibold">Миний цомгууд</h2>
                  <button
                    onClick={() => navigate('/dashboard/albums/create')}
                    className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Шинэ үүсгэх
                  </button>
                </div>
                {loadingAlbums ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
                  </div>
                ) : albums.length === 0 ? (
                  <div className="text-center py-16 px-6">
                    <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Camera className="w-7 h-7 text-stone-500" />
                    </div>
                    <p className="text-white font-medium mb-1">Цомог байхгүй байна</p>
                    <p className="text-stone-500 text-sm mb-5">Эхлэхийн тулд анхны арга хэмжээний цомгоо үүсгэнэ үү.</p>
                    <button
                      onClick={() => navigate('/dashboard/albums/create')}
                      className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Цомог үүсгэх
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {albums.map(album => (
                      <li key={album.id}>
                        <button
                          onClick={() => navigate(`/dashboard/albums/${album.id}`)}
                          className="w-full flex items-center gap-4 px-6 py-4 hover:bg-white/5 transition-colors text-left group"
                        >
                          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Camera className="w-5 h-5 text-amber-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{album.name}</p>
                            <p className="text-stone-500 text-sm">
                              {new Date(album.event_date).toLocaleDateString('mn-MN', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${statusBadge[album.status] ?? statusBadge.draft}`}>
                            {album.status}
                          </span>
                          <ChevronRight className="w-4 h-4 text-stone-600 group-hover:text-stone-400 transition-colors flex-shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {activeOrgTab === 'requests'   && <OrganizerRequestsTab />}
            {activeOrgTab === 'listings'   && <OrganizerListingsTab />}
            {activeOrgTab === 'settlement' && <SettlementTab />}
            {activeOrgTab === 'wallet'     && <WalletTab />}
          </section>
        )}

        {/* Photographer section */}
        {isPhotographer && (
          <section className="mb-10">
            {(isOrganizer || isAdmin) && <SectionHeading label="Зурагчин" />}
            <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-fit mb-6">
              <TabButton active={activePhotoTab === 'albums'} onClick={() => setActivePhotoTab('albums')} icon={<FolderOpen className="w-4 h-4" />} label="Миний цомог" />
              <TabButton active={activePhotoTab === 'wallet'} onClick={() => setActivePhotoTab('wallet')} icon={<Wallet className="w-4 h-4" />}     label="Хэтэвч" />
            </div>
            {activePhotoTab === 'albums' && <PhotographerAlbumsTab />}
            {activePhotoTab === 'wallet' && <WalletTab />}
          </section>
        )}

        {/* Admin section */}
        {isAdmin && (
          <section className="mb-10">
            <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-fit mb-6">
              <TabButton active={activeAdminTab === 'platform'} onClick={() => setActiveAdminTab('platform')} icon={<Shield className="w-4 h-4" />}   label="Платформ" />
              <TabButton active={activeAdminTab === 'wallet'}   onClick={() => setActiveAdminTab('wallet')}   icon={<Wallet className="w-4 h-4" />}    label="Хэтэвч" />
            </div>
            {activeAdminTab === 'platform' && <AdminPlatformTab />}
            {activeAdminTab === 'wallet'   && <WalletTab />}
          </section>
        )}

        {/* Buyer-only section */}
        {isBuyer && !isOrganizer && !isPhotographer && !isAdmin && (
          <section className="mb-10">
            {/* Action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <button
                onClick={() => addRole('photographer')}
                disabled={addingRole === 'photographer'}
                className="flex items-center gap-4 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-blue-500/30 rounded-2xl p-5 text-left transition-all duration-200 group"
              >
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  {addingRole === 'photographer'
                    ? <div className="w-5 h-5 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
                    : <Camera className="w-6 h-6 text-blue-400" />
                  }
                </div>
                <div>
                  <p className="text-white font-semibold text-sm mb-1">Зурагчин болох</p>
                  <p className="text-stone-500 text-xs">Цомогт нэгдэж, зургаа зарж орлого олоорой</p>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-700 group-hover:text-blue-400 transition-colors ml-auto flex-shrink-0" />
              </button>

              <button
                onClick={() => addRole('organizer')}
                disabled={addingRole === 'organizer'}
                className="flex items-center gap-4 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-amber-500/30 rounded-2xl p-5 text-left transition-all duration-200 group"
              >
                <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  {addingRole === 'organizer'
                    ? <div className="w-5 h-5 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                    : <FolderOpen className="w-6 h-6 text-amber-400" />
                  }
                </div>
                <div>
                  <p className="text-white font-semibold text-sm mb-1">Цомог үүсгэх</p>
                  <p className="text-stone-500 text-xs">Арга хэмжээний цомог үүсгэж зурагчидтай хамтар</p>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-700 group-hover:text-amber-400 transition-colors ml-auto flex-shrink-0" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-fit mb-6">
              <TabButton active={activeBuyerTab === 'purchases'} onClick={() => setActiveBuyerTab('purchases')} icon={<ShoppingBag className="w-4 h-4" />} label="Худалдан авалт" />
              <TabButton active={activeBuyerTab === 'downloads'} onClick={() => setActiveBuyerTab('downloads')} icon={<Download className="w-4 h-4" />}    label="Татсан зурагнууд" badge={activePurchases.length > 0 ? activePurchases.length : undefined} />
              <TabButton active={activeBuyerTab === 'wallet'}    onClick={() => setActiveBuyerTab('wallet')}    icon={<Wallet className="w-4 h-4" />}       label="Хэтэвч" />
            </div>

            {activeBuyerTab === 'purchases' && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                <div className="w-14 h-14 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Image className="w-7 h-7 text-blue-400" />
                </div>
                <p className="text-white font-medium mb-1">Арга хэмжээний зурагнуудыг үзэх</p>
                <p className="text-stone-500 text-sm max-w-sm mx-auto">
                  Зохион байгуулагчийн хуваалцсан цомгийн холбоосоор орж зурагнуудыг үзэж, худалдан авна уу.
                </p>
              </div>
            )}

            {activeBuyerTab === 'downloads' && (
              <div>
                {/* Warning */}
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-5">
                  <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-300 text-sm">
                    Татсан зурагнууд <span className="font-semibold">21 хоногийн</span> дотор татах боломжтой. Хугацаа дуусвал системээс устгагдана.
                  </p>
                </div>

                {loadingPurchases ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
                  </div>
                ) : activePurchases.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
                    <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Download className="w-7 h-7 text-stone-500" />
                    </div>
                    <p className="text-white font-medium mb-1">Татсан зураг байхгүй</p>
                    <p className="text-stone-500 text-sm">Цомгоос зураг худалдан авсны дараа энд харагдана.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {activePurchases.map(p => {
                      const days = daysLeft(p.expires_at);
                      const urgent = days <= 3;
                      return (
                        <div key={p.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden group">
                          <div className="relative aspect-square bg-stone-900">
                            {p.photo?.preview_url && (
                              <img
                                src={p.photo.preview_url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            )}
                            <div className={`absolute top-2 right-2 text-xs font-medium px-2 py-1 rounded-lg ${
                              urgent ? 'bg-red-500/80 text-white' : 'bg-black/60 text-stone-300'
                            }`}>
                              {days}өдөр
                            </div>
                          </div>
                          <div className="p-3">
                            <p className="text-stone-400 text-xs truncate mb-2">
                              {p.photo?.album?.name ?? 'Цомог'}
                            </p>
                            <a
                              href={p.photo?.original_url}
                              download
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-center gap-1.5 w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs py-1.5 rounded-lg transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Татах
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeBuyerTab === 'wallet' && <WalletTab />}
          </section>
        )}

        {/* Add role upsell — only if not already shown above */}
        {(canAddPhotographer || canAddOrganizer) && !isAdmin && (isOrganizer || isPhotographer) && (
          <section>
            <p className="text-stone-500 text-sm font-medium mb-3">Дүрэм нэмэх</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {canAddPhotographer && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-start gap-4">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Camera className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm mb-1">Зурагчин болох</p>
                    <p className="text-stone-500 text-xs mb-3">Цомогт нэгдэж, зургаа байршуулж, орлого олоорой.</p>
                    <button
                      onClick={() => addRole('photographer')}
                      disabled={addingRole === 'photographer'}
                      className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {addingRole === 'photographer'
                        ? <div className="w-3 h-3 border border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
                        : <UserPlus className="w-3.5 h-3.5" />
                      }
                      Зурагчин болох
                    </button>
                  </div>
                </div>
              )}
              {canAddOrganizer && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-start gap-4">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FolderOpen className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm mb-1">Зохион байгуулагч болох</p>
                    <p className="text-stone-500 text-xs mb-3">Цомог үүсгэж, зурагчидтай хамтран ажиллаарай.</p>
                    <button
                      onClick={() => addRole('organizer')}
                      disabled={addingRole === 'organizer'}
                      className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 hover:text-amber-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {addingRole === 'organizer'
                        ? <div className="w-3 h-3 border border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                        : <UserPlus className="w-3.5 h-3.5" />
                      }
                      Зохион байгуулагч болох
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="h-px flex-1 bg-white/10" />
      <span className="text-stone-500 text-xs font-medium uppercase tracking-widest">{label}</span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function StatCard({ icon, label, value, onClick }: {
  icon: React.ReactNode; label: string; value: string | number; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-2xl p-5 flex items-center gap-3 text-left transition-all duration-200 group w-full"
    >
      <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-stone-400 text-xs">{label}</p>
        <p className="text-white font-semibold text-lg leading-tight">{value}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-stone-700 group-hover:text-stone-400 transition-colors flex-shrink-0" />
    </button>
  );
}

function TabButton({
  active, onClick, icon, label, badge,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        active ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-white'
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
          active ? 'bg-stone-950/20 text-stone-950' : 'bg-amber-500 text-stone-950'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}
