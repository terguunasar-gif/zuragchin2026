import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const FIELDS = [
  { key: 'ai_booth_price', label: 'AI бүүтийн нэг зургийн үнэ (шинэ бүүтэд)', unit: '₮', def: 5000, min: 0 },
  { key: 'min_photo_price', label: 'Зурагчны тавих зургийн доод үнэ', unit: '₮', def: 1000, min: 0 },
  { key: 'purchase_download_days', label: 'Худалдан авсан зургаа татах хугацаа', unit: 'хоног', def: 14, min: 1 },
  { key: 'payout_min', label: 'Зурагчин орлогоо татах доод дүн', unit: '₮', def: 10000, min: 0 },
] as const;

/**
 * Үнэ, төлбөрийн нэмэлт тохиргоо + нүүр хуудасны «Үнэ, төлбөр» хэсгийг асаах/унтраах — зөвхөн супер админ.
 * Цомгийн багц, сунгалт, түгжээ, AI видео зэрэг бусад үнийг өөрсдийн хэсэгт засна; нүүр хуудсанд бүгд автоматаар гарна.
 */
export default function PricingSetting() {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map(f => [f.key, String(f.def)])));
  const [showHome, setShowHome] = useState(true);
  const [applyBooths, setApplyBooths] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('platform_settings').select('key, value').in('key', [...FIELDS.map(f => f.key), 'home_pricing_enabled'])
      .then(({ data, error: err }) => {
        if (err) setError('Тохиргоо уншиж чадсангүй.');
        for (const r of (data ?? []) as { key: string; value: unknown }[]) {
          if (r.key === 'home_pricing_enabled') setShowHome(r.value === true || r.value === 'true');
          else setValues(v => ({ ...v, [r.key]: String(Number(r.value) || 0) }));
        }
        setLoading(false);
      });
  }, []);

  async function save() {
    const now = new Date().toISOString();
    const rows: { key: string; value: number | boolean; updated_at: string }[] = [];
    for (const f of FIELDS) {
      const n = Math.round(Number(values[f.key]));
      if (!Number.isFinite(n) || n < f.min) { setError(`«${f.label}» — зөв тоо оруулна уу`); return; }
      rows.push({ key: f.key, value: n, updated_at: now });
    }
    rows.push({ key: 'home_pricing_enabled', value: showHome, updated_at: now });
    setSaving(true); setError('');
    const { error: err } = await supabase.from('platform_settings').upsert(rows);
    let msg = 'Хадгалагдлаа';
    if (!err && applyBooths) {
      const boothPrice = Math.round(Number(values.ai_booth_price));
      const { data, error: e2 } = await supabase.from('album_ai_booths').update({ price_mnt: boothPrice })
        .neq('price_mnt', boothPrice).select('album_id');
      if (e2) { setSaving(false); setError('Үнэ хадгалагдсан ч бүүтүүдийг шинэчилж чадсангүй: ' + e2.message); return; }
      msg = `Хадгалагдлаа · ${data?.length ?? 0} бүүтийн үнэ шинэчлэгдлээ`;
      setApplyBooths(false);
    }
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return; }
    setSaved(msg); setTimeout(() => setSaved(''), 3000);
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 bg-amber-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
          <Receipt className="w-5 h-5 text-amber-300" />
        </div>
        <div>
          <p className="text-white font-semibold">Үнэ, төлбөр — нүүр хуудасны хэсэг</p>
          <p className="text-stone-500 text-xs mt-0.5">
            Нүүр хуудасны доод талд (танилцуулга видеоны доор) сайтын бүх үнэ автоматаар харагдана.
            Цомгийн багц, сунгалт, түгжээ, AI видеоны үнийг өөр өөрсдийн тохиргооноос засахад тэнд шууд шинэчлэгдэнэ.
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer mb-4">
        <input type="checkbox" checked={showHome} onChange={e => setShowHome(e.target.checked)} className="accent-amber-500" />
        Нүүр хуудсанд «Үнэ, төлбөр» хэсгийг харуулах
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map(f => (
          <label key={f.key} className="block">
            <span className="text-stone-400 text-xs">{f.label}</span>
            <div className="mt-1 relative">
              <input type="number" min={f.min} value={values[f.key]} disabled={loading}
                onChange={e => setValues(s => ({ ...s, [f.key]: e.target.value }))}
                className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl pl-3 pr-14 py-2 text-sm outline-none" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">{f.unit}</span>
            </div>
          </label>
        ))}
      </div>

      <label className="flex items-start gap-2 text-xs text-stone-400 cursor-pointer mt-3">
        <input type="checkbox" checked={applyBooths} onChange={e => setApplyBooths(e.target.checked)} className="accent-amber-500 mt-0.5" />
        <span>AI бүүтийн шинэ үнийг <b className="text-stone-300">одоо байгаа бүх бүүтэд</b> ч мөрдүүлэх (сонгохгүй бол зөвхөн шинээр үүсэх бүүтэд хэрэгжинэ)</span>
      </label>

      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      <button onClick={save} disabled={saving || loading}
        className="mt-4 flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold text-sm px-4 py-2 rounded-xl">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
        {saved || 'Хадгалах'}
      </button>
    </div>
  );
}
