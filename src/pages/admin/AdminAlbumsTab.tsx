import { useEffect, useState } from 'react';
import { FolderOpen, ExternalLink, Search, CalendarPlus, X, Loader2, MonitorPlay } from 'lucide-react';
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
  expires_at: string | null;
  files_purged_at: string | null;
  listed_until: string | null;
  listing_hidden: boolean;
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
  const [loadError, setLoadError] = useState('');
  const [extending, setExtending] = useState<AdminAlbum | null>(null);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let list = albums;
    if (statusFilter === 'listed') list = list.filter(a => isListed(a));
    else if (statusFilter !== 'all') list = list.filter(a => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.owner_name.toLowerCase().includes(q));
    }
    setFiltered(list);
  }, [statusFilter, search, albums]);

  async function load() {
    setLoading(true);

    setLoadError('');
    // `users!owner_id` — album_photographer_quota хүснэгт albums↔users хоёр дахь холбоо үүсгэдэг тул
    // FK-г заахгүй бол PostgREST «more than one relationship» алдаа өгч жагсаалт хоосон гардаг байсан.
    const COLS = 'id,name,event_date,status,share_link,download_price,created_at,owner_id,users!owner_id(name,email)';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let albumsData: any[] | null = null;
    let withExpiry = await supabase.from('albums').select(COLS + ',expires_at,files_purged_at,listed_until,listing_hidden').order('created_at', { ascending: false });
    if (withExpiry.error) withExpiry = await supabase.from('albums').select(COLS + ',expires_at,files_purged_at').order('created_at', { ascending: false });
    if (withExpiry.error) {
      const plain = await supabase.from('albums').select(COLS).order('created_at', { ascending: false });
      albumsData = plain.data;
      if (plain.error) setLoadError(plain.error.message);
    } else {
      albumsData = withExpiry.data;
    }

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
      expires_at: a.expires_at ?? null,
      files_purged_at: a.files_purged_at ?? null,
      listed_until: a.listed_until ?? null,
      listing_hidden: !!a.listing_hidden,
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
          {['all', 'active', 'draft', 'closed', 'listed'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                statusFilter === s ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-white'
              }`}
            >
              {s === 'all' ? 'Бүгд' : s === 'listed' ? 'Нийтлэгдсэн' : s}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3">
          Цомгуудыг ачаалж чадсангүй: {loadError}
        </div>
      )}

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
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Хаагдах</th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Нүүр хуудас</th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Зурагнууд</th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Борлуулалт</th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Орлого</th>
                <th className="text-right px-6 py-3 text-stone-500 font-medium text-xs uppercase tracking-wider">Үйлдэл</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-stone-500 text-sm">
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
                  <td className="px-4 py-3">
                    <ExpiryCell expiresAt={a.expires_at} purgedAt={a.files_purged_at} />
                    {!a.files_purged_at && (
                      <button onClick={() => setExtending(a)}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-amber-500/30 text-amber-300 hover:bg-amber-500/10">
                        <CalendarPlus className="w-3 h-3" /> Сунгах
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3"><ListingCell album={a} onChange={hidden => setAlbums(prev => prev.map(x => (x.id === a.id ? { ...x, listing_hidden: hidden } : x)))} /></td>
                  <td className="px-4 py-3 text-right text-stone-300 text-sm">{a.photo_count}</td>
                  <td className="px-4 py-3 text-right text-stone-300 text-sm">{a.total_sales}</td>
                  <td className="px-4 py-3 text-right text-green-400 font-semibold text-sm">
                    {a.total_revenue > 0 ? `₮${a.total_revenue.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {a.share_link ? (
                      <a
                        href={`/album/${a.share_link.replace(/^\/?album\//, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Харах
                      </a>
                    ) : null}
                    {a.share_link || a.id ? (
                      <a
                        href={`/album/${(a.share_link || a.id).replace(/^\/?album\//, "")}/kiosk`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Томоор үзүүлэх — зураг бүрийн хажууд сагсны QR"
                        className="ml-1.5 inline-flex items-center gap-1.5 text-xs text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <MonitorPlay className="w-3.5 h-3.5 text-amber-400" />
                        Томоор
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

      {extending && (
        <ExtendDialog
          album={extending}
          onClose={() => setExtending(null)}
          onDone={newExpiry => {
            setAlbums(prev => prev.map(x => (x.id === extending.id ? { ...x, expires_at: newExpiry } : x)));
            setExtending(null);
          }}
        />
      )}
    </div>
  );
}

/** Супер админ цомгийн хугацааг гараар сунгана (admin_extend_album RPC) */
function ExtendDialog({ album, onClose, onDone }: { album: AdminAlbum; onClose: () => void; onDone: (newExpiry: string) => void }) {
  const [days, setDays] = useState(30);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const base = Math.max(album.expires_at ? new Date(album.expires_at).getTime() : 0, Date.now());
  const preview = new Date(base + days * 86400000);
  const fmt = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

  async function submit() {
    if (!Number.isInteger(days) || days < 1 || days > 3650) { setErr('Хоногийн тоо 1–3650 байна'); return; }
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('admin_extend_album', { p_album_id: album.id, p_days: days, p_note: note });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone(String(data));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-sm bg-stone-900 border border-white/10 rounded-2xl p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white font-semibold flex items-center gap-2"><CalendarPlus className="w-4 h-4 text-amber-400" /> Хугацаа сунгах</p>
            <p className="text-stone-400 text-xs truncate mt-0.5">{album.name} · {album.owner_name}</p>
          </div>
          <button onClick={onClose} disabled={busy} className="text-stone-400 hover:text-white" aria-label="Хаах"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-2">
          {[7, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`flex-1 py-2 rounded-lg text-sm border ${days === d ? 'bg-amber-500 text-stone-950 border-amber-500 font-semibold' : 'border-white/10 text-stone-300 hover:bg-white/5'}`}>
              {d}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-stone-400 text-xs">Өөр хоног</span>
          <input type="number" min={1} max={3650} value={days} onChange={e => setDays(Math.round(Number(e.target.value)))}
            className="mt-1 w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/50" />
        </label>
        <label className="block">
          <span className="text-stone-400 text-xs">Тэмдэглэл (заавал биш)</span>
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Жишээ нь: бэлнээр төлсөн"
            className="mt-1 w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/50" />
        </label>

        <div className="bg-white/5 rounded-xl px-4 py-3 text-sm">
          <p className="text-stone-400 text-xs">Одоо: {album.expires_at ? fmt(new Date(album.expires_at)) : '—'}</p>
          <p className="text-white mt-0.5">Шинэ хугацаа: <b className="text-amber-300">{fmt(preview)}</b></p>
          <p className="text-stone-500 text-[11px] mt-1">Хугацаа дууссан бол өнөөдрөөс, дуусаагүй бол дуусах өдрөөс эхэлж нэмэгдэнэ. Төлбөргүй.</p>
        </div>

        {err && <p className="text-red-400 text-sm">{err}</p>}

        <button onClick={submit} disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold rounded-xl py-2.5 text-sm">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {days} хоногоор сунгах
        </button>
      </div>
    </div>
  );
}

function ExpiryCell({ expiresAt, purgedAt }: { expiresAt: string | null; purgedAt: string | null }) {
  if (purgedAt) return <span className="text-stone-500 text-xs">Файл устсан</span>;
  if (!expiresAt) return <span className="text-stone-600 text-xs">—</span>;
  const d = new Date(expiresAt);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return (
    <div className="whitespace-nowrap">
      <p className="text-stone-300 text-xs">{date}</p>
      <p className={`text-xs ${days <= 0 ? 'text-red-400 font-semibold' : days <= 7 ? 'text-amber-400' : 'text-stone-500'}`}>
        {days <= 0 ? `Дууссан (${-days} хоногийн өмнө)` : `${days} хоног үлдсэн`}
      </p>
    </div>
  );
}

const isListed = (a: AdminAlbum) => !!a.listed_until && new Date(a.listed_until).getTime() > Date.now();

/** Нүүр хуудсанд нийтлэгдсэн эсэх + админ нуух/харуулах */
function ListingCell({ album, onChange }: { album: AdminAlbum; onChange: (hidden: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  if (!album.listed_until) return <span className="text-stone-600 text-xs">—</span>;
  const d = new Date(album.listed_until);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  async function toggle() {
    const next = !album.listing_hidden;
    if (next && !confirm('Энэ цомгийг нүүр хуудаснаас нуух уу?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_listing_hidden', { p_album_id: album.id, p_hidden: next });
    setBusy(false);
    if (error) { alert(error.message); return; }
    onChange(next);
  }
  return (
    <div className="whitespace-nowrap space-y-1">
      <p className={`text-xs ${album.listing_hidden ? 'text-red-400' : days > 0 ? 'text-amber-300' : 'text-stone-500'}`}>
        {album.listing_hidden ? 'Нуусан' : days > 0 ? `📣 ${days} хоног` : 'Дууссан'}
      </p>
      {days > 0 && (
        <button onClick={toggle} disabled={busy}
          className="text-[11px] px-2 py-0.5 rounded-md border border-white/10 text-stone-300 hover:bg-white/10 disabled:opacity-50">
          {album.listing_hidden ? 'Буцааж харуулах' : 'Нуух'}
        </button>
      )}
    </div>
  );
}
