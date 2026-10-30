import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DEFAULT_GUEST_PACKAGES, GuestPackage, normalizeGuestPackages } from '../../lib/guestPhotos';

/** «Зочдын зураг» багцууд (цомгийн эзэн нэг удаа төлж, зочдын нийт зургийн хязгаар нэмэгдэнэ) — зөвхөн сайтын админ */
export default function GuestPackagesSetting() {
  const [rows, setRows] = useState<GuestPackage[]>(DEFAULT_GUEST_PACKAGES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('platform_settings').select('value').eq('key', 'guest_photo_packages').maybeSingle()
      .then(({ data, error: err }) => {
        if (err) setError('Тохиргоо уншиж чадсангүй.');
        else if (data) setRows(normalizeGuestPackages(data.value));
        else setError('SQL (guest_photos) ажиллуулаагүй байж магадгүй — хадгалахад үүснэ.');
        setLoading(false);
      });
  }, []);

  const update = (i: number, patch: Partial<GuestPackage>) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    const clean = rows.map(r => ({ code: r.code.trim(), name: r.name.trim(), photos: Math.round(r.photos), price: Math.round(r.price) }));
    if (clean.length === 0 || clean.some(r => !r.code || !r.name || !(r.photos > 0) || !(r.price > 0))) { setError('Бүх талбарыг зөв бөглөнө үү'); return; }
    if (new Set(clean.map(r => r.code)).size !== clean.length) { setError('Код давхардаж байна'); return; }
    setSaving(true); setError('');
    const now = new Date().toISOString();
    const { error: err } = await supabase.from('platform_settings').upsert({ key: 'guest_photo_packages', value: clean, updated_at: now });
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return; }
    setRows(clean);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  const input = 'w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-lg px-2 py-1.5 text-sm outline-none';

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 bg-emerald-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
          <Users className="w-5 h-5 text-emerald-300" />
        </div>
        <div>
          <p className="text-white font-semibold">Зочдын зургийн багц</p>
          <p className="text-stone-500 text-xs mt-0.5">
            Цомгийн эзэн нэг удаа төлж, зочид утсаар авсан зургаа цомогт үнэгүй хуваалцана (зарагдахгүй).
            «Зураг» — тухайн цомогт бүх зочид нийлж оруулах зургийн тоо. Зураг ~1 MB болж шахагдана.
            Орлого платформд (QPay 1% хасагдана). Санал: 1,000 зурагт ≈3,300₮ зардал гэж тооцож үнэ тогтооно.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1.4fr_1fr_1.2fr_32px] gap-2 text-[11px] text-stone-500 px-1">
          <span>Код</span><span>Нэр</span><span>Зураг</span><span>Үнэ ₮</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.4fr_1fr_1.2fr_32px] gap-2 items-center">
            <input className={input} value={r.code} disabled={loading} onChange={e => update(i, { code: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() })} />
            <input className={input} value={r.name} disabled={loading} onChange={e => update(i, { name: e.target.value })} />
            <input className={input} type="number" min={1} value={r.photos} disabled={loading} onChange={e => update(i, { photos: Number(e.target.value) })} />
            <input className={input} type="number" min={100} step={500} value={r.price} disabled={loading} onChange={e => update(i, { price: Number(e.target.value) })} />
            <button onClick={() => setRows(x => x.filter((_, j) => j !== i))} className="text-stone-500 hover:text-red-400 p-1" title="Устгах">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={() => setRows(x => [...x, { code: `g${x.length + 1}`, name: 'Шинэ', photos: 1000, price: 8000 }])}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-sm px-3 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Багц нэмэх
        </button>
        <button onClick={save} disabled={saving || loading}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
          {saved ? 'Хадгалагдлаа' : 'Хадгалах'}
        </button>
      </div>
    </div>
  );
}
