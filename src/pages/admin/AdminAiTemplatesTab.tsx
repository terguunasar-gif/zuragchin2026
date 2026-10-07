import { useEffect, useState } from 'react';
import { Plus, Save, Loader2, Upload, ChevronDown, ChevronUp, AlertCircle, Check, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Template {
  id?: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  scene_prompt: string;
  composition_overrides: Record<string, string>;
  preview_url: string;
  style_ref_url: string;
  aspect_ratio: string;
  sort_order: number;
  is_active: boolean;
  allow_text?: boolean;
}

const EMPTY: Template = {
  slug: '', name: '', description: '', category: 'winter', scene_prompt: '',
  composition_overrides: {}, preview_url: '', style_ref_url: '', aspect_ratio: '3:4',
  sort_order: 500, is_active: false,
};

const CATEGORIES = [
  ['winter', 'Шинэ жил, өвөл'], ['party', 'Үдэшлэг'], ['mongolian', 'Монгол соёл'],
  ['fun', 'Хөгжилтэй'], ['general', 'Бусад'],
];
const RATIOS = ['3:4', '4:5', '2:3', '1:1', '4:3', '9:16'];

// Жишээ зурагт олон янзын бүрэлдэхүүн харуулахын тулд хүний тоог ээлжлүүлнэ
const PREVIEW_PEOPLE = [2, 1, 3, 2, 4];

async function generatePreview(templateId: string, peopleCount: number): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Дахин нэвтэрнэ үү');
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-booth/admin/preview`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ templateId, peopleCount }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.previewUrl) throw new Error(data.error || `Алдаа (${res.status})`);
  return data.previewUrl as string;
}

export default function AdminAiTemplatesTab() {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number; current: string; errors: string[] } | null>(null);

  useEffect(() => { load(); }, []);

  async function generateMissing() {
    const targets = items.filter(t => t.id && !t.preview_url);
    if (targets.length === 0) { alert('Бүх темплетэд жишээ зураг байна.'); return; }
    if (!confirm(`${targets.length} темплетэд жишээ зураг AI-аар үүсгэх үү? (~${targets.length * 300}₮ зардал, хэдэн минут болно)`)) return;
    const errors: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      setBulk({ done: i, total: targets.length, current: t.name, errors });
      try {
        await generatePreview(t.id!, PREVIEW_PEOPLE[i % PREVIEW_PEOPLE.length]);
      } catch (e) {
        errors.push(`${t.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    setBulk({ done: targets.length, total: targets.length, current: '', errors });
    await load();
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('ai_templates').select('*').order('sort_order');
    setItems((data ?? []) as Template[]);
    setLoading(false);
  }

  if (loading) return <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">AI бүүтийн темплетүүд</h2>
          <p className="text-stone-500 text-sm">
            Prompt нь зөвхөн орчин, хувцас, гэрлийг тайлбарлана (англиар). Нүүр хадгалах дүрэм, хүний тоо, логоны зай автоматаар нэмэгдэнэ.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
        <button onClick={generateMissing} disabled={!!bulk && bulk.done < bulk.total}
          className="flex items-center gap-2 bg-fuchsia-500/15 hover:bg-fuchsia-500/25 border border-fuchsia-500/30 text-fuchsia-200 font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> Жишээ зураг үүсгэх
        </button>
        <button onClick={() => { setItems(i => [{ ...EMPTY }, ...i]); setOpen('new'); }}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm flex-shrink-0">
          <Plus className="w-4 h-4" /> Шинэ
        </button>
        </div>
      </div>

      {bulk && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm space-y-2">
          {bulk.done < bulk.total ? (
            <p className="flex items-center gap-2 text-stone-300">
              <Loader2 className="w-4 h-4 animate-spin text-fuchsia-300" />
              {bulk.done + 1}/{bulk.total} — {bulk.current} үүсгэж байна… Хуудсаа бүү хаа.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-green-400"><Check className="w-4 h-4" /> Дууслаа ({bulk.total - bulk.errors.length}/{bulk.total} амжилттай)</p>
          )}
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-fuchsia-400 transition-all" style={{ width: `${(bulk.done / bulk.total) * 100}%` }} />
          </div>
          {bulk.errors.map((e, i) => <p key={i} className="text-red-400 text-xs">{e}</p>)}
        </div>
      )}

      {items.map((t, idx) => {
        const key = t.id ?? 'new';
        return (
          <TemplateCard
            key={key + idx + (t.preview_url || "")}
            template={t}
            open={open === key}
            onToggle={() => setOpen(open === key ? null : key)}
            onSaved={load}
          />
        );
      })}
    </div>
  );
}

function TemplateCard({ template, open, onToggle, onSaved }: {
  template: Template; open: boolean; onToggle: () => void; onSaved: () => void;
}) {
  const [t, setT] = useState<Template>(template);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  const set = <K extends keyof Template>(k: K, v: Template[K]) => { setT(p => ({ ...p, [k]: v })); setOk(false); };

  async function upload(file: File, field: 'preview_url' | 'style_ref_url') {
    const slug = t.slug || 'template';
    const path = `templates/${slug}-${field === 'preview_url' ? 'preview' : 'ref'}-${Date.now()}.${file.name.split('.').pop() || 'jpg'}`;
    const { error: e } = await supabase.storage.from('ai-booth-assets').upload(path, file, { contentType: file.type, upsert: true });
    if (e) { setError(e.message); return; }
    set(field, supabase.storage.from('ai-booth-assets').getPublicUrl(path).data.publicUrl);
  }

  const [genBusy, setGenBusy] = useState(false);
  async function regenerate() {
    if (!t.id) { setError('Эхлээд темплетээ хадгална уу'); return; }
    setGenBusy(true); setError('');
    try {
      const url = await generatePreview(t.id, PREVIEW_PEOPLE[Math.floor(Math.random() * PREVIEW_PEOPLE.length)]);
      setT(p => ({ ...p, preview_url: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setGenBusy(false); }
  }

  async function save() {
    if (!t.slug.trim() || !t.name.trim() || !t.scene_prompt.trim()) {
      setError('slug, нэр, prompt заавал'); return;
    }
    setSaving(true);
    setError('');
    const overrides = Object.fromEntries(
      Object.entries(t.composition_overrides ?? {}).filter(([, v]) => v && v.trim()),
    );
    const payload = { ...t, slug: t.slug.trim(), composition_overrides: overrides, updated_at: new Date().toISOString() };
    const { error: e } = t.id
      ? await supabase.from('ai_templates').update(payload).eq('id', t.id)
      : await supabase.from('ai_templates').insert(payload);
    setSaving(false);
    if (e) { setError(e.message); return; }
    setOk(true);
    if (!t.id) onSaved();
  }

  const input = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white';

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left">
        {t.preview_url
          ? <img src={t.preview_url} alt="" className="w-10 h-12 object-cover rounded-md" />
          : <div className="w-10 h-12 rounded-md bg-white/10" />}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{t.name || 'Шинэ темплет'}</p>
          <p className="text-stone-500 text-xs truncate">{t.slug} · {t.category} · #{t.sort_order}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active ? 'bg-green-500/10 text-green-400' : 'bg-white/10 text-stone-400'}`}>
          {t.is_active ? 'Идэвхтэй' : 'Идэвхгүй'}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-4">
          {error && <p className="flex items-center gap-2 text-red-400 text-sm"><AlertCircle className="w-4 h-4" />{error}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Нэр (монгол)"><input className={input} value={t.name} onChange={e => set('name', e.target.value)} /></Field>
            <Field label="Slug (англи, давтагдахгүй)"><input className={input} value={t.slug} onChange={e => set('slug', e.target.value)} /></Field>
            <Field label="Тайлбар"><input className={input} value={t.description} onChange={e => set('description', e.target.value)} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Ангилал">
                <select className={input} value={t.category} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Харьцаа">
                <select className={input} value={t.aspect_ratio} onChange={e => set('aspect_ratio', e.target.value)}>
                  {RATIOS.map(r => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Дараалал">
                <input type="number" className={input} value={t.sort_order} onChange={e => set('sort_order', Number(e.target.value))} />
              </Field>
            </div>
          </div>

          <Field label="Scene prompt (англиар: орчин, хувцас, гэрэл)">
            <textarea rows={5} className={input} value={t.scene_prompt} onChange={e => set('scene_prompt', e.target.value)} />
          </Field>

          <details className="text-sm">
            <summary className="text-stone-400 cursor-pointer">Хүний тоогоор байрлалыг дарж бичих (заавал биш)</summary>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              {['1', '2', '3', '4'].map(n => (
                <Field key={n} label={`${n} хүн`}>
                  <input className={input} placeholder="Хоосон = стандарт байрлал"
                    value={t.composition_overrides?.[n] ?? ''}
                    onChange={e => set('composition_overrides', { ...t.composition_overrides, [n]: e.target.value })} />
                </Field>
              ))}
            </div>
          </details>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <ImageField label="Жишээ зураг (зочдод харагдана)" url={t.preview_url} onFile={f => upload(f, 'preview_url')} onClear={() => set('preview_url', '')} />
              <button type="button" onClick={regenerate} disabled={genBusy}
                className="inline-flex items-center gap-1.5 text-xs bg-fuchsia-500/15 hover:bg-fuchsia-500/25 border border-fuchsia-500/30 text-fuchsia-200 rounded-lg px-3 py-1.5 disabled:opacity-50">
                {genBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {genBusy ? 'Үүсгэж байна…' : 'AI-аар жишээ үүсгэх'}
              </button>
            </div>
            <ImageField label="Орчны лавлах зураг (AI-д өгнө, хүнгүй)" url={t.style_ref_url} onFile={f => upload(f, 'style_ref_url')} onClear={() => set('style_ref_url', '')} />
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-sm text-stone-300">
              <input type="checkbox" checked={!!t.allow_text} onChange={e => set('allow_text', e.target.checked)} className="w-4 h-4 accent-amber-500" />
              Зураг дотор бичиг зөвшөөрөх
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-300">
              <input type="checkbox" checked={t.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-amber-500" />
              Идэвхтэй (бүүтэд харагдана)
            </label>
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : ok ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {ok ? 'Хадгалагдлаа' : 'Хадгалах'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-stone-500 block mb-1">{label}</span>
      {children}
    </label>
  );
}

function ImageField({ label, url, onFile, onClear }: {
  label: string; url: string; onFile: (f: File) => void; onClear: () => void;
}) {
  return (
    <div>
      <span className="text-xs text-stone-500 block mb-1">{label}</span>
      <div className="flex items-center gap-3">
        {url ? <img src={url} alt="" className="w-14 h-16 object-cover rounded-md" /> : <div className="w-14 h-16 rounded-md bg-white/10" />}
        <label className="inline-flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/15 rounded-lg px-3 py-1.5 cursor-pointer text-stone-300">
          <Upload className="w-3.5 h-3.5" /> Оруулах
          <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {url && <button onClick={onClear} className="text-xs text-red-400">Арилгах</button>}
      </div>
    </div>
  );
}
