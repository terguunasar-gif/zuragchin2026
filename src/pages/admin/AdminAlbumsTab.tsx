import { useEffect, useState } from 'react';
import { FolderOpen, ExternalLink, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AdminAlbum {
  id: string;
  name: string;
  event_date: string;
  status: string;
  share_link: string;
  download_price: number;
  created_at: string;
  owner_name: string;
  owner_email: string;
  photo_count: number;
  total_sales: number;
  total_revenue: number;
}

const STATUS_CFG: Record<string, string> = {
  active: 'text-green-400 bg-green-500/10 border-green-500/20',
  draft:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  closed: 'text-stone-400 bg-stone-500/10 border-stone-500/20',
};

export default function AdminAlbumsTab() {
  const [albums, setAlbums] = useState<AdminAlbum[]>([]);
  const [filtered, setFiltered] = useState<AdminAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let list = albums;
    if (statusFilter !== 'all') list = list.filter(a => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.owner_name.toLowerCase().includes(q));
    }
    setFiltered(list);
  }, [statusFilter, search, albums]);

  async function load() {
    setLoading(true);

    const { data: albumsData } = await supabase
      .from('albums')
      .select('id,name,event_date,status,share_link,download_price,created_at,owner_id,users(name,email)')
      .order('created_at', { ascending: false });

    if (!albumsData) { setLoading(false); return; }

    // Batch: photo counts + purchase stats per album
    const albumIds = albumsData.map(a => a.id);

    const [photosRes, purchasesRes] = await Promise.all([
      supabase.from('photo_uploads').select('album_id').in('album_id', albumIds),
      supabase.from('purchases').select('album_id,gross_amount').eq('payment_status', 'paid').in('album_id', albumIds),
    ]);

    const photoCountMap: Record<string, number> = {};
    for (const p of photosRes.data ?? []) {
      photoCountMap[p.album_id] = (photoCountMap[p.album_id] ?? 0) + 1;
    }

    const salesMap: Record<string, { count: number; revenue: number }> = {};
    for (const p of purchasesRes.data ?? []) {
      if (!salesMap[p.album_id]) salesMap[p.album_id] = { count: 0, revenue: 0 };
      salesMap[p.album_id].count++;
      salesMap[p.album_id].revenue += Number(p.gross_amount);
    }

    const enriched: AdminAlbum[] = albumsData.map(a => ({
      id: a.id,
      name: a.name,
      event_date: a.event_date,
      status: a.status,
      share_link: a.share_link ?? '',
      download_price: Number(a.download_price),
      created_at: a.created_at,
      owner_name: (a.users as { name: string; email: string } | null)?.name ?? '—',
      owner_email: (a.users as { name: string; email: string } | null)?.email ?? '',
      photo_count: photoCountMap[a.id] ?? 0,
      total_sales: salesMap[a.id]?.count ?? 0,
      total_revenue: salesMap[a.id]?.revenue ?? 0,
    }));

    setAlbums(enriched);
    setFiltered(enriched);
    setLoading(false);
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
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Цомог эсвэл эзэмшигчээр хайх…"
            className="w-full bg-white/5 border border-white/10 text-white placeholder-stone-600 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
          {['all', 'active', 'draft', 'closed'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                statusFilter === s ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-white'
              }`}
            >
              {s === 'all' ? 'Бүгд' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-2">
        {['active', 'draft', 'closed'].map(s => {
          const count = albums.filter(a => a.status === s).length;
          return (
            <span key={s} className={`text-xs font-medium border px-3 py-1 rounded-full ${STATUS_CFG[s]}`}>
              {count} {s}
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
                <th className="text-left px-6 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Цомог</th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Эзэмшигч</th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Төлөв</th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Зурагнууд</th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Борлуулалт</th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Орлого</th>
                <th className="text-right px-6 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Үйлдэл</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-stone-500 text-sm">
                    Цомог олдсонгүй.
                  </td>
                </tr>
              ) : filtered.map(a => (
                <tr key={a.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FolderOpen className="w-4 h-4 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium truncate max-w-[140px]">{a.name}</p>
                        <p className="text-stone-600 text-xs">
                          {new Date(a.event_date).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-stone-300 text-xs truncate max-w-[120px]">{a.owner_name}</p>
                    <p className="text-stone-600 text-xs truncate max-w-[120px]">{a.owner_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold border px-2.5 py-0.5 rounded-full capitalize ${STATUS_CFG[a.status] ?? STATUS_CFG.draft}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-stone-300 text-sm">{a.photo_count}</td>
                  <td className="px-4 py-3 text-right text-stone-300 text-sm">{a.total_sales}</td>
                  <td className="px-4 py-3 text-right text-green-400 font-semibold text-sm">
                    {a.total_revenue > 0 ? `₮${a.total_revenue.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {a.share_link ? (
                      <a
                        href={`/album/${a.share_link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Харах
                      </a>
                    ) : (
                      <span className="text-stone-600 text-xs">Линк байхгүй</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
