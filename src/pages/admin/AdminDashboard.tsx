import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, LogOut, LayoutDashboard, Users, FolderOpen,
  ArrowUpCircle, Wallet, ChevronRight, Shield,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import AdminOverviewTab from './AdminOverviewTab';
import AdminUsersTab from './AdminUsersTab';
import AdminAlbumsTab from './AdminAlbumsTab';
import AdminPayoutsTab from './AdminPayoutsTab';
import AdminWalletTab from './AdminWalletTab';

type AdminTab = 'overview' | 'users' | 'albums' | 'payouts' | 'wallet';

const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Нэгдсэн',   icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'users',    label: 'Хэрэглэгч', icon: <Users className="w-4 h-4" /> },
  { id: 'albums',   label: 'Цомог',      icon: <FolderOpen className="w-4 h-4" /> },
  { id: 'payouts',  label: 'Мөнгө татах', icon: <ArrowUpCircle className="w-4 h-4" /> },
  { id: 'wallet',   label: 'Платформ',   icon: <Wallet className="w-4 h-4" /> },
];

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <Camera className="w-5 h-5 text-stone-950" />
              </div>
              <div>
                <span className="text-white font-bold tracking-tight">Zuragchin</span>
                <span className="text-amber-400 font-bold">.mn</span>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-stone-500">
              <ChevronRight className="w-3.5 h-3.5" />
              <div className="flex items-center gap-1.5 text-amber-400">
                <Shield className="w-3.5 h-3.5" />
                <span className="text-sm font-medium">Admin</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="hidden sm:flex items-center gap-2 text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-1.5 rounded-xl transition-colors text-sm"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </button>
            <div className="flex items-center gap-2 text-stone-300">
              <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center">
                <Shield className="w-4 h-4 text-red-400" />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium leading-none">{profile?.name || profile?.email}</p>
                <p className="text-xs text-red-400 mt-0.5">Admin</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-stone-400 hover:text-white transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-white text-2xl font-bold mb-1">Admin Dashboard</h1>
          <p className="text-stone-400 text-sm">Zuragchin.mn платформын удирдлагын панел</p>
        </div>

        {/* Tab navigation — horizontal scroll on mobile */}
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 mb-8 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-amber-500 text-stone-950 shadow-sm'
                  : 'text-stone-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'overview' && <AdminOverviewTab />}
          {activeTab === 'users'    && <AdminUsersTab />}
          {activeTab === 'albums'   && <AdminAlbumsTab />}
          {activeTab === 'payouts'  && <AdminPayoutsTab />}
          {activeTab === 'wallet'   && <AdminWalletTab />}
        </div>
      </div>
    </div>
  );
}
