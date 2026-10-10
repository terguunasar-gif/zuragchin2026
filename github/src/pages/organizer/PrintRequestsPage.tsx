import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Phone, Printer, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PrintRequest {
  id: string;
  album_id: string;
  items: { photo_id: string; size: string; qty: number }[];
  buyer_name: string;
  buyer_phone: string;
  note: string;
  status: 'new' | 'contacted' | 'done' | 'cancelled';
  created_at: string;
}

const STATUS: Record<PrintRequest['status'], { label: string; cls: string }> = {
  new: { label: 'Шинэ', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  contacted: { label: 'Холбогдсон', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  done: { label: 'Хүлээлгэж өгсөн', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  cancelled: { label: 'Цуцалсан', cls: 'bg-stone-500/15 text-stone-400 border-stone-500/30' },
};

/** Үнэгүй цомгийн угаалгах хүсэлтүүд — зохион байгуулагч ба зурагчин */
export default function PrintRequestsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PrintRequest[]>([]);
  const [albums, setAlbums] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('print_requests').select('*').order('created_at', { ascending: false }).limit(300);
    const list = (data ?? []) as PrintRequest[];
    setRows(list);
    const albumIds = [...new Set(list.map(r => r.album_id))];
    const photoIds = [...new Set(list.flatMap(r => r.items.map(i => i.photo_id)))];
    const [{ data: a }, { data: p }] = await Promise.all([
      albumIds.length ? supabase.from('albums').select('id, name, title').in('id', albumIds) : Promise.resolve({ data: [] }),
      photoIds.length ? supabase.from('photo_uploads').select('id, preview_url').in('id', photoIds.slice(0, 500)) : Promise.resolve({ data: [] }),
    ]);
    setAlbums(Object.fromEntries((a ?? []).map((x: { id: string; name: string; title?: string }) => [x.id, x.title || x.name])));
    setPhotos(Object.fromEntries((p ?? []).map((x: { id: string; preview_url: string }) => [x.id, x.preview_url])));
    setLoading(false);
  }

  async function setStatus(r: PrintRequest, status: PrintRequest['status']) {
    setBusy(r.id);
    const { error } = await supabase.rpc('set_print_request_status', { p_id: r.id, p_status: status });
    setBusy(null);
    if (!error) setRows(prev => prev.map(x => (x.id === r.id ? { ...x, status } : x)));
  }

  const visible = useMemo(() => rows.filter(r => filter === 'all' || r.status === 'new' || r.status === 'contacted'), [rows, filter]);
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 bg-stone-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <Printer className="w-5 h-5 text-amber-400" />
          <p className="text-white font-bold flex-1">Угаалгах хүсэлтүүд</p>
          <button onClick={load} className="p-2 rounded-lg border border-white/10 text-stone-400 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        <p className="text-stone-500 text-xs leading-relaxed">
          «Үнэгүй хуваалцах» цомгийн зочдын угаалгах хүсэлт. Сайт төлбөр авахгүй — хүсэлт илгээгчтэй утсаар холбогдож үнэ, хүлээлгэн өгөхийг тохиролцоно уу.
        </p>
        <div className="flex gap-2">
          {(['open', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filter === f ? 'bg-amber-500 text-stone-950 border-amber-500' : 'text-stone-400 border-white/10'}`}>
              {f === 'open' ? 'Хийгдэх' : 'Бүгд'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-amber-400 animate-spin" /></div>
        ) : visible.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl py-12 text-center text-stone-500 text-sm">Хүсэлт алга</div>
        ) : visible.map(r => (
          <div key={r.id} className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-white font-semibold">{r.buyer_name}</p>
                <a href={`tel:${r.buyer_phone}`} className="text-sky-400 text-sm inline-flex items-center gap-1.5 mt-0.5"><Phone className="w-3.5 h-3.5" />{r.buyer_phone}</a>
                <p className="text-stone-500 text-xs mt-1">{albums[r.album_id] ?? 'Цомог'} · {fmt(r.created_at)}</p>
              </div>
              <select value={r.status} disabled={busy === r.id} onChange={e => setStatus(r, e.target.value as PrintRequest['status'])}
                className={`text-xs font-medium rounded-lg border px-2 py-1.5 bg-stone-900 outline-none ${STATUS[r.status].cls}`}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {r.note && <p className="text-stone-300 text-sm mt-2 bg-white/5 rounded-lg px-3 py-2">{r.note}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              {r.items.map((it, i) => (
                <div key={i} className="relative">
                  {photos[it.photo_id]
                    ? <img src={photos[it.photo_id]} alt="" className="w-20 h-20 object-cover rounded-lg" />
                    : <div className="w-20 h-20 rounded-lg bg-stone-800" />}
                  <span className="absolute bottom-1 left-1 right-1 text-center text-[10px] bg-stone-950/85 text-white rounded px-1">
                    {it.size.replace('x', '×')} · {it.qty}ш
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
