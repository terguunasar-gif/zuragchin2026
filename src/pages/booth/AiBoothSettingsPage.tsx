import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ChevronLeft, Sparkles, Upload, Loader2, Check, Copy, Printer, RefreshCw,
  AlertCircle, Monitor, Smartphone, Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { POSITIONS, POSITION_LABELS } from '../../lib/aiBooth';

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  category: string;
  preview_url: string;
}

interface BoothRow {
  album_id: string;
  enabled: boolean;
  booth_token: string;
  price_mnt: number;
  owner_share: number;
  logo_url: string;
  logo_position: string;
  logo_size: number;
  overlay_text: string;
  text_position: string;
  text_color: string;
  template_ids: string[];
  add_to_album: boolean;
  closes_at: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  winter: 'Шинэ жил, өвөл',
  party: 'Үдэшлэг',
  mongolian: 'Монгол соёл',
  fun: 'Хөгжилтэй',
  general: 'Бусад',
};

const DEFAULTS: Omit<BoothRow, 'album_id' | 'booth_token'> = {
  enabled: true,
  price_mnt: 5000,
  owner_share: 0,
  logo_url: '',
  logo_position: 'top-left',
  logo_size: 22,
  overlay_text: '',
  text_position: 'bottom-center',
  text_color: '#ffffff',
  template_ids: [],
  add_to_album: true,
  closes_at: null,
};

export default function AiBoothSettingsPage() {
  const { albumId = '' } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [albumName, setAlbumName] = useState('');
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [form, setForm] = useState<Omit<BoothRow, 'album_id' | 'booth_token'>>(DEFAULTS);
  const [token, setToken] = useState('');
  const [exists, setExists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState('');
  const [stats, setStats] = useState<{ paid_count: number; done_count: number; revenue_mnt: number; owner_mnt: number } | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [albumId]);

  async function load() {
    setLoading(true);
    const { data: album } = await supabase.from('albums').select('*').eq('id', albumId).maybeSingle();
    if (!album) { setError('Цомог олдсонгүй эсвэл танд эрх байхгүй'); setLoading(false); return; }
    setAlbumName(album.title || album.name);

    const [{ data: tpls }, { data: booth }] = await Promise.all([
      supabase.from('ai_templates').select('id, name, description, category, preview_url')
        .eq('is_active', true).order('sort_order'),
      supabase.from('album_ai_booths').select('*').eq('album_id', albumId).maybeSingle(),
    ]);
    setTemplates(tpls ?? []);
    if (booth) {
      const { album_id: _a, booth_token, ...rest } = booth as BoothRow;
      void _a;
      setForm({ ...DEFAULTS, ...rest });
      setToken(booth_token);
      setExists(true);
      const { data: s } = await supabase.rpc('ai_booth_stats', { p_album_id: albumId });
      if (s) setStats(s);
    } else {
      setForm({ ...DEFAULTS, overlay_text: album.title || album.name || '' });
    }
    setLoading(false);
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function uploadLogo(file: File) {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) { setError('Лого 5MB-аас бага байх ёстой'); return; }
    setUploading(true);
    setError('');
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${user.id}/logo-${albumId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('ai-booth-assets')
      .upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data } = supabase.storage.from('ai-booth-assets').getPublicUrl(path);
    update('logo_url', data.publicUrl);
    setUploading(false);
  }

  async function save() {
    setSaving(true);
    setError('');
    const payload = {
      album_id: albumId,
      enabled: form.enabled,
      logo_url: form.logo_url,
      logo_position: form.logo_position,
      logo_size: form.logo_size,
      overlay_text: form.overlay_text.trim(),
      text_position: form.text_position,
      text_color: form.text_color,
      template_ids: form.template_ids,
      add_to_album: form.add_to_album,
      closes_at: form.closes_at || null,
    };
    const { data, error: err } = await supabase.from('album_ai_booths')
      .upsert(payload, { onConflict: 'album_id' }).select('booth_token, price_mnt').single();
    setSaving(false);
    if (err) { setError(err.message); return; }
    setToken(data.booth_token);
    setForm(f => ({ ...f, price_mnt: data.price_mnt }));
    setExists(true);
    setSaved(true);
  }

  async function rotate() {
    if (!confirm('Хуучин QR ажиллахаа болино. Шинэ QR үүсгэх үү?')) return;
    const { data, error: err } = await supabase.rpc('ai_booth_rotate_token', { p_album_id: albumId });
    if (err) { setError(err.message); return; }
    setToken(data as string);
  }

  function toggleTemplate(id: string) {
    const all = templates.map(t => t.id);
    const current = form.template_ids.length === 0 ? all : form.template_ids;
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    update('template_ids', next.length === all.length ? [] : next);
  }

  const isSelected = (id: string) => form.template_ids.length === 0 || form.template_ids.includes(id);
  const selectedCount = form.template_ids.length === 0 ? templates.length : form.template_ids.length;

  const boothUrl = token ? `${window.location.origin}/booth/${token}` : '';
  const kioskUrl = boothUrl ? `${boothUrl}?kiosk=1` : '';

  const grouped = useMemo(() => {
    const g: Record<string, TemplateRow[]> = {};
    for (const t of templates) (g[t.category] ??= []).push(t);
    return g;
  }, [templates]);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      {/* ── Хэвлэх постер (зөвхөн хэвлэхэд харагдана) ── */}
      {boothUrl && (
        <div className="hidden print:flex fixed inset-0 bg-white text-black flex-col items-center justify-center p-12 text-center">
          {form.logo_url && <img src={form.logo_url} alt="" className="max-h-28 mb-6" />}
          <h1 className="text-5xl font-extrabold mb-3">AI зургийн бүүт</h1>
          <p className="text-2xl mb-8">{albumName}</p>
          <QRCodeSVG value={boothUrl} size={420} level="M" />
          <ol className="text-2xl mt-10 space-y-2 text-left">
            <li>1. Утасныхаа камераар QR уншуулна</li>
            <li>2. Загвараа сонгоод QPay-ээр төлнө (₮{form.price_mnt.toLocaleString()})</li>
            <li>3. 1–4 хүн зогсоод зургаа дарна</li>
            <li>4. AI зураг тань утсанд тань ирнэ</li>
          </ol>
          <p className="mt-10 text-lg text-gray-500">zuragchin.mn</p>
        </div>
      )}

      <header className="border-b border-white/10 print:hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-stone-950" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">AI бүүт</p>
            <p className="text-xs text-stone-500 truncate">{albumName}</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 grid lg:grid-cols-[1fr_320px] gap-8 print:hidden">
        <div className="space-y-6">
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Идэвхжүүлэх */}
          <Section title="Бүүт">
            <Toggle label="AI бүүт идэвхтэй" checked={form.enabled} onChange={v => update('enabled', v)} />
            <Toggle
              label="Зочин зөвшөөрвөл зургийг энэ цомогт нэмэх"
              hint="Цомгийн хаалттай линкээр бусад зурагтай хамт харагдана"
              checked={form.add_to_album}
              onChange={v => update('add_to_album', v)}
            />
            <div>
              <label className="text-sm text-stone-400 block mb-1.5">Бүүт хаагдах огноо (заавал биш)</label>
              <input
                type="datetime-local"
                value={form.closes_at ? toLocalInput(form.closes_at) : ''}
                onChange={e => update('closes_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <p className="text-sm text-stone-400">
              Нэг зургийн үнэ: <span className="text-amber-400 font-semibold">₮{form.price_mnt.toLocaleString()}</span>
              <span className="text-stone-600"> (платформ тогтооно)</span>
            </p>
          </Section>

          {/* Лого */}
          <Section title="Лого">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center overflow-hidden">
                {form.logo_url ? <img src={form.logo_url} alt="" className="max-w-full max-h-full object-contain" />
                  : <span className="text-xs text-stone-600">Лого алга</span>}
              </div>
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm cursor-pointer">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Лого оруулах (PNG тунгалаг фонтой)
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                    onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                </label>
                {form.logo_url && (
                  <button onClick={() => update('logo_url', '')} className="flex items-center gap-1.5 text-xs text-red-400">
                    <Trash2 className="w-3.5 h-3.5" /> Устгах
                  </button>
                )}
              </div>
            </div>
            <PositionPicker label="Логоны байрлал" value={form.logo_position} onChange={v => update('logo_position', v)} />
            <div>
              <label className="text-sm text-stone-400 block mb-1.5">Логоны хэмжээ: {form.logo_size}%</label>
              <input type="range" min={8} max={45} value={form.logo_size}
                onChange={e => update('logo_size', Number(e.target.value))} className="w-full accent-amber-500" />
            </div>
          </Section>

          {/* Бичиг */}
          <Section title="Арга хэмжээний нэр (зураг дээр)">
            <input
              value={form.overlay_text}
              onChange={e => update('overlay_text', e.target.value)}
              maxLength={60}
              placeholder="Жишээ: ABC ХХК — Шинэ жил 2027"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm"
            />
            <div className="flex items-center gap-3">
              <label className="text-sm text-stone-400">Өнгө</label>
              <input type="color" value={form.text_color} onChange={e => update('text_color', e.target.value)}
                className="w-10 h-8 bg-transparent border border-white/10 rounded" />
            </div>
            <PositionPicker label="Бичгийн байрлал" value={form.text_position} onChange={v => update('text_position', v)} />
          </Section>

          {/* Темплетүүд */}
          <Section title={`Темплетүүд (${selectedCount}/${templates.length})`}>
            <div className="flex gap-2 text-xs">
              <button onClick={() => update('template_ids', [])} className="text-amber-400">Бүгдийг сонгох</button>
            </div>
            {Object.entries(grouped).map(([cat, list]) => (
              <div key={cat}>
                <p className="text-xs uppercase tracking-wider text-stone-500 mb-2">{CATEGORY_LABELS[cat] ?? cat}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {list.map(t => (
                    <button key={t.id} onClick={() => toggleTemplate(t.id)}
                      className={`text-left rounded-xl border p-3 transition-all ${
                        isSelected(t.id) ? 'border-amber-500/60 bg-amber-500/10' : 'border-white/10 bg-white/5 opacity-60'
                      }`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{t.name}</p>
                        {isSelected(t.id) && <Check className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                      </div>
                      {t.description && <p className="text-xs text-stone-500 mt-1 line-clamp-2">{t.description}</p>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Section>

          <button onClick={save} disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold py-3.5 rounded-xl">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : saved ? <Check className="w-5 h-5" /> : null}
            {saved ? 'Хадгалагдлаа' : exists ? 'Хадгалах' : 'AI бүүт үүсгэх'}
          </button>
        </div>

        {/* ── Баруун тал: урьдчилсан харагдац, QR, статистик ── */}
        <aside className="space-y-6">
          <div>
            <p className="text-sm text-stone-400 mb-2">Урьдчилсан харагдац</p>
            <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-gradient-to-br from-sky-900 via-indigo-900 to-stone-900">
              <div className="absolute inset-x-[20%] top-[25%] bottom-0 bg-white/10 rounded-t-full" />
              {form.logo_url && (
                <img src={form.logo_url} alt="" className="absolute" style={{ ...posStyle(form.logo_position), width: `${form.logo_size}%` }} />
              )}
              {form.overlay_text && (
                <p className="absolute font-bold text-sm whitespace-nowrap drop-shadow"
                  style={{ ...posStyle(form.text_position), color: form.text_color }}>
                  {form.overlay_text}
                </p>
              )}
            </div>
          </div>

          {boothUrl && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
              <p className="font-semibold">Бүүтийн QR</p>
              <div className="bg-white rounded-xl p-3 flex justify-center">
                <QRCodeSVG value={boothUrl} size={200} level="M" />
              </div>
              <LinkRow icon={<Smartphone className="w-4 h-4" />} label="Утасны линк" url={boothUrl}
                copied={copied === 'phone'} onCopy={() => copy(boothUrl, 'phone')} />
              <LinkRow icon={<Monitor className="w-4 h-4" />} label="Kiosk дэлгэцийн линк" url={kioskUrl}
                copied={copied === 'kiosk'} onCopy={() => copy(kioskUrl, 'kiosk')} />
              <div className="flex gap-2">
                <button onClick={() => window.print()}
                  className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 rounded-xl py-2 text-sm">
                  <Printer className="w-4 h-4" /> Постер хэвлэх
                </button>
                <button onClick={rotate} title="Шинэ QR"
                  className="flex items-center justify-center bg-white/10 hover:bg-white/15 rounded-xl px-3 text-sm">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-stone-500">
                Энэ QR зөвхөн зураг үүсгэх эрх өгнө — бусдын зургийг харуулахгүй.
              </p>
            </div>
          )}

          {stats && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Төлсөн" value={stats.paid_count} />
              <Stat label="Бэлэн зураг" value={stats.done_count} />
              <Stat label="Нийт орлого" value={`₮${Number(stats.revenue_mnt).toLocaleString()}`} />
              {Number(stats.owner_mnt) > 0 && <Stat label="Таны хувь" value={`₮${Number(stats.owner_mnt).toLocaleString()}`} />}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

function posStyle(pos: string): React.CSSProperties {
  const m = '5%';
  switch (pos) {
    case 'top-left': return { top: m, left: m };
    case 'top-center': return { top: m, left: '50%', transform: 'translateX(-50%)' };
    case 'top-right': return { top: m, right: m };
    case 'middle-left': return { top: '50%', left: m, transform: 'translateY(-50%)' };
    case 'center': return { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
    case 'middle-right': return { top: '50%', right: m, transform: 'translateY(-50%)' };
    case 'bottom-left': return { bottom: m, left: m };
    case 'bottom-center': return { bottom: m, left: '50%', transform: 'translateX(-50%)' };
    default: return { bottom: m, right: m };
  }
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <span>
        <span className="text-sm">{label}</span>
        {hint && <span className="block text-xs text-stone-500 mt-0.5">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="mt-1 w-5 h-5 accent-amber-500 flex-shrink-0" />
    </label>
  );
}

function PositionPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-sm text-stone-400 mb-1.5">{label}: <span className="text-white">{POSITION_LABELS[value]}</span></p>
      <div className="grid grid-cols-3 gap-1 w-32">
        {POSITIONS.map(p => (
          <button key={p} type="button" onClick={() => onChange(p)} title={POSITION_LABELS[p]}
            className={`h-8 rounded-md border ${value === p ? 'bg-amber-500 border-amber-500' : 'bg-white/5 border-white/10 hover:bg-white/10'}`} />
        ))}
      </div>
    </div>
  );
}

function LinkRow({ icon, label, url, copied, onCopy }: {
  icon: React.ReactNode; label: string; url: string; copied: boolean; onCopy: () => void;
}) {
  return (
    <div>
      <p className="text-xs text-stone-500 flex items-center gap-1.5 mb-1">{icon}{label}</p>
      <div className="flex gap-2">
        <input readOnly value={url} className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-stone-300" />
        <button onClick={onCopy} className="bg-white/10 hover:bg-white/15 rounded-lg px-2.5">
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-stone-500 text-xs">{label}</p>
      <p className="text-white font-semibold">{value}</p>
    </div>
  );
}
