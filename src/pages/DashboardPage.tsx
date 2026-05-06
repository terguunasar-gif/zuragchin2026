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
    await supabase.from('profiles').update({ role: newRoles }).eq('id', profile.id);
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

  function DownloadButton({ url }: { url: string | undefined }) {
    if (!url) return null;
    return (
      <button
        onClick={() => window.open(url, '_blank')}
        className="flex items-center justify-center gap-1.5 w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs py-1.5 rounded-lg transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Татах
      </button>
    );
