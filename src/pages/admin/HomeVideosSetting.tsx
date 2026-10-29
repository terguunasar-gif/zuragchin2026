import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Youtube } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseYouTube } from '../../components/YouTubeAutoplay';

export const HOME_VIDEO_FIELDS = [
  { key: 'home_booth_youtube', label: 'AI зургийн бүүт хэсгийн видео' },
  { key: 'home_ai_video_youtube', label: 'AI видео хэсгийн видео' },
  { key: 'home_about_youtube', label: 'Zuragchin.mn-ийн танилцуулга видео (нүүрийн доод хэсэг, холбоо барихын дээр)' },
] as const;

/** Нүүр хуудасны AI хэсгүүд болон доод хэсгийн танилцуулгад тоглох YouTube видео — зөвхөн админ */
export default function HomeVideosSetting() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('platform_settings').select('key, value').in('key', HOME_VIDEO_FIELDS.map(f => f.key))
      .then(({ data }) => setValues(Object.fromEntries((data ?? []).map(r => [r.key, typeof r.value === 'string' ? r.value : '']))));
  }, []);

  async function save() {
    for (const f of HOME_VIDEO_FIELDS) {
      const v = (values[f.key] ?? '').trim();
      if (v && !parseYouTube(v)) { setError(`«${f.label}» — YouTube холбоос буруу байна`); return; }
    }
    setSaving(true); setError('');
    const rows = HOME_VIDEO_FIELDS.map(f => ({ key: f.key, value: (values[f.key] ?? '').trim(), updated_at: new Date().toISOString() }));
    const { error: err } = await supabase.from('platform_settings').upsert(rows);
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Youtube className="w-4 h-4 text-red-400" />
        <h3 className="text-white font-semibold">Нүүр хуудасны танилцуулга видео (YouTube)</h3>
      </div>
      <p className="text-stone-500 text-xs mb-4">
        YouTube-ийн холбоосыг (энгийн эсвэл Shorts) хуулж тавина. Зочин доош гүйлгэж хэсэгт хүрэхэд дуугүйгээр автоматаар тоглож давтагдана.
        Хоосон үлдээвэл видео харагдахгүй.
      </p>
      <div className="space-y-3">
        {HOME_VIDEO_FIELDS.map(f => {
          const v = values[f.key] ?? '';
          const ok = parseYouTube(v);
          return (
            <label key={f.key} className="block">
              <span className="text-stone-400 text-xs">{f.label}</span>
              <div className="mt-1 flex items-center gap-3">
                <input value={v} placeholder="https://www.youtube.com/watch?v=… эсвэл https://youtube.com/shorts/…"
                  onChange={e => setValues(s => ({ ...s, [f.key]: e.target.value }))}
                  className="flex-1 bg-stone-900 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-600 outline-none" />
                {ok && <img src={`https://i.ytimg.com/vi/${ok.id}/mqdefault.jpg`} alt="" className="w-20 h-12 object-cover rounded-md border border-white/10" />}
              </div>
            </label>
          );
        })}
      </div>
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      <button onClick={save} disabled={saving}
        className="mt-4 flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold text-sm px-4 py-2 rounded-xl">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
        {saved ? 'Хадгалагдлаа' : 'Хадгалах'}
      </button>
    </div>
  );
}
