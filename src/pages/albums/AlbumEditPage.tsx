import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera, ArrowLeft, Save, AlertCircle, CheckCircle2,
  Type, Image as ImageIcon, Upload, X, Loader2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type WatermarkType = 'text' | 'image';
type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

interface SizePrice { size: string; label: string; price: string; enabled: boolean; }

const SIZE_PRICES_DEFAULT: SizePrice[] = [
  { size: 'digital', label: 'Дижитал файл — Татаж авах',        price: '', enabled: true  },
  { size: '10x15',   label: '10x15 см — 1200x1800px',           price: '', enabled: true  },
  { size: '13x18',   label: '13x18 см — 1535x2126px',           price: '', enabled: false },
  { size: '15x21',   label: '15x21 см — 1772x2480px (A5)',      price: '', enabled: false },
  { size: '20x30',   label: '20x30 см — 2362x3543px',           price: '', enabled: false },
  { size: '30x40',   label: '30x40 см — 3543x4724px',           price: '', enabled: false },
  { size: '40x60',   label: '40x60 см — 4724x7087px (Постер)',  price: '', enabled: false },
];

const POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: 'top-left',     label: 'Зүүн дээр'  },
  { value: 'top-right',    label: 'Баруун дээр' },
  { value: 'bottom-left',  label: 'Зүүн доор'  },
  { value: 'bottom-right', label: 'Баруун доор' },
  { value: 'center',       label: 'Төв'         },
];

export default function AlbumEditPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Basic info
  const [albumName, setAlbumName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [isFree, setIsFree] = useState(false);

  // Watermark
  const [wmType, setWmType] = useState<WatermarkType>('text');
  const [wmText, setWmText] = useState('');
  const [wmPosition, setWmPosition] = useState<WatermarkPosition>('bottom-right');
  const [wmOpacity, setWmOpacity] = useState(70);
  const [wmLogoUrl, setWmLogoUrl] = useState('');
  const [wmLogoPreview, setWmLogoPreview] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);

  // Pricing
  const [sizePrices, setSizePrices] = useState<SizePrice[]>(SIZE_PRICES_DEFAULT);

  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!albumId || !profile) return;
    loadAlbum();
  }, [albumId, profile]);

  async function loadAlbum() {
    const { data, error } = await supabase
      .from('albums')
      .select('*')
      .eq('id', albumId)
      .eq('owner_id', profile!.id)
      .maybeSingle();

    if (error || !data) { setError('Цомог олдсонгүй'); setLoading(false); return; }

    setAlbumName(data.title || data.name || '');
    setEventDate(data.event_date?.slice(0, 10) || '');
    setDescription(data.description || '');
    setStatus(data.status || 'draft');
    setIsFree(data.is_free ?? false);
    setWmType(data.watermark_type || 'text');
    setWmText(data.watermark_value || '');
    setWmPosition(data.watermark_position || 'bottom-right');
    setWmOpacity(Math.round((data.watermark_opacity ?? 0.7) * 100));
    setWmLogoUrl(data.watermark_logo_url || '');
    setWmLogoPreview(data.watermark_logo_url || '');

    // Load size_prices
    if (data.size_prices && Array.isArray(data.size_prices)) {
      const saved: any[] = data.size_prices;
      setSizePrices(SIZE_PRICES_DEFAULT.map(def => {
        const found = saved.find((s: any) => s.size === def.size);
        if (found) return { ...def, price: String(found.price ?? ''), enabled: true };
        return def;
      }));
    } else if (data.download_price) {
      setSizePrices(prev => prev.map(sp =>
        sp.size === 'digital' ? { ...sp, price: String(data.download_price), enabled: true } : sp
      ));
    }
    setLoading(false);
  }

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    const path = `watermarks/${profile!.id}/${albumId}/${crypto.randomUUID()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('covers').upload(path, file, { upsert: true });
    if (error) { setLogoUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(path);
    setWmLogoUrl(publicUrl);
    setWmLogoPreview(URL.createObjectURL(file));
    setLogoUploading(false);
  }

  function updateSizePrice(size: string, field: 'price' | 'enabled', value: string | boolean) {
    setSizePrices(prev => prev.map(sp => sp.size === size ? { ...sp, [field]: value } : sp));
  }

  async function handleSave() {
    if (!albumName.trim()) { setError('Цомгийн нэр оруулна уу'); return; }
    setSaving(true); setError('');

    const activeSizes = sizePrices.filter(s => s.enabled);
    const digitalPrice = sizePrices.find(s => s.size === 'digital' && s.enabled);

    const { error: err } = await supabase.from('albums').update({
      title: albumName.trim(),
      name: albumName.trim(),
      event_date: eventDate,
      description: description.trim(),
      status,
      is_free: isFree,
      download_price: isFree ? 0 : parseFloat(digitalPrice?.price || '0') || 0,
      size_prices: isFree ? null : activeSizes.map(s => ({ size: s.size, label: s.label, price: parseFloat(s.price) || 0 })),
      watermark_type: wmType,
      watermark_value: wmType === 'text' ? wmText : wmLogoUrl,
      watermark_position: wmPosition,
      watermark_opacity: wmOpacity / 100,
      watermark_logo_url: wmType === 'image' ? wmLogoUrl : null,
    }).eq('id', albumId).eq('owner_id', profile!.id);

    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

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
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <Camera className="w-5 h-5 text-stone-950" />
              </div>
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
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        {saved && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            <p className="text-green-400 text-sm">Амжилттай хадгалагдлаа!</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            {/* Basic info */}
            <section className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <span className="w-6 h-6 bg-amber-500/20 rounded-lg flex items-center justify-center text-amber-400 text-xs">📋</span>
                Үндсэн мэдээлэл
              </h2>
              <div>
                <label className="text-stone-400 text-xs mb-1.5 block">Цомгийн нэр *</label>
                <input value={albumName} onChange={e => setAlbumName(e.target.value)} placeholder="Арга хэмжээний нэр" className={inputCls} />
              </div>
              <div>
                <label className="text-stone-400 text-xs mb-1.5 block">Арга хэмжээний огноо</label>
                <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-stone-400 text-xs mb-1.5 block">Тайлбар</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Арга хэмжээний тухай…" className={inputCls + ' resize-none'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-400 text-xs mb-1.5 block">Төлөв</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                    <option value="draft">Ноорог</option>
                    <option value="active">Идэвхтэй</option>
                    <option value="closed">Хаагдсан</option>
                  </select>
                </div>
                <div>
                  <label className="text-stone-400 text-xs mb-1.5 block">Татах төлбөр</label>
                  <div className="flex rounded-xl overflow-hidden border border-white/10">
                    <button type="button" onClick={() => setIsFree(true)}
                      className={`flex-1 py-2.5 text-xs font-medium transition-all ${isFree ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 text-stone-400 hover:text-white'}`}>
                      Үнэгүй
                    </button>
                    <button type="button" onClick={() => setIsFree(false)}
                      className={`flex-1 py-2.5 text-xs font-medium transition-all ${!isFree ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 text-stone-400 hover:text-white'}`}>
                      Төлбөртэй
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Watermark */}
            <section className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <span className="w-6 h-6 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400 text-xs">💧</span>
                Усан тэмдэг
              </h2>

              {/* Type toggle */}
              <div className="flex rounded-xl overflow-hidden border border-white/10">
                <button type="button" onClick={() => setWmType('text')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all ${wmType === 'text' ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 text-stone-400 hover:text-white'}`}>
                  <Type className="w-4 h-4" />Текст
                </button>
                <button type="button" onClick={() => setWmType('image')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all ${wmType === 'image' ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 text-stone-400 hover:text-white'}`}>
                  <ImageIcon className="w-4 h-4" />Лого
                </button>
              </div>

              {wmType === 'text' ? (
                <div>
                  <label className="text-stone-400 text-xs mb-1.5 block">Текст</label>
                  <input value={wmText} onChange={e => setWmText(e.target.value)} placeholder="© Zuragchin.mn" className={inputCls} />
                </div>
              ) : (
                <div>
                  <label className="text-stone-400 text-xs mb-1.5 block">Лого зураг</label>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                  {wmLogoPreview ? (
                    <div className="relative w-full h-24 bg-stone-900 rounded-xl overflow-hidden border border-white/10">
                      <img src={wmLogoPreview} alt="logo" className="w-full h-full object-contain p-2" />
                      <button onClick={() => { setWmLogoUrl(''); setWmLogoPreview(''); }}
                        className="absolute top-2 right-2 w-6 h-6 bg-red-500/80 rounded-full flex items-center justify-center">
                        <X className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
                      className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-white/15 hover:border-amber-500/50 rounded-xl py-5 text-stone-500 hover:text-stone-300 transition-all text-sm">
                      {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {logoUploading ? 'Байршуулж байна…' : 'Лого сонгох'}
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-400 text-xs mb-1.5 block">Байршил</label>
                  <select value={wmPosition} onChange={e => setWmPosition(e.target.value as WatermarkPosition)} className={inputCls}>
                    {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-stone-400 text-xs mb-1.5 block">Тунгалаг байдал: {wmOpacity}%</label>
                  <input type="range" min={10} max={100} value={wmOpacity} onChange={e => setWmOpacity(Number(e.target.value))}
                    className="w-full accent-amber-500 mt-2" />
                </div>
              </div>
            </section>
          </div>

          {/* Right column - Pricing */}
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
                  {sizePrices.map((sp) => (
                    <div key={sp.size} className={`grid grid-cols-[1fr_130px_52px] items-center gap-1 px-3 py-2 border-b border-white/5 last:border-0 ${sp.size === 'digital' ? 'bg-purple-500/5' : ''}`}>
                      <div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          sp.size === 'digital' ? 'bg-purple-500/20 text-purple-400' :
                          sp.size === '10x15' ? 'bg-blue-500/20 text-blue-400' :
                          sp.size === '13x18' ? 'bg-cyan-500/20 text-cyan-400' :
                          sp.size === '15x21' ? 'bg-green-500/20 text-green-400' :
                          sp.size === '20x30' ? 'bg-amber-500/20 text-amber-400' :
                          sp.size === '30x40' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>{sp.size}</span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500 text-xs">₮</span>
                        <input type="number" value={sp.price} min={0}
                          onChange={e => updateSizePrice(sp.size, 'price', e.target.value)}
                          disabled={!sp.enabled}
                          placeholder="0"
                          className="w-full bg-stone-800 disabled:bg-stone-900 disabled:text-stone-600 border border-white/10 focus:border-amber-500/50 text-white rounded-lg pl-6 pr-2 py-1.5 text-xs outline-none transition-all" />
                      </div>
                      <div className="flex justify-center">
                        <button type="button" onClick={() => updateSizePrice(sp.size, 'enabled', !sp.enabled)}
                          className={`w-8 h-4.5 rounded-full transition-all relative flex-shrink-0 ${sp.enabled ? 'bg-amber-500' : 'bg-stone-700'}`}
                          style={{ height: '18px' }}>
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

        {/* Save button bottom */}
        <div className="flex gap-3 pt-2">
          <button onClick={() => navigate('/dashboard')}
            className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 font-medium py-3 rounded-xl text-sm transition-all">
            Буцах
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold py-3 rounded-xl text-sm transition-all">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Хадгалж байна…' : 'Хадгалах'}
          </button>
        </div>
      </main>
    </div>
  );
}
