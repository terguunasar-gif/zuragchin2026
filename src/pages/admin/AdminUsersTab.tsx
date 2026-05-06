import { useEffect, useState } from 'react';
import {
  Search, UserCog, ChevronDown, CheckCircle2, X,
  Loader2, Users, Mail, Calendar,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { UserRole } from '../../lib/supabase';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole[];
  created_at: string;
  total_earned: number;
}

const ROLES: UserRole[] = ['organizer', 'photographer', 'buyer', 'admin'];

const ROLE_COLOR: Record<string, string> = {
  organizer:    'text-amber-400 bg-amber-500/10 border-amber-500/20',
  photographer: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  buyer:        'text-green-400 bg-green-500/10 border-green-500/20',
  admin:        'text-red-400 bg-red-500/10 border-red-500/20',
};

export default function AdminUsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filtered, setFiltered] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const [roleModal, setRoleModal] = useState<{ user: AdminUser } | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(['buyer']);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    if (roleFilter !== 'all') list = list.filter(u => u.role.includes(roleFilter as UserRole));
    setFiltered(list);
  }, [search, roleFilter, users]);

  async function load() {
    setLoading(true);
    const { data: usersData } = await supabase
      .from('users')
      .select('id,email,name,role,created_at')
      .order('created_at', { ascending: false });

    const userList = usersData ?? [];

    // Fetch wallets for total_earned
    const { data: walletsData } = await supabase
      .from('wallets')
      .select('user_id,total_earned');
    const walletMap: Record<string, number> = {};
    for (const w of walletsData ?? []) walletMap[w.user_id] = Number(w.total_earned);

    const enriched: AdminUser[] = userList.map(u => ({
      ...u,
      role: (Array.isArray(u.role) ? u.role : [u.role]) as UserRole[],
      total_earned: walletMap[u.id] ?? 0,
    }));

    setUsers(enriched);
    setFiltered(enriched);
    setLoading(false);
  }

  function toggleSelectedRole(r: UserRole) {
    setSelectedRoles(prev => {
      if (r === 'buyer') return prev; // buyer always stays
      return prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r];
    });
  }

  async function changeRole() {
    if (!roleModal) return;
    setSaving(true);
    setSaveError('');
    const { error } = await supabase
      .from('users')
      .update({ role: selectedRoles })
      .eq('id', roleModal.user.id);
    if (error) { setSaveError(error.message); setSaving(false); return; }
    setUsers(prev => prev.map(u => u.id === roleModal.user.id ? { ...u, role: selectedRoles } : u));
    setRoleModal(null);
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + filter bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Нэр эсвэл имэйл хайх…"
            className="w-full bg-white/5 border border-white/10 text-white placeholder-stone-600 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
          {(['all', ...ROLES] as const).map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                roleFilter === r ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {ROLES.map(r => {
          const count = users.filter(u => u.role.includes(r)).length;
          return (
            <span key={r} className={`flex items-center gap-1.5 text-xs font-medium border px-3 py-1 rounded-full ${ROLE_COLOR[r]}`}>
              <Users className="w-3 h-3" />
              {count} {r}
            </span>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-stone-950/20">
                <th className="text-left px-6 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Хэрэглэгч</th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Имэйл</th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Дүр</th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Бүртгүүлсэн</th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Нийт орлого</th>
                <th className="text-right px-6 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Үйлдэл</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-stone-500 text-sm">
                    Хэрэглэгч олдсонгүй.
                  </td>
                </tr>
              ) : filtered.map(u => (
                <tr key={u.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-semibold">
                          {u.name?.charAt(0).toUpperCase() ?? '?'}
                        </span>
                      </div>
                      <span className="text-white font-medium truncate max-w-[140px]">{u.name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-stone-400 text-xs">
                      <Mail className="w-3 h-3 text-stone-600 flex-shrink-0" />
                      <span className="truncate max-w-[180px]">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.role.map(r => (
                        <span key={r} className={`inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded-full capitalize ${ROLE_COLOR[r] ?? ROLE_COLOR.buyer}`}>
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-stone-500 text-xs">
                      <Calendar className="w-3 h-3 text-stone-600" />
                      {new Date(u.created_at).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-semibold ${u.total_earned > 0 ? 'text-green-400' : 'text-stone-600'}`}>
                      ₮{u.total_earned.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => { setRoleModal({ user: u }); setSelectedRoles(u.role); setSaveError(''); }}
                      className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-colors ml-auto"
                    >
                      <UserCog className="w-3.5 h-3.5" />
                      Дүр өөрчлөх
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role change modal */}
      {roleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={() => setRoleModal(null)} />
          <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-white font-semibold">Дүр өөрчлөх</p>
              <button onClick={() => setRoleModal(null)} className="text-stone-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="bg-white/5 rounded-xl px-4 py-3 text-sm">
              <p className="text-white font-medium">{roleModal.user.name}</p>
              <p className="text-stone-500 text-xs">{roleModal.user.email}</p>
              <p className="text-stone-600 text-xs mt-1">
                Одоогийн дүр: <span className="capitalize text-stone-400">{roleModal.user.role.join(', ')}</span>
              </p>
            </div>

            {saveError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{saveError}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => {
                const checked = selectedRoles.includes(r);
                const isBuyer = r === 'buyer';
                return (
                  <button
                    key={r}
                    onClick={() => toggleSelectedRole(r)}
                    disabled={isBuyer}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium border transition-all capitalize ${
                      checked
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                        : 'bg-white/5 border-white/10 text-stone-400 hover:text-white hover:bg-white/10'
                    } ${isBuyer ? 'opacity-60 cursor-default' : ''}`}
                  >
                    {r}
                    {checked && <CheckCircle2 className="w-4 h-4" />}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={changeRole}
                disabled={saving || JSON.stringify([...selectedRoles].sort()) === JSON.stringify([...roleModal.user.role].sort())}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold py-2.5 rounded-xl transition-colors text-sm"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
                Хадгалах
              </button>
              <button onClick={() => setRoleModal(null)} className="px-4 text-stone-400 hover:text-white bg-white/5 border border-white/10 rounded-xl transition-colors text-sm">
                Цуцлах
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
