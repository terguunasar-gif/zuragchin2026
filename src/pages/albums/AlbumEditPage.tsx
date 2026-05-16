import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera, ArrowLeft, Save, AlertCircle, CheckCircle2,
  Type, Image as ImageIcon, Upload, X, Loader2, Plus, Grid,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type WatermarkPosition =
  | 'top-left'    | 'top-center'    | 'top-right'
  | 'middle-left' | 'center'        | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

const POSITION_GRID: WatermarkPosition[][] = [
  ['top-left',    'top-center',    'top-right'],
  ['middle-left', 'center',        'middle-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
];

const POSITION_LABELS: Record<WatermarkPosition, string> = {
  'top-left':      'Зүүн дээр',    'top-center':    'Дунд дээр',   'top-right':     'Баруун дээр',
  'middle-left':   'Зүүн дунд',   'center':         'Төв',          'middle-right':  'Баруун дунд',
  'bottom-left':   'Зүүн доор',   'bottom-center':  'Дунд доор',   'bottom-right':  'Баруун доор',
};

const POS_STYLE: Record<WatermarkPosition, React.CSSProperties> = {
  'top-left':      { top: '8%',  left: '6%' },
  'top-center':    { top: '8%',  left: '50%', transform: 'translateX(-50%)' },
  'top-right':     { top: '8%',  right: '6%' },
  'middle-left':   { top: '50%', left: '6%',  transform: 'translateY(-50%)' },
  'center':        { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' },
  'middle-right':  { top: '50%', right: '6%', transform: 'translateY(-50%)' },
  'bottom-left':   { bottom: '8%', left: '6%' },
  'bottom-center': { bottom: '8%', left: '50%', transform: 'translateX(-50%)' },
  'bottom-right':  { bottom: '8%', right: '6%' },
};

type LayerType = 'text' | 'logo' | 'tiled-text';

interface WatermarkLayer {
  id: string;
  type: LayerType;
  text: string;
  fontSize: number;
  color: string;
  logoUrl: string;
  logoPreview: string;
  logoSize: number;
  position: WatermarkPosition;
  opacity: number;
  imageSize?: number;
  imagePreview?: string;
}

interface SizePrice { size: string; label: string; price: string; enabled: boolean; }

const SIZE_PRICES_DEFAULT: SizePrice[] = [
  { size: 'digital', label: 'Дижитал файл — Татаж авах',       price: '', enabled: true  },
  { size: '10x15',   label: '10x15 см — 1200x1800px',          price: '', enabled: true  },
  { size: '13x18',   label: '13x18 см — 1535x2126px',          price: '', enabled: false },
  { size: '15x21',   label: '15x21 см — 1772x2480px (A5)',     price: '', enabled: false },
  { size: '20x30',   label: '20x30 см — 2362x3543px',          price: '', enabled: false },
  { size: '30x40',   label: '30x40 см — 3543x4724px',          price: '', enabled: false },
  { size: '40x60',   label: '40x60 см — 4724x7087px (Постер)', price: '', enabled: false },
];

function makeTextLayer(): WatermarkLayer {
  return { id: crypto.randomUUID(), type: 'text', text: '© Zuragchin.mn', fontSize: 24, color: '#ffffff', logoUrl: '', logoPreview: '', logoSize: 20, position: 'bottom-right', opacity: 70 };
}
function makeLogoLayer(): WatermarkLayer {
  return { id: crypto.randomUUID(), type: 'logo', text: '', fontSize: 24, color: '#ffffff', logoUrl: '', logoPreview: '', logoSize: 20, position: 'top-left', opacity: 80 };
}
function makeTiledTextLayer(): WatermarkLayer {
  return { id: crypto.randomUUID(), type: 'tiled-text', text: '© Zuragchin.mn', fontSize: 16, color: '#ffffff', logoUrl: '', logoPreview: '', logoSize: 20, position: 'center', opacity: 30 };
}

// watermark_value JSON-г parse хийж WatermarkLayer[] болгох
function parseWatermarkValue(raw: string | null | undefined): WatermarkLayer[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((l: any) => {
      // CreateAlbumPage-ийн format → AlbumEditPage format руу хөрвүүлэх
      const type: LayerType =
        l.type === 'image' ? 'logo' :
        l.type === 'tiled-text' ? 'tiled-text' :
        'text';
      const opacityRaw = l.opacity ?? 0.7;
      const opacity = opacityRaw <= 1 ? Math.round(opacityRaw * 100) : opacityRaw;
      const pos = (l.position || 'bottom-right') as WatermarkPosition;
      return {
        id: l.id || crypto.randomUUID(),
        type,
        text: l.text || '',
        fontSize: l.fontSize || 24,
        color: l.color || '#ffffff',
        logoUrl: l.imagePreview || '',
        logoPreview: l.imagePreview || '',
        logoSize: l.imageSize || 20,
        position: pos,
        opacity,
        imageSize: l.imageSize,
        imagePreview: l.imagePreview,
      };
    });
  } catch { return null; }
}

// Save хийхдээ watermark_value-д хадгалах формат
function layersToWatermarkValue(layers: WatermarkLayer[]): string {
  return JSON.stringify(layers.map(l => ({
    id: l.id,
    type: l.type === 'logo' ? 'image' : l.type,
    text: l.text,
    fontSize: l.fontSize,
    opacity: l.opacity / 100,
    color: l.color,
    imagePreview: l.logoUrl || l.imagePreview || '',
    position: l.position,
    imageSize: l.logoSize || l.imageSize || 20,
  })));
}

// ── Preview ──────────────────────────────────────────────────────────────────
function WatermarkPreview({ layers }: { layers: WatermarkLayer[] }) {
  return (
    <div className="mt-4">
      <p className="text-stone-400 text-xs mb-2">Урьдчилан харах</p>
      <div className="relative w-full rounded-xl overflow-hidden bg-stone-800 select-none" style={{ aspectRatio: '4/3' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900" />
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon className="w-12 h-12 text-stone-600" />
        </div>
        {/* Булангийн layer-үүд */}
        {layers.filter(l => l.type !== 'tiled-text').map(layer => {
          const posStyle = POS_STYLE[layer.position] ?? POS_STYLE['bottom-right'];
          const opacityVal = layer.opacity > 1 ? layer.opacity / 100 : layer.opacity;
          return (
            <div key={layer.id} className="absolute pointer-events-none" style={{ ...posStyle, opacity: opacityVal, maxWidth: '45%' }}>
              {layer.type === 'text' && layer.text && (
                <span style={{ fontSize: `${Math.max(8, layer.fontSize * 0.35)}px`, color: layer.color || '#fff', fontWeight: 600, whiteSpace: 'nowrap', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                  {layer.text}
                </span>
              )}
              {layer.type === 'logo' && layer.logoPreview && (
                <img src={layer.logoPreview} alt="wm" draggable={false}
                  style={{ width: `${(layer.logoSize ?? 20) * 2}px`, height: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))' }} />
              )}
            </div>
          );
        })}
        {/* Tiled-text layer-үүд */}
        {layers.filter(l => l.type === 'tiled-text').map(layer => {
          const items = [];
          for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
            items.push(
              <span key={`${r}-${c}`} className="select-none whitespace-nowrap font-semibold block"
                style={{ fontSize: `${Math.max(6, layer.fontSize * 0.28)}px`, color: layer.color, opacity: layer.opacity / 100, transform: 'rotate(-30deg)', padding: '3px 6px' }}>
                {layer.text}
              </span>
            );
          }
          return (
            <div key={layer.id} className="absolute inset-0 pointer-events-none overflow-hidden"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', alignItems: 'center', justifyItems: 'center' }}>
              {items}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function AlbumEditPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');

  const [albumName, setAlbumName]     = useState('');
  const [eventDate, setEventDate]     = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus]           = useState('draft');
  const [isFree, setIsFree]           = useState(false);

  const [layers, setLayers]               = useState<WatermarkLayer[]>([makeTextLayer()]);
  const [activeId, setActiveId]           = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [sizePrices, setSizePrices] = useState<SizePrice[]>(SIZE_PRICES_DEFAULT);

  useEffect(() => { if (albumId && profile) loadAlbum(); }, [albumId, profile]);

  async function loadAlbum() {
    const { data, error } = await supabase.from('albums').select('*').eq('id', albumId).eq('owner_id', profile!.id).maybeSingle();
    if (error || !data) { setError('Цомог олдсонгүй'); setLoading(false); return; }

    setAlbumName(data.title || data.name || '');
    setEventDate(data.event_date?.slice(0, 10) || '');
    setDescription(data.description || '');
    setStatus(data.status || 'draft');
    setIsFree(data.is_free ?? false);

    // watermark_value (шинэ формат) → layers
    const fromValue = parseWatermarkValue(data.watermark_value);
    if (fromValue && fromValue.length > 0) {
      setLayers(fromValue);
      setActiveId(fromValue[0].id);
    } else {
      // watermark_layers (хуучин формат)
      let wml = data.watermark_layers;
      if (typeof wml === 'string') { try { wml = JSON.parse(wml); } catch { wml = null; } }
      if (wml && Array.isArray(wml) && wml.length > 0) {
        const restored = wml.map((l: WatermarkLayer) => ({ ...l, logoSize: l.logoSize ?? 20, logoPreview: l.logoUrl || '' }));
        setLayers(restored);
        setActiveId(restored[0].id);
      } else {
        // Хамгийн хуучин нэг layer формат
        const l = makeTextLayer();
        l.text     = data.watermark_value || '© Zuragchin.mn';
        l.position = (data.watermark_position as WatermarkPosition) || 'bottom-right';
        l.opacity  = Math.round((data.watermark_opacity ?? 0.7) * 100);
        if (data.watermark_type === 'image' && data.watermark_logo_url) {
          l.type = 'logo'; l.logoUrl = data.watermark_logo_url; l.logoPreview = data.watermark_logo_url;
        }
        setLayers([l]);
        setActiveId(l.id);
      }
    }

    if (data.size_prices && Array.isArray(data.size_prices)) {
      setSizePrices(SIZE_PRICES_DEFAULT.map(def => {
        const found = data.size_prices.find((s: any) => s.size === def.size);
        return found ? { ...def, price: String(found.price ?? ''), enabled: true } : def;
      }));
    } else if (data.download_price) {
      setSizePrices(prev => prev.map(s => s.size === 'digital' ? { ...s, price: String(data.download_price), enabled: true } : s));
    }
    setLoading(false);
  }

  function updateLayer(id: string, patch: Partial<WatermarkLayer>) {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }
  function addText()       { const l = makeTextLayer();       setLayers(prev => [...prev, l]); setActiveId(l.id); }
  function addLogo()       { const l = makeLogoLayer();       setLayers(prev => [...prev, l]); setActiveId(l.id); }
  function addTiledText()  { const l = makeTiledTextLayer();  setLayers(prev => [...prev, l]); setActiveId(l.id); }
  function removeLayer(id: string) {
    setLayers(prev => {
      const next = prev.filter(l => l.id !== id);
      if (activeId === id) setActiveId(next[0]?.id || '');
      return next;
    });
  }

  async function handleLogoUpload(id: string, file: File) {
    setLogoUploading(true);
    updateLayer(id, { logoPreview: URL.createObjectURL(file) });
    const ext  = file.name.split('.').pop();
    const path = `watermarks/${profile!.id}/${albumId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('covers').upload(path, file, { upsert: true });
    if (uploadErr) { setError('Лого байршуулахад алдаа: ' + uploadErr.message); setLogoUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(path);
    updateLayer(id, { logoUrl: publicUrl, logoPreview: publicUrl });
    setLogoUploading(false);
  }

  function updateSizePrice(size: string, field: 'price' | 'enabled', value: string | boolean) {
    setSizePrices(prev => prev.map(sp => sp.size === size ? { ...sp, [field]: value } : sp));
  }

  async function handleSave() {
    if (!albumName.trim()) { setError('Цомгийн нэр оруулна уу'); return; }
    setSaving(true); setError('');
    const first = layers[0];
    const activeSizes = sizePrices.filter(s => s.enabled);
    const digitalPrice = sizePrices.find(s => s.size === 'digital' && s.enabled);
    const watermarkValue = layersToWatermarkValue(layers);
    const { error: err } = await supabase.from('albums').update({
      title: albumName.trim(), name: albumName.trim(),
      event_date: eventDate || null, description: description.trim(),
      status, is_free: isFree,
      download_price: isFree ? 0 : parseFloat(digitalPrice?.price || '0') || 0,
      size_prices: isFree ? null : activeSizes.map(s => ({ size: s.size, label: s.label, price: parseFloat(s.price) || 0 })),
      watermark_type: 'layers',
      watermark_value: watermarkValue,
      watermark_position: first?.position || 'bottom-right',
      watermark_opacity: (first?.opacity ?? 70) / 100,
      watermark_logo_url: first?.type === 'logo' ? (first?.logoUrl || null) : null,
    }).eq('id', albumId).eq('owner_id', profile!.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 3000);
  }

  const activeLayer = layers.find(l => l.id === activeId);

  const layerTabLabel = (l: WatermarkLayer, idx: number) => {
    if (l.type === 'text') return `Текст ${layers.filter((x, j) => x.type === 'text' && j <= idx).length}`;
    if (l.type === 'logo') return `Лого ${layers.filter((x, j) => x.type === 'logo' && j <= idx).length}`;
    return `Тамга ${layers.filter((x, j) => x.type === 'tiled-text' && j <= idx).length}`;
  };
  const layerTabIcon = (type: LayerType) => {
    if (type === 'text') return <Type className="w-3 h-3" />;
    if (type === 'logo') return <ImageIcon className="w-3 h-3" />;
    return <Grid className="w-3 h-3" />;
  };

  if (loading) return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );

  const inputCls = "w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-4 py-3 outline-none transition-all placeholder:text-stone-600 text-sm";

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center"><Camera className="w-5 h-5 text-stone-950" /></div>
              <span className="text-white font-semibold">Цомог засах</span>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-5 py-2 rounded-xl text-sm transition-all">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Хадгалж байна…' : saved ? 'Хадгалагдлаа!' : 'Хадгалах'}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" /><p className="text-red-400 text-sm">{error}</p></div>}
        {saved && <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3"><CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" /><p className="text-green-400 text-sm">Амжилттай хадгалагдлаа!</p></div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left */}
          <div className="space-y-6">
            <section className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <span className="w-6 h-6 bg-amber-500/20 rounded-lg flex items-center justify-center text-amber-400 text-xs">📋</span>
                Үндсэн мэдээлэл
              </h2>
              <div><label className="text-stone-400 text-xs mb-1.5 block">Цомгийн нэр *</label><input value={albumName} onChange={e => setAlbumName(e.target.value)} placeholder="Арга хэмжээний нэр" className={inputCls} /></div>
              <div><label className="text-stone-400 text-xs mb-1.5 block">Арга хэмжээний огноо</label><input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputCls + ' [color-scheme:dark]'} /></div>
              <div><label className="text-stone-400 text-xs mb-1.5 block">Тайлбар</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Арга хэмжээний тухай…" className={inputCls + ' resize-none'} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-stone-400 text-xs mb-1.5 block">Төлөв</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                    <option value="draft">Ноорог</option><option value="active">Идэвхтэй</option><option value="closed">Хаагдсан</option>
                  </select>
                </div>
                <div><label className="text-stone-400 text-xs mb-1.5 block">Татах төлбөр</label>
                  <div className="flex rounded-xl overflow-hidden border border-white/10">
                    <button type="button" onClick={() => setIsFree(true)} className={`flex-1 py-2.5 text-xs font-medium transition-all ${isFree ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 text-stone-400 hover:text-white'}`}>Үнэгүй</button>
                    <button type="button" onClick={() => setIsFree(false)} className={`flex-1 py-2.5 text-xs font-medium transition-all ${!isFree ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 text-stone-400 hover:text-white'}`}>Төлбөртэй</button>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <span className="w-6 h-6 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400 text-xs">💧</span>
                Усан тэмдгийн тохиргоо
              </h2>

              {/* Layer tabs */}
              <div className="flex flex-wrap gap-2">
                {layers.map((l, i) => (
                  <button key={l.id} type="button" onClick={() => setActiveId(l.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeId === l.id ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400 border border-white/10 hover:text-white'}`}>
                    {layerTabIcon(l.type)}{layerTabLabel(l, i)}
                  </button>
                ))}
                <button type="button" onClick={addText} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-800 text-stone-400 border border-white/10 hover:text-white transition-all">
                  <Plus className="w-3 h-3" /><Type className="w-3 h-3" /> Текст
                </button>
                <button type="button" onClick={addLogo} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-800 text-stone-400 border border-white/10 hover:text-white transition-all">
                  <Plus className="w-3 h-3" /><ImageIcon className="w-3 h-3" /> Лого
                </button>
                <button type="button" onClick={addTiledText} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-amber-500/40 text-amber-600 hover:text-amber-400 hover:border-amber-500/70 transition-all">
                  <Plus className="w-3 h-3" /><Grid className="w-3 h-3" /> Битүү тамга
                </button>
              </div>

              {/* Active layer editor */}
              {activeLayer && (
                <div className="bg-stone-900 border border-white/10 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {layerTabIcon(activeLayer.type)}
                      <span className="text-white text-sm font-medium">
                        {activeLayer.type === 'text' ? 'Текст усан тэмдэг' : activeLayer.type === 'logo' ? 'Лого усан тэмдэг' : 'Битүү давтагдах тамга'}
                      </span>
                    </div>
                    {layers.length > 1 && (
                      <button type="button" onClick={() => removeLayer(activeLayer.id)} className="w-6 h-6 flex items-center justify-center text-stone-500 hover:text-red-400 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* TEXT */}
                  {activeLayer.type === 'text' && (
                    <>
                      <div><label className="text-stone-400 text-xs mb-1.5 block">Текст</label>
                        <input value={activeLayer.text} onChange={e => updateLayer(activeLayer.id, { text: e.target.value })} placeholder="© Zuragchin.mn"
                          className="w-full bg-stone-800 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-4 py-2.5 outline-none text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-stone-400 text-xs mb-2 block">Фонт: {activeLayer.fontSize}px</label>
                          <input type="range" min={8} max={72} value={activeLayer.fontSize} onChange={e => updateLayer(activeLayer.id, { fontSize: Number(e.target.value) })} className="w-full accent-amber-500" />
                        </div>
                        <div><label className="text-stone-400 text-xs mb-2 block">Өнгө</label>
                          <div className="flex items-center gap-2">
                            <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-white/20 flex-shrink-0 cursor-pointer">
                              <div className="w-full h-full" style={{ background: activeLayer.color }} />
                              <input type="color" value={activeLayer.color} onChange={e => updateLayer(activeLayer.id, { color: e.target.value })} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                            </div>
                            <span className="text-stone-400 text-xs font-mono">{activeLayer.color}</span>
                          </div>
                        </div>
                      </div>
                      <div><label className="text-stone-400 text-xs mb-2 block">Тунгалаг байдал: {activeLayer.opacity}%</label>
                        <input type="range" min={10} max={100} value={activeLayer.opacity} onChange={e => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })} className="w-full accent-amber-500" />
                      </div>
                      <div><label className="text-stone-400 text-xs mb-2 block">Байршил</label>
                        <div className="inline-grid grid-cols-3 gap-2">
                          {POSITION_GRID.flat().map(pos => (
                            <button key={pos} type="button" onClick={() => updateLayer(activeLayer.id, { position: pos })}
                              className={`w-11 h-11 rounded-lg flex items-center justify-center transition-all ${activeLayer.position === pos ? 'bg-amber-500' : 'bg-stone-800 border border-white/10 hover:border-amber-500/40'}`}>
                              <span className={`w-2 h-2 rounded-full ${activeLayer.position === pos ? 'bg-stone-950' : 'bg-stone-500'}`} />
                            </button>
                          ))}
                        </div>
                        <p className="text-stone-500 text-xs mt-1.5">{POSITION_LABELS[activeLayer.position]}</p>
                      </div>
                    </>
                  )}

                  {/* LOGO */}
                  {activeLayer.type === 'logo' && (
                    <>
                      <input ref={el => { logoInputRefs.current[activeLayer.id] = el; }} type="file" accept="image/*" className="hidden"
                        onChange={e => { if (e.target.files?.[0]) handleLogoUpload(activeLayer.id, e.target.files[0]); }} />
                      <div><label className="text-stone-400 text-xs mb-1.5 block">Лого зураг</label>
                        {activeLayer.logoPreview ? (
                          <div className="relative w-full h-24 bg-stone-800 rounded-xl overflow-hidden border border-white/10">
                            <img src={activeLayer.logoPreview} alt="logo" className="w-full h-full object-contain p-2" />
                            <button type="button" onClick={() => updateLayer(activeLayer.id, { logoUrl: '', logoPreview: '' })}
                              className="absolute top-2 right-2 w-6 h-6 bg-red-500/80 rounded-full flex items-center justify-center"><X className="w-3.5 h-3.5 text-white" /></button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => logoInputRefs.current[activeLayer.id]?.click()} disabled={logoUploading}
                            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-white/15 hover:border-amber-500/50 rounded-xl py-5 text-stone-500 hover:text-stone-300 transition-all text-sm">
                            {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {logoUploading ? 'Байршуулж байна…' : 'Лого сонгох'}
                          </button>
                        )}
                      </div>
                      <div><label className="text-stone-400 text-xs mb-2 block">Лого хэмжээ: <span className="text-white font-medium">{activeLayer.logoSize ?? 20}%</span></label>
                        <input type="range" min={5} max={50} value={activeLayer.logoSize ?? 20} onChange={e => updateLayer(activeLayer.id, { logoSize: Number(e.target.value) })} className="w-full accent-amber-500" />
                        <div className="flex justify-between text-stone-600 text-xs mt-0.5"><span>5% жижиг</span><span>50% том</span></div>
                      </div>
                      <div><label className="text-stone-400 text-xs mb-2 block">Тунгалаг байдал: {activeLayer.opacity}%</label>
                        <input type="range" min={10} max={100} value={activeLayer.opacity} onChange={e => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })} className="w-full accent-amber-500" />
                      </div>
                      <div><label className="text-stone-400 text-xs mb-2 block">Байршил</label>
                        <div className="inline-grid grid-cols-3 gap-2">
                          {POSITION_GRID.flat().map(pos => (
                            <button key={pos} type="button" onClick={() => updateLayer(activeLayer.id, { position: pos })}
                              className={`w-11 h-11 rounded-lg flex items-center justify-center transition-all ${activeLayer.position === pos ? 'bg-amber-500' : 'bg-stone-800 border border-white/10 hover:border-amber-500/40'}`}>
                              <span className={`w-2 h-2 rounded-full ${activeLayer.position === pos ? 'bg-stone-950' : 'bg-stone-500'}`} />
                            </button>
                          ))}
                        </div>
                        <p className="text-stone-500 text-xs mt-1.5">{POSITION_LABELS[activeLayer.position]}</p>
                      </div>
                    </>
                  )}

                  {/* TILED-TEXT */}
                  {activeLayer.type === 'tiled-text' && (
                    <>
                      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-300">
                        Зургийн бүх талбайд 30° налуу давтагдан хэвлэгдэнэ. Хуулбарлахаас хамгаалах зориулалттай.
                      </div>
                      <div><label className="text-stone-400 text-xs mb-1.5 block">Тамга текст</label>
                        <input value={activeLayer.text} onChange={e => updateLayer(activeLayer.id, { text: e.target.value })} placeholder="© Zuragchin.mn"
                          className="w-full bg-stone-800 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-4 py-2.5 outline-none text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-stone-400 text-xs mb-2 block">Фонт: {activeLayer.fontSize}px</label>
                          <input type="range" min={10} max={48} value={activeLayer.fontSize} onChange={e => updateLayer(activeLayer.id, { fontSize: Number(e.target.value) })} className="w-full accent-amber-500" />
                        </div>
                        <div><label className="text-stone-400 text-xs mb-2 block">Өнгө</label>
                          <div className="flex items-center gap-2">
                            <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-white/20 flex-shrink-0 cursor-pointer">
                              <div className="w-full h-full" style={{ background: activeLayer.color }} />
                              <input type="color" value={activeLayer.color} onChange={e => updateLayer(activeLayer.id, { color: e.target.value })} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                            </div>
                            <span className="text-stone-400 text-xs font-mono">{activeLayer.color}</span>
                          </div>
                        </div>
                      </div>
                      <div><label className="text-stone-400 text-xs mb-2 block">Тунгалаг байдал: {activeLayer.opacity}% (бага = нэвт харагдана)</label>
                        <input type="range" min={5} max={80} value={activeLayer.opacity} onChange={e => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })} className="w-full accent-amber-500" />
                      </div>
                    </>
                  )}
                </div>
              )}
              <WatermarkPreview layers={layers} />
            </section>
          </div>

          {/* Right - Pricing */}
          <div>
            <section className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <span className="w-6 h-6 bg-green-500/20 rounded-lg flex items-center justify-center text-green-400 text-xs">₮</span>
                Үнэ тариф
              </h2>
              {isFree ? (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                  <p className="text-green-400 text-sm font-medium">Үнэгүй татах идэвхтэй</p>
                  <p className="text-stone-500 text-xs mt-1">Худалдан авагч бүр үнэгүй татаж авна</p>
                </div>
              ) : (
                <div className="bg-white/3 border border-white/10 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_130px_52px] text-xs font-medium text-stone-500 px-3 py-2 border-b border-white/10">
                    <span>Хэмжээ</span><span>Үнэ (₮)</span><span className="text-center">✓</span>
                  </div>
                  {sizePrices.map(sp => (
                    <div key={sp.size} className="grid grid-cols-[1fr_130px_52px] items-center gap-1 px-3 py-2 border-b border-white/5 last:border-0">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded w-fit ${
                        sp.size === 'digital' ? 'bg-purple-500/20 text-purple-400' : sp.size === '10x15' ? 'bg-blue-500/20 text-blue-400' :
                        sp.size === '13x18' ? 'bg-cyan-500/20 text-cyan-400' : sp.size === '15x21' ? 'bg-green-500/20 text-green-400' :
                        sp.size === '20x30' ? 'bg-amber-500/20 text-amber-400' : sp.size === '30x40' ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'
                      }`}>{sp.size}</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500 text-xs">₮</span>
                        <input type="number" value={sp.price} min={0} placeholder="0" onChange={e => updateSizePrice(sp.size, 'price', e.target.value)} disabled={!sp.enabled}
                          className="w-full bg-stone-800 disabled:bg-stone-900 disabled:text-stone-600 border border-white/10 focus:border-amber-500/50 text-white rounded-lg pl-6 pr-2 py-1.5 text-xs outline-none" />
                      </div>
                      <div className="flex justify-center">
                        <button type="button" onClick={() => updateSizePrice(sp.size, 'enabled', !sp.enabled)} style={{ height: '18px' }}
                          className={`w-8 rounded-full transition-all relative flex-shrink-0 ${sp.enabled ? 'bg-amber-500' : 'bg-stone-700'}`}>
                          <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-all ${sp.enabled ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-stone-600 text-xs">Идэвхтэй хэмжээнүүд худалдан авагчид харагдана</p>
            </section>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={() => navigate('/dashboard')} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 font-medium py-3 rounded-xl text-sm transition-all">Буцах</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold py-3 rounded-xl text-sm transition-all">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Хадгалж байна…' : 'Хадгалах'}
          </button>
        </div>
      </main>
    </div>
  );
}
