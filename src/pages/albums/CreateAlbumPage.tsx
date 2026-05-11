import { useState, useRef, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, ChevronLeft, AlertCircle, Upload, X,
  Type, Image as ImageIcon, Phone, Mail, Facebook,
  Instagram, Link as LinkIcon, CheckCircle2, Copy,
  Download, QrCode, UserPlus, Search, Trash2, Users, Plus, Clock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
type WatermarkType = 'text' | 'image';
type WatermarkPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface WatermarkLayer {
  id: string;
  type: WatermarkType;
  // text fields
  text: string;
  fontSize: number;
  opacity: number;
  color: string;
  // image fields
  imagePreview: string;
  // common
  position: WatermarkPosition;
}

interface FormErrors {
  name?: string;
  eventDate?: string;
  downloadPrice?: string;
  contactEmail?: string;
}

interface PhotographerEntry {
  zur_id: string;
  user_id: string;
  display_name: string;
  photographer_percent: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const POSITIONS: WatermarkPosition[] = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const POSITION_LABEL: Record<WatermarkPosition, string> = {
  'top-left': 'Зүүн дээр', 'top-center': 'Дунд дээр', 'top-right': 'Баруун дээр',
  'middle-left': 'Зүүн дунд', 'center': 'Төв', 'middle-right': 'Баруун дунд',
  'bottom-left': 'Зүүн доор', 'bottom-center': 'Дунд доор', 'bottom-right': 'Баруун доор',
};

const OVERLAY_CLASS: Record<WatermarkPosition, string> = {
  'top-left':      'top-2 left-2',
  'top-center':    'top-2 left-1/2 -translate-x-1/2',
  'top-right':     'top-2 right-2',
  'middle-left':   'top-1/2 left-2 -translate-y-1/2',
  'center':        'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'middle-right':  'top-1/2 right-2 -translate-y-1/2',
  'bottom-left':   'bottom-2 left-2',
  'bottom-center': 'bottom-2 left-1/2 -translate-x-1/2',
  'bottom-right':  'bottom-2 right-2',
};

const QPAY_FEE = 0.01;
const PLATFORM_FEE = 0.03;
const OWNER_COMMISSION_OWNED = 1 - QPAY_FEE - PLATFORM_FEE;

const PREVIEW_IMAGE = 'https://images.pexels.com/photos/1190298/pexels-photo-1190298.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop';

function newTextLayer(): WatermarkLayer {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    text: '© Zuragchin.mn',
    fontSize: 24,
    opacity: 70,
    color: '#ffffff',
    imagePreview: '',
    position: 'bottom-right',
  };
}

function newImageLayer(): WatermarkLayer {
  return {
    id: crypto.randomUUID(),
    type: 'image',
    text: '',
    fontSize: 24,
    opacity: 80,
    color: '#ffffff',
    imagePreview: '',
    position: 'top-left',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CreateAlbumPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [albumName, setAlbumName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'draft' | 'active' | 'closed'>('draft');

  // Multiple watermark layers
  const [wmLayers, setWmLayers] = useState<WatermarkLayer[]>([newTextLayer()]);
  const [activeLayerId, setActiveLayerId] = useState<string>(() => wmLayers[0].id);
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [revenueModel, setRevenueModel] = useState<'shared' | 'owned'>('shared');
  const [organizerPercent, setOrganizerPercent] = useState(10);
  const [isFree, setIsFree] = useState(false);
  const [downloadPrice, setDownloadPrice] = useState('');

  const [sizePrices, setSizePrices] = useState([
    { size: '10x15',  label: '10x15 см  — 1200x1800px  (Стандарт)',      price: '', enabled: true  },
    { size: '13x18',  label: '13x18 см  — 1535x2126px  (Жижиг)',         price: '', enabled: true  },
    { size: '15x21',  label: '15x21 см  — 1772x2480px  (A5)',            price: '', enabled: false },
    { size: '20x30',  label: '20x30 см  — 2362x3543px  (Хагас постер)',  price: '', enabled: false },
    { size: '30x40',  label: '30x40 см  — 3543x4724px  (Том хэвлэл)',   price: '', enabled: false },
    { size: '40x60',  label: '40x60 см  — 4724x7087px  (Постер)',        price: '', enabled: false },
    { size: 'digital',label: 'Дижитал файл — Оригинал хэмжээ (Хэвлэлд бэлэн)', price: '', enabled: true  },
  ]);
  function updateSizePrice(size: string, field: 'price' | 'enabled', value: string | boolean) {
    setSizePrices(prev => prev.map(sp => sp.size === size ? { ...sp, [field]: value } : sp));
  }

  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactFacebook, setContactFacebook] = useState('');
  const [contactInstagram, setContactInstagram] = useState('');
  const [contactOther, setContactOther] = useState('');

  const [photographers, setPhotographers] = useState<PhotographerEntry[]>([]);
  const [zurIdInput, setZurIdInput] = useState('');
  const [searchingZur, setSearchingZur] = useState(false);
  const [zurError, setZurError] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [successData, setSuccessData] = useState<{ albumId: string; shareLink: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Өөрийн ZUR-ID-г автоматаар ачаалах
  useEffect(() => {
    if (!user) return;
    supabase
      .from('photographer_profiles')
      .select('user_id, display_name, zur_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.zur_id) {
          setPhotographers([{
            zur_id: data.zur_id,
            user_id: data.user_id,
            display_name: data.display_name || 'Та',
            photographer_percent: 0,
          }]);
        }
      });
  }, [user]);

  const fixedFees = QPAY_FEE + PLATFORM_FEE;
  const availableForSplit = 1 - fixedFees;
  const organizerFraction = revenueModel === 'owned' ? availableForSplit : organizerPercent / 100;
  const photographerPoolFraction = revenueModel === 'owned' ? 0 : availableForSplit - organizerFraction;

  const activeLayer = wmLayers.find(l => l.id === activeLayerId) ?? wmLayers[0];

  // ── Layer helpers ──────────────────────────────────────────────────────────
  function updateLayer(id: string, patch: Partial<WatermarkLayer>) {
    setWmLayers(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }

  function addLayer(type: WatermarkType) {
    const layer = type === 'text' ? newTextLayer() : newImageLayer();
    setWmLayers(prev => [...prev, layer]);
    setActiveLayerId(layer.id);
  }

  function removeLayer(id: string) {
    setWmLayers(prev => {
      const next = prev.filter(l => l.id !== id);
      if (next.length === 0) {
        const fresh = newTextLayer();
        setActiveLayerId(fresh.id);
        return [fresh];
      }
      if (activeLayerId === id) setActiveLayerId(next[next.length - 1].id);
      return next;
    });
  }

  function handleImageUpload(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => updateLayer(id, { imagePreview: ev.target?.result as string });
    reader.readAsDataURL(file);
  }

  // ── Photographer search ────────────────────────────────────────────────────
  async function addPhotographerByZurId() {
    setZurError('');
    const cleaned = zurIdInput.trim().toUpperCase();
    if (!cleaned.startsWith('ZUR-')) { setZurError('ZUR-XXXXX форматаар оруулна уу'); return; }
    if (photographers.find(p => p.zur_id === cleaned)) { setZurError('Энэ зурагчин аль хэдийн нэмэгдсэн байна'); return; }
    setSearchingZur(true);

    const { data, error } = await supabase
      .from('photographer_profiles')
      .select('user_id, display_name')
      .eq('zur_id', cleaned)
      .maybeSingle();

    if (error || !data) {
      setZurError('Энэ ZUR-ID-тэй зурагчин олдсонгүй');
      setSearchingZur(false);
      return;
    }
    const defaultPct = Math.floor((photographerPoolFraction * 100) / (photographers.length + 1));
    setPhotographers(prev => [...prev, {
      zur_id: cleaned,
      user_id: data.user_id,
      display_name: data.display_name || cleaned,
      photographer_percent: defaultPct,
    }]);
    setZurIdInput('');
    setSearchingZur(false);
  }

  function removePhotographer(zur_id: string) { setPhotographers(prev => prev.filter(p => p.zur_id !== zur_id)); }
  function updatePhotographerPercent(zur_id: string, pct: number) {
    setPhotographers(prev => prev.map(p => p.zur_id === zur_id ? { ...p, photographer_percent: pct } : p));
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: FormErrors = {};
    if (!albumName.trim()) errs.name = 'Цомгийн нэр оруулна уу';
    if (!eventDate) errs.eventDate = 'Арга хэмжээний огноо оруулна уу';
    if (!isFree) {
      const activeSizes = sizePrices.filter(s => s.enabled);
      if (activeSizes.length === 0) {
        errs.downloadPrice = 'Дор хаяж нэг хэмжээ идэвхтэй байх ёстой';
      } else {
        const missingPrice = activeSizes.some(s => !s.price || parseFloat(s.price) <= 0);
        if (missingPrice) errs.downloadPrice = 'Идэвхтэй хэмжээ бүрт үнэ оруулна уу';
      }
    }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) errs.contactEmail = 'Зөв имэйл хаяг оруулна уу';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const albumId = crypto.randomUUID();
      const shareLink = `/album/${albumId}`;
      const shareUrl = `${window.location.origin}${shareLink}`;

      // Serialize all layers as JSON
      const watermarkValue = JSON.stringify(wmLayers.map(l => ({
        id: l.id,
        type: l.type,
        text: l.text,
        fontSize: l.fontSize,
        opacity: l.opacity / 100,
        color: l.color,
        imagePreview: l.imagePreview,
        position: l.position,
      })));

      const contactInfo = { phone: contactPhone, email: contactEmail, facebook: contactFacebook, instagram: contactInstagram, other: contactOther };
      const ownerCommission = revenueModel === 'owned' ? OWNER_COMMISSION_OWNED : organizerPercent / 100;
      const photographerPercent = revenueModel === 'owned' ? 0 : (photographerPoolFraction * 100);

      const { error } = await supabase.from('albums').insert({
        id: albumId, owner_id: user!.id,
        title: albumName.trim(),
        name: albumName.trim(), event_date: eventDate, description: description.trim(), status,
        watermark_type: 'layers',
        watermark_value: watermarkValue,
        watermark_position: activeLayer.position,
        download_price: isFree ? 0 : parseFloat(sizePrices.find(s => s.enabled && s.price)?.price ?? '0'),
        size_prices: isFree ? null : sizePrices.filter(s => s.enabled).map(s => ({ size: s.size, label: s.label, price: parseFloat(s.price) || 0 })),
        is_free: isFree,
        owner_commission: ownerCommission,
        organizer_percent: ownerCommission * 100,
        photographer_percent: photographerPercent,
        revenue_model: revenueModel,
        share_link: shareLink, qr_code_url: shareUrl, contact_info: contactInfo,
      });
      if (error) throw error;

      if (photographers.length > 0) {
        await supabase.from('album_photographers').insert(
          photographers.map(p => ({ album_id: albumId, photographer_id: p.user_id, status: 'approved' }))
        );
      }
      setSuccessData({ albumId, shareLink: shareUrl });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error('Album create error:', err);
      setErrors({ name: msg });
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!successData) return;
    await navigator.clipboard.writeText(successData.shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadQR() {
    if (!successData) return;
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(successData.shareLink)}`, '_blank');
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-stone-400 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" /><span className="text-sm">Хяналтын самбар</span>
          </button>
          <div className="h-5 w-px bg-white/10" />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center"><Camera className="w-4 h-4 text-stone-950" /></div>
            <span className="text-white font-semibold">Цомог үүсгэх</span>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-white text-3xl font-bold mb-2">Шинэ арга хэмжээний цомог</h1>
          <p className="text-stone-400">Цомог, усан тэмдэг, үнэлгээгээ тохируулаад зурагчидтай хуваалцаарай.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">

            {/* Basic Info */}
            <Section title="Үндсэн мэдээлэл" icon={<Camera className="w-4 h-4" />}>
              <div className="space-y-5">
                <Field label="Цомгийн нэр" error={errors.name} required>
                  <input type="text" value={albumName} onChange={e => setAlbumName(e.target.value)} placeholder="Жишээ: Бат & Энхжингийн хурим" className={inputClass(!!errors.name)} />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Арга хэмжээний огноо" error={errors.eventDate} required>
                    <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputClass(!!errors.eventDate) + ' [color-scheme:dark]'} />
                  </Field>
                  <Field label="Төлөв">
                    <select value={status} onChange={e => setStatus(e.target.value as typeof status)} className={inputClass(false)}>
                      <option value="draft">Ноорог</option>
                      <option value="active">Идэвхтэй</option>
                      <option value="closed">Хаагдсан</option>
                    </select>
                  </Field>
                </div>
                <Field label="Тайлбар">
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Зурагчидад энэ арга хэмжээний талаар хэлэх..." rows={3} className={inputClass(false) + ' resize-none'} />
                </Field>
              </div>
            </Section>

            {/* Revenue Model */}
            <Section title="Орлогын загвар" icon={<span className="text-xs font-bold text-stone-400">%</span>}>
              <div className="space-y-4">
                <div className="flex rounded-xl overflow-hidden border border-white/10">
                  <TypeToggleBtn active={revenueModel === 'shared'} onClick={() => setRevenueModel('shared')} icon={<span className="text-xs font-bold">Хуваалцах</span>} label="Зурагчинтай хувааx" />
                  <TypeToggleBtn active={revenueModel === 'owned'} onClick={() => setRevenueModel('owned')} icon={<span className="text-xs font-bold">96%</span>} label="Бүрэн өмчлөх" />
                </div>
                {revenueModel === 'shared' && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-sm"><span className="text-stone-400">QPay шимтгэл</span><span className="text-stone-500 font-mono">1%</span></div>
                    <div className="flex justify-between text-sm"><span className="text-stone-400">Платформ шимтгэл</span><span className="text-stone-500 font-mono">3%</span></div>
                    <div className="border-t border-white/10 pt-3">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-amber-400 font-medium">Таны хувь</span>
                        <span className="text-amber-400 font-mono font-bold">{organizerPercent}%</span>
                      </div>
                      <input type="range" min={0} max={92} step={1} value={organizerPercent} onChange={e => setOrganizerPercent(Number(e.target.value))} className="w-full accent-amber-500" />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-green-400 font-medium">Зурагчдын хувийн сан</span>
                      <span className="text-green-400 font-mono font-bold">{Math.max(0, 96 - organizerPercent)}%</span>
                    </div>
                  </div>
                )}
                {revenueModel === 'owned' && (
                  <div className="rounded-xl p-4 border bg-amber-500/5 border-amber-500/20 text-amber-300 text-sm">
                    Зурагчидыг урьдчилж хөлслөсөн тохиолдолд зохион байгуулагч борлуулалтын <strong>96%</strong> авна.
                  </div>
                )}
              </div>
            </Section>

            {/* Photographers */}
            <Section title="Зурагчин нэмэх" icon={<Users className="w-4 h-4" />}>
              <div className="space-y-4">
                <p className="text-stone-500 text-sm">ZUR-ID-ээр зурагчин нэмнэ үү. Нэмэгдсэн зурагчид шууд зөвшөөрөгдсөн байна.</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
                    <input type="text" value={zurIdInput} onChange={e => setZurIdInput(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPhotographerByZurId())}
                      placeholder="ZUR-XXXXX"
                      className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white placeholder-stone-600 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none font-mono" />
                  </div>
                  <button type="button" onClick={addPhotographerByZurId} disabled={searchingZur || !zurIdInput.trim()}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2.5 rounded-xl text-sm">
                    {searchingZur ? <div className="w-4 h-4 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Нэмэх
                  </button>
                </div>
                {zurError && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-red-400 text-sm">{zurError}</p>
                  </div>
                )}
                {photographers.length > 0 && (
                  <div className="space-y-2">
                    {photographers.map((p, idx) => (
                      <div key={p.zur_id} className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${idx === 0 && p.user_id === user?.id ? 'bg-amber-500/5 border-amber-500/20' : 'bg-stone-900 border-white/10'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${idx === 0 && p.user_id === user?.id ? 'bg-amber-500/20' : 'bg-amber-500/10'}`}><Camera className="w-4 h-4 text-amber-400" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-white font-medium text-sm truncate">{p.display_name}</p>
                            {p.user_id === user?.id && <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full flex-shrink-0">Та</span>}
                          </div>
                          <p className="text-stone-500 text-xs font-mono">{p.zur_id}</p>
                        </div>
                        {revenueModel === 'shared' && (
                          <div className="flex items-center gap-2">
                            <span className="text-stone-400 text-xs">Хувь:</span>
                            <input type="number" min={0} max={Math.max(0, 96 - organizerPercent)} value={p.photographer_percent}
                              onChange={e => updatePhotographerPercent(p.zur_id, Number(e.target.value))}
                              className="w-14 bg-stone-800 border border-white/10 text-amber-400 text-sm font-mono rounded-lg px-2 py-1 outline-none text-center" />
                            <span className="text-stone-500 text-xs">%</span>
                          </div>
                        )}
                        <button type="button" onClick={() => removePhotographer(p.zur_id)} className="w-7 h-7 flex items-center justify-center text-stone-600 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {photographers.length === 0 && (
                  <div className="border-2 border-dashed border-white/10 rounded-xl py-6 text-center">
                    <Users className="w-6 h-6 text-stone-600 mx-auto mb-2" />
                    <p className="text-stone-500 text-sm">Зурагчин нэмэгдээгүй байна</p>
                    <p className="text-stone-600 text-xs mt-1">Цомог үүссэний дараа ч нэмэх боломжтой</p>
                  </div>
                )}
              </div>
            </Section>

            {/* ── Watermark Layers ── */}
            <Section title="Усан тэмдгийн тохиргоо" icon={<Type className="w-4 h-4" />}>
              <div className="space-y-4">

                {/* Layer tabs */}
                <div className="flex items-center gap-2 flex-wrap">
                  {wmLayers.map((layer, idx) => (
                    <button key={layer.id} type="button"
                      onClick={() => setActiveLayerId(layer.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                        activeLayerId === layer.id
                          ? 'bg-amber-500 border-amber-500 text-stone-950'
                          : 'bg-white/5 border-white/10 text-stone-400 hover:text-white'
                      }`}>
                      {layer.type === 'text' ? <Type className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                      {layer.type === 'text' ? `Текст ${idx + 1}` : `Лого ${idx + 1}`}
                      {wmLayers.length > 1 && (
                        <span onClick={e => { e.stopPropagation(); removeLayer(layer.id); }}
                          className="ml-1 w-4 h-4 rounded-full bg-black/30 hover:bg-red-500 flex items-center justify-center transition-colors">
                          <X className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </button>
                  ))}
                  {/* Add buttons */}
                  <button type="button" onClick={() => addLayer('text')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-dashed border-white/20 text-stone-500 hover:text-white hover:border-white/40 transition-all">
                    <Plus className="w-3 h-3" /><Type className="w-3 h-3" /> Текст нэмэх
                  </button>
                  <button type="button" onClick={() => addLayer('image')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-dashed border-white/20 text-stone-500 hover:text-white hover:border-white/40 transition-all">
                    <Plus className="w-3 h-3" /><ImageIcon className="w-3 h-3" /> Лого нэмэх
                  </button>
                </div>

                {/* Active layer editor */}
                {activeLayer && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      {activeLayer.type === 'text'
                        ? <><Type className="w-4 h-4 text-amber-400" /><span className="text-white text-sm font-semibold">Текст усан тэмдэг</span></>
                        : <><ImageIcon className="w-4 h-4 text-amber-400" /><span className="text-white text-sm font-semibold">Лого / зураг</span></>
                      }
                    </div>

                    {activeLayer.type === 'text' ? (
                      <>
                        <Field label="Текст">
                          <input type="text" value={activeLayer.text}
                            onChange={e => updateLayer(activeLayer.id, { text: e.target.value })}
                            placeholder="© Your Studio Name" className={inputClass(false)} />
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                          <Field label={`Фонт: ${activeLayer.fontSize}px`}>
                            <input type="range" min={12} max={60} value={activeLayer.fontSize}
                              onChange={e => updateLayer(activeLayer.id, { fontSize: Number(e.target.value) })}
                              className="w-full accent-amber-500 mt-1" />
                          </Field>
                          <Field label="Өнгө">
                            <div className="flex items-center gap-3 mt-1">
                              <input type="color" value={activeLayer.color}
                                onChange={e => updateLayer(activeLayer.id, { color: e.target.value })}
                                className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                              <span className="text-stone-300 text-sm font-mono">{activeLayer.color}</span>
                            </div>
                          </Field>
                        </div>
                        <Field label={`Тунгалаг байдал: ${activeLayer.opacity}%`}>
                          <input type="range" min={10} max={100} value={activeLayer.opacity}
                            onChange={e => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })}
                            className="w-full accent-amber-500 mt-1" />
                        </Field>
                      </>
                    ) : (
                      <>
                        <input
                          ref={el => { imageInputRefs.current[activeLayer.id] = el; }}
                          type="file" accept="image/png,image/svg+xml,image/webp" className="hidden"
                          onChange={e => handleImageUpload(activeLayer.id, e)} />
                        {activeLayer.imagePreview ? (
                          <div className="flex items-center gap-3">
                            <img src={activeLayer.imagePreview} alt="logo" className="h-16 rounded-lg border border-white/10 object-contain bg-white/5 px-3" />
                            <div className="space-y-2">
                              <button type="button" onClick={() => imageInputRefs.current[activeLayer.id]?.click()}
                                className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors">
                                <Upload className="w-3 h-3" /> Солих
                              </button>
                              <button type="button" onClick={() => updateLayer(activeLayer.id, { imagePreview: '' })}
                                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors">
                                <Trash2 className="w-3 h-3" /> Устгах
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => imageInputRefs.current[activeLayer.id]?.click()}
                            className="w-full border-2 border-dashed border-white/20 hover:border-amber-500/50 hover:bg-amber-500/5 rounded-xl py-6 flex flex-col items-center gap-2 text-stone-400 hover:text-amber-400 transition-all">
                            <Upload className="w-7 h-7" />
                            <p className="font-medium text-sm">Лого / усан тэмдгийн зураг байршуулах</p>
                            <p className="text-xs opacity-70">Тунгалаг PNG зураг ашиглахыг зөвлөж байна</p>
                          </button>
                        )}
                        <Field label={`Тунгалаг байдал: ${activeLayer.opacity}%`}>
                          <input type="range" min={10} max={100} value={activeLayer.opacity}
                            onChange={e => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })}
                            className="w-full accent-amber-500 mt-1" />
                        </Field>
                      </>
                    )}

                    {/* Position grid */}
                    <Field label="Байршил">
                      <div className="grid grid-cols-3 gap-1.5 w-fit mt-1">
                        {POSITIONS.map(pos => (
                          <button key={pos} type="button" title={POSITION_LABEL[pos]}
                            onClick={() => updateLayer(activeLayer.id, { position: pos })}
                            className={`w-11 h-11 rounded-lg border transition-all flex items-center justify-center ${
                              activeLayer.position === pos ? 'bg-amber-500 border-amber-500' : 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10'
                            }`}>
                            <div className={`w-2 h-2 rounded-full ${activeLayer.position === pos ? 'bg-stone-950' : 'bg-white/40'}`} />
                          </button>
                        ))}
                      </div>
                      <p className="text-stone-500 text-xs mt-2">{POSITION_LABEL[activeLayer.position]}</p>
                    </Field>
                  </div>
                )}
              </div>
            </Section>

            {/* Pricing */}
            <Section title="Үнэлгээ" icon={<span className="text-xs font-bold text-stone-400">₮</span>}>
              <div className="space-y-5">
                <div className="flex rounded-xl overflow-hidden border border-white/10">
                  <TypeToggleBtn active={isFree} onClick={() => setIsFree(true)} icon={<span className="text-xs font-bold">FREE</span>} label="Үнэгүй татах" />
                  <TypeToggleBtn active={!isFree} onClick={() => setIsFree(false)} icon={<span className="text-xs font-bold">₮</span>} label="Төлбөртэй татах" />
                </div>
                {!isFree && (
                  <div className="space-y-4">
                    {/* Size-based pricing table */}
                    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                      <div className="grid grid-cols-[80px_1fr_140px_60px] gap-px bg-white/5 text-xs font-medium">
                        <div className="bg-stone-900 px-3 py-2 text-stone-400">Хэмжээ</div>
                        <div className="bg-stone-900 px-3 py-2 text-stone-400">Стандарт / Хэмжээлбэр</div>
                        <div className="bg-stone-900 px-3 py-2 text-stone-400">Үнэ (₮)</div>
                        <div className="bg-stone-900 px-3 py-2 text-stone-400">✓</div>
                      </div>
                      {sizePrices.map((sp, i) => (
                        <div key={sp.size} className={`grid grid-cols-[80px_1fr_140px_60px] gap-px ${i % 2 === 0 ? 'bg-white/3' : ''}`}>
                          <div className="bg-stone-900/60 px-3 py-2.5 flex items-center">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                              sp.size === 'digital' ? 'bg-purple-500/20 text-purple-400' :
                              i === 0 ? 'bg-blue-500/20 text-blue-400' :
                              i === 1 ? 'bg-cyan-500/20 text-cyan-400' :
                              i === 2 ? 'bg-green-500/20 text-green-400' :
                              i === 3 ? 'bg-amber-500/20 text-amber-400' :
                              i === 4 ? 'bg-orange-500/20 text-orange-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>{sp.size}</span>
                          </div>
                          <div className="bg-stone-900/60 px-3 py-2.5 flex items-center">
                            <span className="text-stone-400 text-xs font-mono">{sp.label}</span>
                          </div>
                          <div className="bg-stone-900/60 px-2 py-1.5">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500 text-xs">₮</span>
                              <input
                                type="number"
                                value={sp.price}
                                onChange={e => updateSizePrice(sp.size, 'price', e.target.value)}
                                disabled={!sp.enabled}
                                placeholder="10000"
                                min={0}
                                className="w-full bg-stone-800 disabled:bg-stone-900 disabled:text-stone-600 border border-white/10 focus:border-amber-500/50 text-white rounded-lg pl-6 pr-2 py-1.5 text-sm outline-none transition-all"
                              />
                            </div>
                          </div>
                          <div className="bg-stone-900/60 px-3 py-2.5 flex items-center">
                            <button
                              type="button"
                              onClick={() => updateSizePrice(sp.size, 'enabled', !sp.enabled)}
                              className={`w-9 h-5 rounded-full transition-all relative flex-shrink-0 ${sp.enabled ? 'bg-amber-500' : 'bg-stone-700'}`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${sp.enabled ? 'left-4' : 'left-0.5'}`} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-stone-500 text-xs">Идэвхтэй хэмжээнүүд татах боломжтой байна. Хамгийн бага нэг хэмжээ идэвхтэй байх ёстой.</p>
                    {errors.downloadPrice && (
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <p className="text-red-400 text-xs">{errors.downloadPrice}</p>
                      </div>
                    )}
                  </div>
                )}
                <FeeBreakdown price={isFree ? 0 : (sizePrices.find(s => s.enabled)?.price ? parseFloat(sizePrices.find(s => s.enabled)!.price) : 0) || 0} revenueModel={revenueModel} organizerPercent={organizerPercent} photographers={photographers} />
              </div>
            </Section>

            {/* Contact */}
            <Section title="Холбоо барих мэдээлэл" icon={<Phone className="w-4 h-4" />}>
              <p className="text-stone-500 text-sm mb-4">Таны цомогт нэгдэх зурагчидад харагдана.</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Утасны дугаар">
                    <div className="relative"><Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                      <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+976 9900 0000" className={inputClass(false) + ' pl-10'} /></div>
                  </Field>
                  <Field label="Имэйл" error={errors.contactEmail}>
                    <div className="relative"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                      <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="organizer@example.com" className={inputClass(!!errors.contactEmail) + ' pl-10'} /></div>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Facebook">
                    <div className="relative"><Facebook className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                      <input type="url" value={contactFacebook} onChange={e => setContactFacebook(e.target.value)} placeholder="https://facebook.com/..." className={inputClass(false) + ' pl-10'} /></div>
                  </Field>
                  <Field label="Instagram">
                    <div className="relative"><Instagram className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                      <input type="url" value={contactInstagram} onChange={e => setContactInstagram(e.target.value)} placeholder="https://instagram.com/..." className={inputClass(false) + ' pl-10'} /></div>
                  </Field>
                </div>
                <Field label="Бусад холбоос">
                  <div className="relative"><LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                    <input type="url" value={contactOther} onChange={e => setContactOther(e.target.value)} placeholder="https://..." className={inputClass(false) + ' pl-10'} /></div>
                </Field>
              </div>
            </Section>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div className="sticky top-24">
              {/* Watermark preview */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-stone-300 text-sm font-medium mb-3">Усан тэмдгийн урьдчилан харах</p>
                <div className="relative rounded-xl overflow-hidden aspect-[3/2]">
                  <img src={PREVIEW_IMAGE} alt="preview" className="w-full h-full object-cover" />
                  {wmLayers.map(layer => (
                    <div key={layer.id} className={`absolute pointer-events-none ${OVERLAY_CLASS[layer.position]}`}>
                      {layer.type === 'text' && layer.text && (
                        <span className="font-semibold px-1 select-none whitespace-nowrap drop-shadow"
                          style={{ fontSize: `${Math.max(8, Math.round(layer.fontSize * 0.4))}px`, color: layer.color, opacity: layer.opacity / 100 }}>
                          {layer.text}
                        </span>
                      )}
                      {layer.type === 'image' && layer.imagePreview && (
                        <img src={layer.imagePreview} alt="wm" className="h-8 object-contain drop-shadow" style={{ opacity: layer.opacity / 100 }} />
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-stone-600 text-xs mt-2 text-center">Бүх усан тэмдэг зэрэг харагдаж байна</p>
              </div>

              {/* Summary */}
              <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2 text-xs">
                <p className="text-stone-300 font-medium mb-2">Цомгийн тойм</p>
                <div className="flex justify-between text-stone-400"><span>Усан тэмдэг</span><span className="text-white">{wmLayers.length} давхарга</span></div>
                <div className="flex justify-between text-stone-400"><span>Зурагчид</span><span className="text-white">{photographers.length} нэмэгдсэн</span></div>
                <div className="flex justify-between text-stone-400"><span>Загвар</span><span className="text-white">{revenueModel === 'shared' ? 'Хуваалцах' : 'Бүрэн өмчлөх'}</span></div>
                <div className="flex justify-between text-stone-400"><span>Үнэ</span><span className="text-white">{isFree ? 'Үнэгүй' : `₮${parseFloat(downloadPrice || '0').toLocaleString()}`}</span></div>
              </div>

              {/* 21 хоногийн мэдэгдэл */}
              <div className="mt-4 bg-amber-500/8 border border-amber-500/20 rounded-xl p-4">
                <div className="flex items-start gap-2.5 mb-3">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock className="w-3 h-3 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-amber-300 text-sm font-semibold mb-1">Үнэгүй байршуулалтын хугацаа</p>
                    <p className="text-stone-400 text-xs leading-relaxed">
                      Таны цомог <span className="text-amber-400 font-semibold">21 хоног</span> үнэгүй байршина.
                      Хугацаа дуусахад цомог автоматаар устана.
                      Үргэлжлүүлэн байршуулахыг хүсвэл тухайн үед төлбөр төлөх шаардлагатай болно.
                    </p>
                  </div>
                </div>
                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <div className="relative flex-shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={e => setAgreedToTerms(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      agreedToTerms ? 'bg-amber-500 border-amber-500' : 'border-stone-600 group-hover:border-amber-500/50'
                    }`}>
                      {agreedToTerms && (
                        <svg className="w-3 h-3 text-stone-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-stone-400 text-xs leading-relaxed group-hover:text-stone-300 transition-colors">
                    Би 21 хоногийн үнэгүй байршуулалтын нөхцөлийг ойлгосон бөгөөд хугацаа дуусахад төлбөр төлөх эсвэл цомог устах болохыг зөвшөөрч байна.
                  </span>
                </label>
              </div>

              <button type="submit" disabled={saving || !agreedToTerms}
                className={`w-full mt-3 font-semibold rounded-xl py-3.5 transition-all flex items-center justify-center gap-2 ${
                  agreedToTerms
                    ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer'
                    : 'bg-stone-700 text-stone-500 cursor-not-allowed'
                } disabled:opacity-60`}>
                {saving ? <div className="w-5 h-5 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" /> : <><QrCode className="w-5 h-5" />Цомог үүсгэж QR код гаргах</>}
              </button>
              <button type="button" onClick={() => navigate('/dashboard')} className="w-full mt-3 text-stone-400 hover:text-white transition-colors py-2 text-sm">Цуцлах</button>
            </div>
          </div>
        </div>
      </form>

      {successData && (
        <SuccessModal shareLink={successData.shareLink} copied={copied} onCopy={copyLink} onDownloadQR={downloadQR}
          onGoToAlbum={() => navigate(`/dashboard/albums/${successData.albumId}`)} onClose={() => navigate('/dashboard')} />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-7 h-7 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-400">{icon}</div>
        <h2 className="text-white font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-stone-300 text-sm font-medium mb-2">
        {label}{required && <span className="text-amber-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <div className="flex items-center gap-1.5 mt-1.5"><AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /><p className="text-red-400 text-xs">{error}</p></div>}
    </div>
  );
}

function TypeToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-medium transition-all ${active ? 'bg-amber-500 text-stone-950' : 'bg-transparent text-stone-400 hover:text-stone-200'}`}>
      {icon}<span>{label}</span>
    </button>
  );
}

function FeeBreakdown({ price, revenueModel, organizerPercent, photographers }: { price: number; revenueModel: 'shared' | 'owned'; organizerPercent: number; photographers: PhotographerEntry[] }) {
  if (price <= 0) return <div className="bg-white/5 rounded-xl p-4 text-stone-500 text-sm text-center">Шимтгэлийн задаргааг харахын тулд үнэ оруулна уу</div>;
  const qpayAmt = Math.round(price * QPAY_FEE);
  const platAmt = Math.round(price * PLATFORM_FEE);
  if (revenueModel === 'owned') {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
        <p className="text-stone-300 text-sm font-medium mb-3">₮{price.toLocaleString()} үнийн задаргаа</p>
        <div className="flex justify-between text-xs"><span className="text-stone-400">QPay (1%)</span><span className="text-stone-400">₮{qpayAmt.toLocaleString()}</span></div>
        <div className="flex justify-between text-xs"><span className="text-stone-400">Платформ (3%)</span><span className="text-stone-400">₮{platAmt.toLocaleString()}</span></div>
        <div className="flex justify-between text-xs"><span className="text-amber-400">Таны хувь (96%)</span><span className="text-amber-400 font-medium">₮{Math.round(price * OWNER_COMMISSION_OWNED).toLocaleString()}</span></div>
      </div>
    );
  }
  const orgAmt = Math.round(price * organizerPercent / 100);
  const totalPct = photographers.reduce((s, p) => s + p.photographer_percent, 0);
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
      <p className="text-stone-300 text-sm font-medium mb-3">₮{price.toLocaleString()} үнийн задаргаа</p>
      <div className="flex justify-between text-xs"><span className="text-stone-400">QPay (1%)</span><span className="text-stone-400">₮{qpayAmt.toLocaleString()}</span></div>
      <div className="flex justify-between text-xs"><span className="text-stone-400">Платформ (3%)</span><span className="text-stone-400">₮{platAmt.toLocaleString()}</span></div>
      <div className="flex justify-between text-xs"><span className="text-amber-400">Зохион байгуулагч ({organizerPercent}%)</span><span className="text-amber-400 font-medium">₮{orgAmt.toLocaleString()}</span></div>
      {photographers.map(p => (
        <div key={p.zur_id} className="flex justify-between text-xs">
          <span className="text-green-400 truncate max-w-[60%]">{p.display_name} ({p.photographer_percent}%)</span>
          <span className="text-green-400 font-medium">₮{Math.round(price * p.photographer_percent / 100).toLocaleString()}</span>
        </div>
      ))}
      {totalPct < (96 - organizerPercent) && (
        <div className="flex justify-between text-xs">
          <span className="text-stone-500">Хуваарилагдаагүй ({96 - organizerPercent - totalPct}%)</span>
          <span className="text-stone-500">₮{Math.round(price * (96 - organizerPercent - totalPct) / 100).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

function SuccessModal({ shareLink, copied, onCopy, onDownloadQR, onGoToAlbum, onClose }: { shareLink: string; copied: boolean; onCopy: () => void; onDownloadQR: () => void; onGoToAlbum: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-stone-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 text-center border-b border-white/10">
          <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3"><CheckCircle2 className="w-7 h-7 text-green-400" /></div>
          <h2 className="text-white text-xl font-bold">Цомог үүслээ!</h2>
          <p className="text-stone-400 text-sm mt-1">Холбоос эсвэл QR кодыг зурагчид болон худалдан авагчидтай хуваалцаарай.</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex justify-center">
            <div className="bg-stone-50 rounded-xl p-3 inline-block">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareLink)}`} alt="QR Code" width={200} height={200} />
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl flex items-center gap-2 px-3 py-2.5 overflow-hidden">
            <span className="text-stone-300 text-sm truncate flex-1 font-mono text-xs">{shareLink}</span>
            <button onClick={onCopy} className="flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 flex-shrink-0">
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Хуулагдлаа!' : 'Хуулах'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onDownloadQR} className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl py-2.5 text-sm font-medium"><Download className="w-4 h-4" />QR татах</button>
            <button onClick={onGoToAlbum} className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl py-2.5 text-sm font-semibold">Цомог харах</button>
          </div>
          <button onClick={onClose} className="w-full text-stone-500 hover:text-stone-300 text-sm py-1">Хяналтын самбар руу буцах</button>
        </div>
      </div>
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `w-full bg-white/5 border ${hasError ? 'border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20' : 'border-white/10 focus:border-amber-500/50 focus:ring-amber-500/20'} focus:ring-2 text-white placeholder-stone-600 rounded-xl px-4 py-3 outline-none transition-all duration-200 [&_option]:bg-stone-900`;
}
