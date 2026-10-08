import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/** Цомог дахь AI бүүтийн зургийн татах үнэ — зөвхөн сайтын админ тохируулна. */
export default function AiAlbumPriceSetting() {
  const [price, setPrice] = useState('3000');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('platform_settings').select('value').eq('key', 'ai_album_price').maybeSingle()
      .then(({ data, error: err }) => {
        if (err) setError('Тохиргоо уншиж чадсангүй. SQL (platform_settings) ажиллуулсан эсэхийг шалгана уу.');
        else if (data) setPrice(String(Number(data.value) || 0));
        setLoading(false);
      });
  }, []);

  async function save() {
    const n = Math.round(Number(price));
    if (!Number.isFinite(n) || n < 0) { setError('Зөв үнэ оруулна уу'); return; }
    setSaving(true); setError('');
    const { error: err } = await supabase.from('platform_settings')
      .upsert({ key: 'ai_album_price', value: n, updated_at: new Date().toISOString() });
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 bg-fuchsia-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-fuchsia-300" />
        </div>
        <div>
          <p className="text-white font-semibold">Цомог дахь AI бүүтийн зургийн үнэ</p>
          <p className="text-stone-500 text-xs mt-0.5">
            AI бүүтээр үүссэн зургийг цомгоос бусад хүн татахад төлөх үнэ. Бүх цомогт нэг ижил.
            Орлого: QPay 1%, зохион байгуулагч 10%, үлдсэнийг платформ авна (зурагчинд хувь очихгүй).
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-40">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-sm">₮</span>
          <input type="number" min={0} step={500} value={price} disabled={loading}
            onChange={e => setPrice(e.target.value)}
            className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl pl-7 pr-3 py-2 text-sm outline-none" />
        </div>
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
