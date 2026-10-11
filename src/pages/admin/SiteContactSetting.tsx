import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Phone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CONTACT_FIELDS } from '../../lib/siteContact';

/** Нүүр хуудасны доод хэсэгт харагдах холбоо барих мэдээлэл, сошиал хаяг — зөвхөн админ */
export default function SiteContactSetting() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('platform_settings').select('key, value').in('key', CONTACT_FIELDS.map(f => f.key))
      .then(({ data }) => setValues(Object.fromEntries((data ?? []).map(r => [r.key, typeof r.value === 'string' ? r.value : '']))));
  }, []);

  async function save() {
    setSaving(true); setError('');
    const rows = CONTACT_FIELDS.map(f => ({ key: f.key, value: (values[f.key] ?? '').trim(), updated_at: new Date().toISOString() }));
    const { error: err } = await supabase.from('platform_settings').upsert(rows);
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Phone className="w-4 h-4 text-amber-400" />
        <h3 className="text-white font-semibold">Холбоо барих ба сошиал хаяг</h3>
      </div>
      <p className="text-stone-500 text-xs mb-4">Нүүр хуудасны доод хэсэгт харагдана. Хоосон үлдээсэн талбар сайт дээр гарахгүй.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {CONTACT_FIELDS.map(f => (
          <label key={f.key} className="block">
            <span className="text-stone-400 text-xs">{f.label}</span>
            <input value={values[f.key] ?? ''} placeholder={f.placeholder}
              onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              className="mt-1 w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-600 outline-none" />
          </label>
        ))}
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
