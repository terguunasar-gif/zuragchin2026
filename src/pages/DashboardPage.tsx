import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, LogOut, User, Plus, Image, Clock,
  CheckCircle2, FolderOpen, ChevronRight, Search,
  Users, Wallet, Shield, LayoutDashboard,
  ShoppingBag, ChevronDown, Settings, Briefcase,
  Download,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, hasRole } from '../lib/supabase';

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

export default function DashboardPage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const [albums, setAlbums] = useState<Album[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isOrganizer    = hasRole(profile, 'organizer');
  const isPhotographer = hasRole(profile, 'photographer');
  const isAdmin        = hasRole(profile, 'admin');
  const isBuyer        = hasRole(profile, 'buyer');

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
    const { data } = await supabase
      .from('albums')
      .select('id, name, event_date, status, created_at')
      .eq('owner_id', profile!.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setAlbums(data ?? []);
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

  function daysLeft(expiresAt: string): number {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  const activePurchases = purchases.filter(p => daysLeft(p.expires_at) > 0);

  const roleLabels: Record<string, string> = {
    buyer:        'Худалдан авагч',
    photographer: 'Зурагчин',
    organizer:    'Зохион байгуулагч',
    admin:        'Админ',
  };

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Header */}
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
              <button onClick={() => navigate('/admin')} className="hidden sm:flex items-center gap-2 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-xl transition-colors text-sm font-medium">
                <LayoutDashboard className="w-3.5 h-3.5" />Admin
              </button>
            )}
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setProfileDropdownOpen(o => !o)} className="flex items-center gap-2 text-stone-300 hover:text-white transition-colors bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-1.5">
                <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="hidden sm:block text-sm font-medium max-w-[120px] truncate">{profile?.name || profile?.email}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`} />
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
                    <button onClick={() => setProfileDropdownOpen(false)} className="w-full flex items-center gap-3 px-4 py-2.5 text-stone-300 hover:text-white hover:bg-white/5 transition-colors text-sm">
                      <Settings className="w-4 h-4" />Тохиргоо
                    </button>
                    <button onClick={() => { setProfileDropdownOpen(false); signOut(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors text-sm">
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
        {/* Title + action buttons */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-white text-3xl font-bold mb-1.5">
              Тавтай морилно уу, {profile?.name?.split(' ')[0] || ''}
            </h1>
            <div className="flex flex-wrap gap-2 mt-1">
              {profile?.role.map(r => (
                <span key={r} className="text-stone-400 text-sm">{roleLabels[r] ?? r}</span>
              ))}
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            {!isPhotographer && (
              <button onClick={() => navigate('/dashboard/photographer/register')} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-5 py-2.5 rounded-xl transition-all duration-200 text-sm">
                <Camera className="w-4 h-4" />Зурагчин болох
              </button>
            )}
            {isOrganizer && (
              <button onClick={() => navigate('/dashboard/albums/create')} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl transition-all duration-200">
                <Plus className="w-5 h-5" />Шинэ цомог
              </button>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isOrganizer && (
            <StatCard icon={<FolderOpen className="w-5 h-5 text-amber-400" />} label="Цомог" value={albums.length} />
          )}
          {isOrganizer && (
            <StatCard icon={<Users className="w-5 h-5 text-blue-400" />} label="Хүсэлт" value={pendingCount} />
          )}
          {isPhotographer && (
            <StatCard icon={<Image className="w-5 h-5 text-blue-400" />} label="Миний зураг" value="—" />
          )}
          {(isOrganizer || isPhotographer) && (
            <StatCard icon={<CheckCircle2 className="w-5 h-5 text-green-400" />} label="Тооцоо" value="—" />
          )}
          {isBuyer && !isOrganizer && !isPhotographer && !isAdmin && (
            <StatCard icon={<ShoppingBag className="w-5 h-5 text-blue-400" />} label="Татсан зураг" value={activePurchases.length} />
          )}
          {isAdmin && (
            <StatCard icon={<Shield className="w-5 h-5 text-red-400" />} label="Платформ" value="Admin" onClick={() => navigate('/admin')} />
          )}
          <StatCard icon={<Clock className="w-5 h-5 text-amber-400" />} label="Хүлээгдэж буй" value={walletBalance > 0 ? `₮${walletBalance.toLocaleString()}` : '₮0'} />
          <StatCard icon={<Wallet className="w-5 h-5 text-amber-400" />} label="Хэтэвч" value="—" />
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, onClick }: {
  icon: React.ReactNode; label: string; value: string | number; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-2xl p-5 flex items-center gap-3 text-left transition-all duration-200 group w-full">
      <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-stone-400 text-xs">{label}</p>
        <p className="text-white font-semibold text-lg leading-tight">{value}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-stone-700 group-hover:text-stone-400 transition-colors flex-shrink-0" />
    </button>
  );
}
