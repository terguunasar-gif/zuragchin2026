import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Clapperboard, ImagePlus, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { albumVideoApi } from '../../lib/albumVideo';
import { supabase } from '../../lib/supabase';

interface Tpl {
  id: string; slug: string; name: string; description: string; emoji: string; prompt: string;
  sample_video_url: string; preview_url: string; tags: string; sort_order: number; is_active: boolean;
}

/** Сайтын админ: цомгийн AI видео загварууд + үнэ, орлогын хуваарь */
export default function AdminVideoTemplatesTab() {
  const [list, setList] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number; failed: number } | null>(null);

  /** Жишээ зураггүй бүх загварт AI зураг үүсгэнэ (нэг нэгээр) */
  async function generateMissing() {
    const todo = list.filter(t => !t.preview_url);
    if (!todo.length) { window.alert('Бүх загвар AI зурагтай байна.'); return; }
    if (!window.confirm(`${todo.length} загварт AI жишээ зураг үүсгэх үү? (нэг зураг ≈ 100–150₮, нэг нь 10–30 секунд)`)) return;
    setBulk({ done: 0, total: todo.length, failed: 0 });
    for (const t of todo) {
      try {
        const { previewUrl } = await albumVideoApi.adminPreview(t.id);
        setList(l => l.map(x => (x.id === t.id ? { ...x, preview_url: previewUrl } : x)));
        setBulk(b => b && { ...b, done: b.done + 1 });
      } catch (e) {
        console.error(t.name, e);
        setBulk(b => b && { ...b, done: b.done + 1, failed: b.failed + 1 });
      }
    }
  }

  async function load() {
    const { data, error: err } = await supabase.from('ai_video_templates').select('*').order('sort_order', { ascending: true });
    if (err) setError('Загвар уншиж чадсангүй — update-66-ийн SQL ажиллуулсан эсэхээ шалгана уу. (' + err.message + ')');
    setList((data ?? []) as Tpl[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    const sort = (list[list.length - 1]?.sort_order ?? 0) + 10;
    const { data, error: err } = await supabase.from('ai_video_templates').insert({
      slug: `custom-${Date.now().toString(36)}`, name: 'Шинэ загвар', emoji: '🎬', prompt: 'Describe the fun action here in English.',
      sort_order: sort, is_active: false,
    }).select('*').single();
    if (err) { window.alert(err.message); return; }
    setList(l => [...l, data as Tpl]);
    setOpen((data as Tpl).id);
  }

  return (
    <div className="space-y-5">
      <VideoPriceSetting />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg">AI видео загварууд</h2>
          <p className="text-stone-500 text-xs mt-0.5">
            Үйлдлийн тайлбарыг англиар бичнэ. «Эхний 2 секунд хөдөлгөөнгүй», царай хадгалах, бичиггүй байх дүрмийг систем автоматаар нэмнэ.
            Жишээ видео: өөрийн цомогт «Админ: төлбөргүй» сонголтоор бүтээгээд доороос сонгоно уу.
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col sm:flex-row gap-2">
        <button onClick={generateMissing} disabled={!!bulk && bulk.done < bulk.total}
          className="flex items-center gap-1.5 bg-fuchsia-500/15 hover:bg-fuchsia-500/25 border border-fuchsia-500/40 text-fuchsia-200 disabled:opacity-60 font-semibold px-4 py-2 rounded-xl text-sm">
          {bulk && bulk.done < bulk.total ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          {bulk && bulk.done < bulk.total ? `AI зураг ${bulk.done}/${bulk.total}…` : 'Зураггүйд AI зураг үүсгэх'}
        </button>
        <button onClick={add} className="flex-shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm">
          <Plus className="w-4 h-4" /> Загвар нэмэх
        </button>
        </div>
      </div>
      {bulk && bulk.done >= bulk.total && (
        <p className={`text-sm ${bulk.failed ? 'text-amber-300' : 'text-green-400'}`}>
          AI зураг үүсгэж дууслаа: {bulk.total - bulk.failed} амжилттай{bulk.failed ? `, ${bulk.failed} бүтсэнгүй (дахин дарна уу)` : ''}.
        </p>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {loading ? <Loader2 className="w-6 h-6 text-amber-400 animate-spin" /> : (
        <div className="space-y-2">
          {list.map(t => (
            <TemplateRow key={t.id} tpl={t} open={open === t.id} onToggle={() => setOpen(o => (o === t.id ? null : t.id))}
              onSaved={u => setList(l => l.map(x => (x.id === u.id ? u : x)))}
              onDeleted={() => setList(l => l.filter(x => x.id !== t.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateRow({ tpl, open, onToggle, onSaved, onDeleted }: {
  tpl: Tpl; open: boolean; onToggle: () => void; onSaved: (t: Tpl) => void; onDeleted: () => void;
}) {
  const [f, setF] = useState<Tpl>(tpl);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [made, setMade] = useState<{ id: string; video_url: string; poster_url: string }[]>([]);
  useEffect(() => setF(tpl), [tpl]);
  useEffect(() => {
    if (!open) return;
    supabase.from('album_ai_videos').select('id, video_url, poster_url').eq('template_id', tpl.id).eq('status', 'done')
      .order('created_at', { ascending: false }).limit(12)
      .then(({ data }) => setMade((data ?? []) as { id: string; video_url: string; poster_url: string }[]));
  }, [open, tpl.id]);

  const [genBusy, setGenBusy] = useState(false);
  async function genPreview() {
    setGenBusy(true);
    try {
      const { previewUrl } = await albumVideoApi.adminPreview(tpl.id);
      const next = { ...f, preview_url: previewUrl };
      setF(next); onSaved(next);
    } catch (e) {
      window.alert('AI зураг үүсгэж чадсангүй: ' + (e instanceof Error ? e.message : ''));
    } finally { setGenBusy(false); }
  }

  const set = <K extends keyof Tpl>(k: K, v: Tpl[K]) => setF(p => ({ ...p, [k]: v }));

  async function save(patch?: Partial<Tpl>) {
    const next = { ...f, ...patch };
    setSaving(true);
    const { error } = await supabase.from('ai_video_templates').update({
      name: next.name, emoji: next.emoji, description: next.description, tags: next.tags, prompt: next.prompt,
      sort_order: Number(next.sort_order) || 0, is_active: next.is_active,
      sample_video_url: next.sample_video_url, preview_url: next.preview_url, updated_at: new Date().toISOString(),
    }).eq('id', tpl.id);
    setSaving(false);
    if (error) { window.alert('Хадгалж чадсангүй: ' + error.message); return; }
    setF(next); onSaved(next);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function upload(file: File) {
    if (!/^video\/mp4$/.test(file.type)) { window.alert('MP4 видео сонгоно уу'); return; }
    setUploading(true);
    const path = `samples/${tpl.slug}-${Date.now()}.mp4`;
    const { error } = await supabase.storage.from('album-ai-videos').upload(path, file, { contentType: 'video/mp4', upsert: true });
    setUploading(false);
    if (error) { window.alert('Байршуулж чадсангүй: ' + error.message); return; }
    const { data: { publicUrl } } = supabase.storage.from('album-ai-videos').getPublicUrl(path);
    await save({ sample_video_url: publicUrl });
  }

  async function del() {
    if (!window.confirm(`«${tpl.name}» загварыг устгах уу?`)) return;
    const { error } = await supabase.from('ai_video_templates').delete().eq('id', tpl.id);
    if (error) { window.alert(error.message); return; }
    onDeleted();
  }

  const input = 'w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-3 py-2 text-sm outline-none';
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3 text-left">
        <div className="w-16 aspect-video rounded-lg bg-stone-900 overflow-hidden flex items-center justify-center flex-shrink-0">
          {f.sample_video_url ? <video src={f.sample_video_url} poster={f.preview_url || undefined} muted className="w-full h-full object-cover" />
            : f.preview_url ? <img src={f.preview_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-2xl">{f.emoji}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{f.emoji} {f.name}</p>
          <p className="text-stone-500 text-xs truncate">{f.description}</p>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${f.is_active ? 'bg-green-500/15 text-green-300' : 'bg-white/10 text-stone-400'}`}>
          {f.is_active ? 'Идэвхтэй' : 'Идэвхгүй'}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
      </button>
      {open && (
        <div className="border-t border-white/10 p-4 space-y-3">
          <div className="grid grid-cols-[80px_1fr_100px] gap-2">
            <input className={input} value={f.emoji} onChange={e => set('emoji', e.target.value)} placeholder="🎬" />
            <input className={input} value={f.name} onChange={e => set('name', e.target.value)} placeholder="Нэр" />
            <input className={input} type="number" value={f.sort_order} onChange={e => set('sort_order', Number(e.target.value))} title="Дараалал" />
          </div>
          <input className={input} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Тайлбар (эзэнд харагдана)" />
          <input className={input} value={f.tags} onChange={e => set('tags', e.target.value)} placeholder="Тохирох арга хэмжээ (жишээ нь: Хурим, төрсөн өдөр)" />
          <div>
            <p className="text-stone-400 text-xs mb-1">AI-д өгөх үйлдлийн тайлбар (англиар)</p>
            <textarea className={`${input} min-h-[110px] font-mono text-xs`} value={f.prompt} onChange={e => set('prompt', e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {f.preview_url && <img src={f.preview_url} alt="" className="w-40 aspect-video object-cover rounded-lg border border-white/10" />}
            <button onClick={genPreview} disabled={genBusy}
              className="flex items-center gap-1.5 text-xs bg-fuchsia-500/15 hover:bg-fuchsia-500/25 border border-fuchsia-500/40 text-fuchsia-200 rounded-lg px-3 py-2 disabled:opacity-60">
              {genBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
              {f.preview_url ? 'AI зургийг дахин үүсгэх' : 'AI жишээ зураг үүсгэх'}
            </button>
            {f.preview_url && (
              <button onClick={() => save({ preview_url: '' })} className="text-xs text-stone-400 hover:text-red-400">Зургийг хасах</button>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-stone-400 text-xs">Жишээ видео</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/15 text-white rounded-lg px-3 py-2 cursor-pointer">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} MP4 байршуулах
                <input type="file" accept="video/mp4" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ''; }} />
              </label>
              {f.sample_video_url && (
                <button onClick={() => save({ sample_video_url: '' })} className="text-xs text-stone-400 hover:text-red-400">Жишээг хасах</button>
              )}
            </div>
            {made.length > 0 && (
              <div>
                <p className="text-stone-500 text-[11px] mb-1">Энэ загвараар бүтээгдсэн видеоноос жишээ болгох:</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {made.map(m => (
                    <button key={m.id} onClick={() => save({ sample_video_url: m.video_url, preview_url: m.poster_url })}
                      className={`relative flex-shrink-0 w-28 aspect-video rounded-lg overflow-hidden border ${f.sample_video_url === m.video_url ? 'border-amber-400' : 'border-white/10'}`}>
                      <video src={m.video_url} poster={m.poster_url || undefined} muted className="w-full h-full object-cover"
                        onMouseEnter={e => e.currentTarget.play().catch(() => {})} onMouseLeave={e => e.currentTarget.pause()} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 text-sm text-stone-300">
              <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-amber-500" /> Идэвхтэй
            </label>
            <button onClick={() => save()} disabled={saving}
              className="ml-auto flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
              {saved ? 'Хадгалагдлаа' : 'Хадгалах'}
            </button>
            <button onClick={del} className="text-stone-500 hover:text-red-400 p-2" title="Устгах"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Үнэ, асаах/унтраах, цомгийн эзний хувь */
function VideoPriceSetting() {
  const [enabled, setEnabled] = useState(true);
  const [price, setPrice] = useState('10000');
  const [share, setShare] = useState('10');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('platform_settings').select('key, value')
      .in('key', ['album_video_enabled', 'album_video_price', 'album_video_owner_share'])
      .then(({ data, error: err }) => {
        if (err) setError('Тохиргоо уншиж чадсангүй.');
        for (const r of data ?? []) {
          if (r.key === 'album_video_enabled') setEnabled(r.value === true || r.value === 'true');
          if (r.key === 'album_video_price') setPrice(String(Number(r.value) || 0));
          if (r.key === 'album_video_owner_share') setShare(String(Math.round(Number(r.value) * 1000) / 10));
        }
        setLoading(false);
      });
  }, []);

  async function save() {
    const n = Math.round(Number(price));
    const sh = Number(share);
    if (!Number.isFinite(n) || n < 0) { setError('Зөв үнэ оруулна уу'); return; }
    if (!Number.isFinite(sh) || sh < 0 || sh > 100) { setError('Хувь 0–100 байна'); return; }
    setSaving(true); setError('');
    const now = new Date().toISOString();
    const { error: err } = await supabase.from('platform_settings').upsert([
      { key: 'album_video_enabled', value: enabled, updated_at: now },
      { key: 'album_video_price', value: n, updated_at: now },
      { key: 'album_video_owner_share', value: Math.round(sh * 10) / 1000, updated_at: now },
    ]);
    setSaving(false);
    if (err) { setError('Хадгалж чадсангүй: ' + err.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  const n = Number(price) || 0;
  const ownerAmt = Math.round(n * (Number(share) || 0) / 100);
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 bg-fuchsia-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
          <Clapperboard className="w-5 h-5 text-fuchsia-300" />
        </div>
        <div>
          <p className="text-white font-semibold">Цомгийн AI видео — үнэ</p>
          <p className="text-stone-500 text-xs mt-0.5">
            Цомгийн эзэн зургаа сонгоод загвараар 8 секундын видео бүтээнэ (Google Veo Fast 720p, ≈2,800₮ өртөгтэй).
            Цомгийн эзэнд {ownerAmt.toLocaleString()}₮, сайтад {(n - ownerAmt).toLocaleString()}₮ орно.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
          <input type="checkbox" checked={enabled} disabled={loading} onChange={e => setEnabled(e.target.checked)} className="w-4 h-4 accent-amber-500" />
          Идэвхтэй
        </label>
        <div className="relative w-36">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-sm">₮</span>
          <input type="number" min={0} step={1000} value={price} disabled={loading} onChange={e => setPrice(e.target.value)}
            className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl pl-7 pr-3 py-2 text-sm outline-none" />
        </div>
        <div className="relative w-36" title="Цомгийн эзэнд очих хувь">
          <input type="number" min={0} max={100} step={1} value={share} disabled={loading} onChange={e => setShare(e.target.value)}
            className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl pl-3 pr-16 py-2 text-sm outline-none" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">% эзэнд</span>
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
