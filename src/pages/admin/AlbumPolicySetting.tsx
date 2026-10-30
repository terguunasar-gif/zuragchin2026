import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DEFAULT_EXTEND_OPTIONS, ExtendOption, normalizeExtendOptions } from '../../lib/albumExtend';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;

const FIELDS = [
  { key: 'album_open_days', label: 'Цомог нээлттэй байх хугацаа (үйл явдлаас хойш)', unit: 'хоног', def: 30 },
  { key: 'album_purge_after_days', label: 'Хаагдсанаас хойш файл устгах', unit: 'хоног', def: 60 },
  { key: 'album_lock_price', label: 'Цомгийг 4 оронтой кодоор түгжих үнэ (нэг цомогт нэг удаа)', unit: '₮', def: 10000 },
] as const;

interface CleanupReport { dryRun: boolean; purgeAfterDays: number; albums: { albumId: string; name: string; files: number }[] }

/** Цомгийн хугацааны журам — зөвхөн сайтын админ */
export default function AlbumPolicySetting() {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map(f => [f.key, String(f.def)])));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const [extendRows, setExtendRows] = useState<ExtendOption[]>(DEFAULT_EXTEND_OPTIONS);
  const [report, setReport] = useState<CleanupReport | null>(null);

  useEffect(() => {
    supabase.from('platform_settings').select('value').eq('key', 'album_extend_options').maybeSingle()
      .then(({ data }) => { if (data) setExtendRows(normalizeExtendOptions(data.value)); });
    supabase.from('platform_settings').select('key, value').in('key', FIELDS.map(f => f.key))
      .then(({ data, error: err }) => {
        if (err) setError('Тохиргоо уншиж чадсангүй. SQL (album_expiry) ажиллуулсан эсэхийг шалгана уу.');
        else setValues(v => ({ ...v, ...Object.fromEntries((data ?? []).map(r => [r.key, String(Number(r.value) || 0)])) }));
        setLoading(false);
      });
  }, []);

  async function save() {
    const rows = FIELDS.map(f => ({ key: f.key, value: Math.round(Number(values[f.key])), updated_at: new Date().toISOString() }));
    if (rows.some(r => !Number.isFinite(r.value) || r.value <= 0)) { setError('Бүх талбарт 0-ээс их тоо оруулна уу'); return; }
    const ext = extendRows.map(r => ({ days: Math.round(r.days), price: Math.round(r.price) }));
    if (ext.length === 0 || ext.some(r => !(r.days > 0) || !(r.price > 0))) { setError('Сунгалтын сонголт бүрт хоног, үнэ оруулна уу'); return; }
    if (new Set(ext.map(r => r.days)).size !== ext.length) { setError('Сунгалтын хоног давхардаж байна'); return; }
    ext.sort((a, b) => a.days - b.days);
    const now = new Date().toISOString();
    setSaving(true); setError('');
    const { error: err } = await supabase.from('platform_settings').upsert([
      ...rows,
      { key: 'album_extend_options', value: ext, updated_at: now },
      // Хуучин нэг үнийн тохиргоог эхний сонголттой ижил байлгана
      { key: 'album_extend_price', value: ext[0].price, updated_at: now },
      { key: 'album_extend_days', value: ext[0].days, updated_at: now },
    ]);
    if (!err) setExtendRows(ext);
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  async function cleanup(dryRun: boolean) {
    if (!dryRun && !confirm(`${report?.albums.length ?? 0} цомгийн зургийг бүрмөсөн устгах уу? Буцаах боломжгүй.`)) return;
    setCleaning(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${QPAY_FN_URL}/admin/cleanup-expired`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setReport(data);
    } catch (e) {
      setError('Цэвэрлэгээ амжилтгүй: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 bg-amber-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
          <Clock className="w-5 h-5 text-amber-300" />
        </div>
        <div>
          <p className="text-white font-semibold">Цомгийн хугацааны журам</p>
          <p className="text-stone-500 text-xs mt-0.5">
            Хугацаа дууссан цомгийн линк дээр «сунгах» төлбөр харагдана. Сунгах орлого платформд (QPay 1% хасагдана).
            Хаагдсанаас хойш заасан хоногт сунгаагүй бол зургийн файлыг доорх товчоор устгана.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        {FIELDS.map(f => (
          <label key={f.key} className="block">
            <span className="text-stone-400 text-xs">{f.label}</span>
            <div className="relative mt-1">
              <input type="number" min={1} value={values[f.key]} disabled={loading}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-3 py-2 pr-16 text-sm outline-none" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">{f.unit}</span>
            </div>
          </label>
        ))}
      </div>
      <div className="mb-4">
        <p className="text-stone-400 text-xs mb-1.5">Хугацаа сунгах сонголтууд (цомгийн эзэн самбараас, зочид хаагдсан цомгийн линкээс сонгож төлнө)</p>
        <div className="space-y-2">
          {extendRows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="relative w-28">
                <input type="number" min={1} value={r.days} disabled={loading}
                  onChange={e => setExtendRows(x => x.map((y, j) => (j === i ? { ...y, days: Number(e.target.value) } : y)))}
                  className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-3 py-2 pr-12 text-sm outline-none" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">хоног</span>
              </div>
              <div className="relative w-36">
                <input type="number" min={100} step={1000} value={r.price} disabled={loading}
                  onChange={e => setExtendRows(x => x.map((y, j) => (j === i ? { ...y, price: Number(e.target.value) } : y)))}
                  className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-3 py-2 pr-8 text-sm outline-none" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">₮</span>
              </div>
              <button onClick={() => setExtendRows(x => x.filter((_, j) => j !== i))} disabled={extendRows.length <= 1}
                className="text-stone-500 hover:text-red-400 disabled:opacity-30 p-1" title="Устгах"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <button onClick={() => setExtendRows(x => [...x, { days: (x[x.length - 1]?.days ?? 30) + 30, price: (x[x.length - 1]?.price ?? 10000) + 8000 }])}
          className="mt-2 flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-xs px-3 py-1.5 rounded-lg">
          <Plus className="w-3.5 h-3.5" /> Сонголт нэмэх
        </button>
      </div>
      <button onClick={save} disabled={saving || loading}
        className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
        {saved ? 'Хадгалагдлаа' : 'Хадгалах'}
      </button>

      <div className="border-t border-white/10 mt-5 pt-4">
        <p className="text-white text-sm font-medium mb-2">Хугацаа хэтэрсэн цомгийн файл цэвэрлэх</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => cleanup(true)} disabled={cleaning}
            className="bg-white/10 hover:bg-white/15 text-white text-sm px-4 py-2 rounded-xl disabled:opacity-50">
            {cleaning ? 'Шалгаж байна…' : 'Шалгах (устгахгүй)'}
          </button>
          {report?.dryRun && report.albums.length > 0 && (
            <button onClick={() => cleanup(false)} disabled={cleaning}
              className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm px-4 py-2 rounded-xl disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> {report.albums.length} цомгийн файлыг устгах
            </button>
          )}
        </div>
        {report && (
          <div className="mt-3 text-xs text-stone-400">
            {report.albums.length === 0
              ? 'Устгах цомог алга.'
              : <>
                  <p className="mb-1">{report.dryRun ? 'Устгагдах цомгууд:' : 'Устгагдсан:'}</p>
                  <ul className="space-y-0.5">
                    {report.albums.map(a => <li key={a.albumId}>• {a.name} — {a.files} файл</li>)}
                  </ul>
                </>}
          </div>
        )}
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  );
}
