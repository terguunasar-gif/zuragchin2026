import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Video } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/** AI бүүтийн «360° видео» — асаах/унтраах ба үнэ (зөвхөн сайтын админ) */
export default function AiVideoSetting() {
  const [enabled, setEnabled] = useState(true);
  const [price, setPrice] = useState('5000');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('platform_settings').select('key, value').in('key', ['ai_video_enabled', 'ai_video_price'])
      .then(({ data, error: err }) => {
        if (err) setError('Тохиргоо уншиж чадсангүй.');
        for (const r of data ?? []) {
          if (r.key === 'ai_video_enabled') setEnabled(r.value === true || r.value === 'true');
          if (r.key === 'ai_video_price') setPrice(String(Number(r.value) || 0));
        }
        if (!err && (data ?? []).length === 0) setError('SQL (ai_booth_video) ажиллуулаагүй байж магадгүй — хадгалахад үүснэ.');
        setLoading(false);
      });
  }, []);

  async function save() {
    const n = Math.round(Number(price));
    if (!Number.isFinite(n) || n < 0) { setError('Зөв үнэ оруулна уу'); return; }
    setSaving(true); setError('');
    const now = new Date().toISOString();
    const { error: err } = await supabase.from('platform_settings').upsert([
      { key: 'ai_video_enabled', value: enabled, updated_at: now },
      { key: 'ai_video_price', value: n, updated_at: now },
    ]);
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 bg-fuchsia-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
          <Video className="w-5 h-5 text-fuchsia-300" />
        </div>
        <div>
          <p className="text-white font-semibold">AI бүүт — 360° видео</p>
          <p className="text-stone-500 text-xs mt-0.5">
            Загвар сонгосны дараа зочин «AI зураг» эсвэл «360° видео»-г сонгоно. Видео: хүмүүс хөдөлгөөнгүй, камер тойрно (Google Veo).
            Видео цомогт орохгүй. Видео авсан хүн зургаа тусад нь (бүүтийн үнээр) авна. Орлого бүүтийн хуваарийн дагуу.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
          <input type="checkbox" checked={enabled} disabled={loading} onChange={e => setEnabled(e.target.checked)} className="w-4 h-4 accent-amber-500" />
          Идэвхтэй
        </label>
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
