import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Megaphone, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DEFAULT_LISTING_PACKAGES, ListingPackage, normalizeListingPackages } from '../../lib/listing';

/** Нүүр хуудсанд цомог нийтлэх багцууд — зөвхөн сайтын админ */
export default function ListingPackagesSetting() {
  const [rows, setRows] = useState<ListingPackage[]>(DEFAULT_LISTING_PACKAGES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('platform_settings').select('value').eq('key', 'listing_packages').maybeSingle()
      .then(({ data, error: err }) => {
        if (err) setError('Тохиргоо уншиж чадсангүй.');
        else if (data) setRows(normalizeListingPackages(data.value));
        else setError('SQL (album_listing) ажиллуулаагүй байж магадгүй — хадгалахад үүснэ.');
        setLoading(false);
      });
  }, []);

  const update = (i: number, patch: Partial<ListingPackage>) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    const clean = rows.map(r => ({ code: r.code.trim(), name: r.name.trim(), days: Math.round(r.days), price: Math.round(r.price) }));
    if (clean.length === 0 || clean.some(r => !r.code || !r.name || !(r.days > 0) || !(r.price > 0))) { setError('Бүх талбарыг зөв бөглөнө үү (үнэ 0-ээс их)'); return; }
    if (new Set(clean.map(r => r.code)).size !== clean.length) { setError('Код давхардаж байна'); return; }
    setSaving(true); setError('');
    const { error: err } = await supabase.from('platform_settings')
      .upsert({ key: 'listing_packages', value: clean, updated_at: new Date().toISOString() });
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return; }
    setRows(clean);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  const input = 'w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-lg px-2 py-1.5 text-sm outline-none';

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 bg-amber-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
          <Megaphone className="w-5 h-5 text-amber-300" />
        </div>
        <div>
          <p className="text-white font-semibold">Нүүр хуудсанд нийтлэх багцууд</p>
          <p className="text-stone-500 text-xs mt-0.5">
            «Худалдах» цомгийг нүүр хуудас ба «Бүх цомог»-д гаргах төлбөр. Орлого платформд (QPay 1% хасагдана).
            Зохисгүй цомгийг «Цомгууд» таб → «Нийтлэгдсэн» шүүлтүүрээс нууна.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1.4fr_0.8fr_1.2fr_32px] gap-2 text-[11px] text-stone-500 px-1">
          <span>Код</span><span>Нэр</span><span>Хоног</span><span>Үнэ ₮</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.4fr_0.8fr_1.2fr_32px] gap-2 items-center">
            <input className={input} value={r.code} disabled={loading} onChange={e => update(i, { code: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() })} />
            <input className={input} value={r.name} disabled={loading} onChange={e => update(i, { name: e.target.value })} />
            <input className={input} type="number" min={1} value={r.days} disabled={loading} onChange={e => update(i, { days: Number(e.target.value) })} />
            <input className={input} type="number" min={1000} step={1000} value={r.price} disabled={loading} onChange={e => update(i, { price: Number(e.target.value) })} />
            <button onClick={() => setRows(x => x.filter((_, j) => j !== i))} className="text-stone-500 hover:text-red-400 p-1" title="Устгах">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={() => setRows(x => [...x, { code: `l${x.length + 1}`, name: '14 хоног', days: 14, price: 9000 }])}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-sm px-3 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Багц нэмэх
        </button>
        <button onClick={save} disabled={saving || loading}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
          {saved ? 'Хадгалагдлаа' : 'Хадгалах'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  );
}
