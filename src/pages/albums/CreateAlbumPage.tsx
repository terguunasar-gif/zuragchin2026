import { useState, useRef, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, ChevronLeft, AlertCircle, Upload, X,
  Type, Image as ImageIcon, Phone, Mail, Facebook,
  Instagram, Link as LinkIcon, CheckCircle2, Copy,
  Download, QrCode, UserPlus, Search, Trash2, Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
type WatermarkType = 'text' | 'image';
type WatermarkPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface FormErrors {
  name?: string;
  eventDate?: string;
  watermarkValue?: string;
  downloadPrice?: string;
  contactEmail?: string;
}

interface PhotographerEntry {
  zur_id: string;
  user_id: string;
  display_name: string;
  photographer_percent: number;
}

// ─── Watermark Position Grid ──────────────────────────────────────────────────
const POSITIONS: { value: WatermarkPosition; row: number; col: number }[] = [
  { value: 'top-left',      row: 0, col: 0 },
  { value: 'top-center',    row: 0, col: 1 },
  { value: 'top-right',     row: 0, col: 2 },
  { value: 'middle-left',   row: 1, col: 0 },
  { value: 'center',        row: 1, col: 1 },
  { value: 'middle-right',  row: 1, col: 2 },
  { value: 'bottom-left',   row: 2, col: 0 },
  { value: 'bottom-center', row: 2, col: 1 },
  { value: 'bottom-right',  row: 2, col: 2 },
];

const POSITION_LABEL: Record<WatermarkPosition, string> = {
  'top-left': 'Top Left', 'top-center': 'Top Center', 'top-right': 'Top Right',
  'middle-left': 'Middle Left', 'center': 'Center', 'middle-right': 'Middle Right',
  'bottom-left': 'Bottom Left', 'bottom-center': 'Bottom Center', 'bottom-right': 'Bottom Right',
};

// ─── Fee breakdown constants ──────────────────────────────────────────────────
const QPAY_FEE = 0.01;
const PLATFORM_FEE = 0.03;
const OWNER_COMMISSION_OWNED = 1 - QPAY_FEE - PLATFORM_FEE; // 0.96

const PREVIEW_IMAGE = 'https://images.pexels.com/photos/1190298/pexels-photo-1190298.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop';

// ─── Component ────────────────────────────────────────────────────────────────
export default function CreateAlbumPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Basic info
  const [albumName, setAlbumName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'draft' | 'active' | 'closed'>('draft');

  // Watermark
  const [wmType, setWmType] = useState<WatermarkType>('text');
  const [wmText, setWmText] = useState('© Zuragchin.mn');
  const [wmFontSize, setWmFontSize] = useState(24);
  const [wmOpacity, setWmOpacity] = useState(70);
  const [wmColor, setWmColor] = useState('#ffffff');
  const [wmPosition, setWmPosition] = useState<WatermarkPosition>('bottom-right');
  const [_wmImageFile, setWmImageFile] = useState<File | null>(null);
  const [wmImagePreview, setWmImagePreview] = useState<string>('');
  const wmImageInputRef = useRef<HTMLInputElement>(null);

  // Revenue model
  const [revenueModel, setRevenueModel] = useState<'shared' | 'owned'>('shared');

  // Organizer percent (shared mode only)
  const [organizerPercent, setOrganizerPercent] = useState(10);

  // Pricing
  const [isFree, setIsFree] = useState(false);
  const [downloadPrice, setDownloadPrice] = useState('');

  // Contact
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactFacebook, setContactFacebook] = useState('');
  const [contactInstagram, setContactInstagram] = useState('');
  const [contactOther, setContactOther] = useState('');

  // Photographers
  const [photographers, setPhotographers] = useState<PhotographerEntry[]>([]);
  const [zurIdInput, setZurIdInput] = useState('');
  const [searchingZur, setSearchingZur] = useState(false);
  const [zurError, setZurError] = useState('');

  // State
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [successData, setSuccessData] = useState<{ albumId: string; shareLink: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Computed: remaining percent for photographers
  const fixedFees = QPAY_FEE + PLATFORM_FEE; // 4%
  const availableForSplit = 1 - fixedFees; // 96%
  const organizerFraction = revenueModel === 'owned' ? availableForSplit : organizerPercent / 100;
  const photographerPoolFraction = revenueModel === 'owned' ? 0 : availableForSplit - organizerFraction;

  // ── Watermark image upload ─────────────────────────────────────────────────
  function handleWmImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setWmImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setWmImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  // ── Search photographer by ZUR-ID ─────────────────────────────────────────
  // ✅ ЗАСВАРЛАСАН: photographer_profiles хүснэгтээс zur_id-аар хайна
  async function addPhotographerByZurId() {
    setZurError('');
    const cleaned = zurIdInput.trim().toUpperCase();
    if (!cleaned.startsWith('ZUR-')) {
      setZurError('ZUR-XXXXX форматаар оруулна уу');
      return;
    }
    if (photographers.find(p => p.zur_id === cleaned)) {
      setZurError('Энэ зурагчин аль хэдийн нэмэгдсэн байна');
      return;
    }
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
    setPhotographers(prev => [
      ...prev,
      {
        zur_id: cleaned,
        user_id: data.user_id,
        display_name: data.display_name || cleaned,
        photographer_percent: defaultPct,
      },
    ]);
    setZurIdInput('');
    setSearchingZur(false);
  }

  function removePhotographer(zur_id: string) {
    setPhotographers(prev => prev.filter(p => p.zur_id !== zur_id));
  }

  function updatePhotographerPercent(zur_id: string, pct: number) {
    setPhotographers(prev =>
      prev.map(p => p.zur_id === zur_id ? { ...p, photographer_percent: pct } : p)
    );
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: FormErrors = {};
    if (!albumName.trim()) errs.name = 'Цомгийн нэр оруулна уу';
    if (!eventDate) errs.eventDate = 'Арга хэмжээний огноо оруулна уу';
    if (wmType === 'text' && !wmText.trim()) errs.watermarkValue = 'Усан тэмдгийн текст оруулна уу';
    if (!isFree) {
      const price = parseFloat(downloadPrice);
      if (!downloadPrice || isNaN(price) || price <= 0)
        errs.downloadPrice = '0-ээс их үнэ оруулна уу';
    }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
      errs.contactEmail = 'Зөв имэйл хаяг оруулна уу';
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

      let watermarkValue = '';
      if (wmType === 'text') {
        watermarkValue = JSON.stringify({ text: wmText, fontSize: wmFontSize, opacity: wmOpacity / 100, color: wmColor });
      } else if (wmImagePreview) {
        watermarkValue = wmImagePreview;
      }

      const contactInfo = { phone: contactPhone, email: contactEmail, facebook: contactFacebook, instagram: contactInstagram, other: contactOther };
      const ownerCommission = revenueModel === 'owned' ? OWNER_COMMISSION_OWNED : organizerPercent / 100;
      const photographerPercent = revenueModel === 'owned' ? 0 : (photographerPoolFraction * 100);

      const { error } = await supabase.from('albums').insert({
        id: albumId,
        owner_id: user!.id,
        name: albumName.trim(),
        event_date: eventDate,
        description: description.trim(),
        status,
        watermark_type: wmType,
        watermark_value: watermarkValue,
        watermark_position: wmPosition,
        download_price: isFree ? 0 : parseFloat(downloadPrice),
        is_free: isFree,
        owner_commission: ownerCommission,
        organizer_percent: ownerCommission * 100,
        photographer_percent: photographerPercent,
        revenue_model: revenueModel,
        share_link: shareLink,
        qr_code_url: shareUrl,
        contact_info: contactInfo,
      });

      if (error) throw error;

      if (photographers.length > 0) {
        const rows = photographers.map(p => ({
          album_id: albumId,
          photographer_id: p.user_id,
          status: 'approved',
        }));
        await supabase.from('album_photographers').insert(rows);
      }

      setSuccessData({ albumId, shareLink: shareUrl });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Алдаа гарлаа';
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

  const overlayPositionClass: Record<WatermarkPosition, string> = {
    'top-left':      'top-3 left-3 items-start justify-start',
    'top-center':    'top-3 left-0 right-0 justify-center items-start',
    'top-right':     'top-3 right-3 items-start justify-end',
    'middle-left':   'top-0 bottom-0 left-3 items-center justify-start',
    'center':        'inset-0 items-center justify-center',
    'middle-right':  'top-0 bottom-0 right-3 items-center justify-end',
    'bottom-left':   'bottom-3 left-3 items-end justify-start',
    'bottom-center': 'bottom-3 left-0 right-0 justify-center items-end',
    'bottom-right':  'bottom-3 right-3 items-end justify-end',
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-stone-400 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Хяналтын самбар</span>
          </button>
          <div className="h-5 w-px bg-white/10" />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center">
              <Camera className="w-4 h-4 text-stone-950" />
            </div>
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

            {/* ── Basic Info ── */}
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

            {/* ── Revenue Model ── */}
            <Section title="Орлогын загвар" icon={<span className="text-xs font-bold text-stone-400">%</span>}>
              <div className="space-y-4">
                <div className="flex rounded-xl overflow-hidden border border-white/10">
                  <TypeToggleBtn active={revenueModel === 'shared'} onClick={() => setRevenueModel('shared')} icon={<span className="text-xs font-bold">Хуваалцах</span>} label="Зурагчинтай хувааx" />
                  <TypeToggleBtn active={revenueModel === 'owned'} onClick={() => setRevenueModel('owned')} icon={<span className="text-xs font-bold">96%</span>} label="Бүрэн өмчлөх" />
                </div>

                {revenueModel === 'shared' && (
                  <div className="space-y-3">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-stone-400">QPay шимтгэл (тогтмол)</span>
                        <span className="text-stone-500 font-mono">1%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-stone-400">Платформ шимтгэл (тогтмол)</span>
                        <span className="text-stone-500 font-mono">3%</span>
                      </div>
                      <div className="border-t border-white/10 pt-3">
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-amber-400 font-medium">Таны хувь (зохион байгуулагч)</span>
                          <span className="text-amber-400 font-mono font-bold">{organizerPercent}%</span>
                        </div>
                        <input
                          type="range" min={0} max={92} step={1}
                          value={organizerPercent}
                          onChange={e => setOrganizerPercent(Number(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-green-400 font-medium">Зурагчдын хувийн сан</span>
                        <span className="text-green-400 font-mono font-bold">{Math.max(0, 96 - organizerPercent)}%</span>
                      </div>
                    </div>
                    <p className="text-stone-500 text-xs">Зурагчдын хувийг доорх хэсэгт тус тусад нь тохируулна уу. Нийт хувь нь {Math.max(0, 96 - organizerPercent)}%-аас хэтрэхгүй байх ёстой.</p>
                  </div>
                )}

                {revenueModel === 'owned' && (
                  <div className="rounded-xl p-4 border bg-amber-500/5 border-amber-500/20 text-amber-300 text-sm">
                    <p>Зурагчидыг урьдчилж хөлслөсөн тохиолдолд зохион байгуулагч борлуулалтын <strong>96%</strong> авна (QPay 1% + Платформ 3% хасагдана).</p>
                  </div>
                )}
              </div>
            </Section>

            {/* ── Photographers ── */}
            <Section title="Зурагчин нэмэх" icon={<Users className="w-4 h-4" />}>
              <div className="space-y-4">
                <p className="text-stone-500 text-sm">ZUR-ID-ээр зурагчин нэмнэ үү. Нэмэгдсэн зурагчид шууд зөвшөөрөгдсөн байна.</p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
                    <input
                      type="text"
                      value={zurIdInput}
                      onChange={e => setZurIdInput(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPhotographerByZurId())}
                      placeholder="ZUR-XXXXX"
                      className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white placeholder-stone-600 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addPhotographerByZurId}
                    disabled={searchingZur || !zurIdInput.trim()}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
                  >
                    {searchingZur
                      ? <div className="w-4 h-4 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
                      : <UserPlus className="w-4 h-4" />
                    }
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
                    {photographers.map(p => (
                      <div key={p.zur_id} className="bg-stone-900 border border-white/10 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                            <Camera className="w-4 h-4 text-amber-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-sm truncate">{p.display_name}</p>
                            <p className="text-stone-500 text-xs font-mono">{p.zur_id}</p>
                          </div>
                          {revenueModel === 'shared' && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-stone-400 text-xs">Хувь:</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={Math.max(0, 96 - organizerPercent)}
                                  value={p.photographer_percent}
                                  onChange={e => updatePhotographerPercent(p.zur_id, Number(e.target.value))}
                                  className="w-14 bg-stone-800 border border-white/10 text-amber-400 text-sm font-mono rounded-lg px-2 py-1 outline-none text-center"
                                />
                                <span className="text-stone-500 text-xs">%</span>
                              </div>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removePhotographer(p.zur_id)}
                            className="w-7 h-7 flex items-center justify-center text-stone-600 hover:text-red-400 transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {revenueModel === 'shared' && (
                      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs">
                        <div className="flex justify-between text-stone-400 mb-1">
                          <span>Зурагчдын нийт хувь:</span>
                          <span className={`font-mono font-bold ${
                            photographers.reduce((s, p) => s + p.photographer_percent, 0) > (96 - organizerPercent)
                              ? 'text-red-400' : 'text-green-400'
                          }`}>
                            {photographers.reduce((s, p) => s + p.photographer_percent, 0)}% / {Math.max(0, 96 - organizerPercent)}%
                          </span>
                        </div>
                        {photographers.reduce((s, p) => s + p.photographer_percent, 0) > (96 - organizerPercent) && (
                          <p className="text-red-400">⚠ Нийт хувь хязгаараас хэтэрсэн байна</p>
                        )}
                      </div>
                    )}
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

            {/* ── Watermark ── */}
            <Section title="Усан тэмдгийн тохиргоо" icon={<Type className="w-4 h-4" />}>
              <div className="space-y-5">
                <div className="flex rounded-xl overflow-hidden border border-white/10">
                  <TypeToggleBtn active={wmType === 'text'} onClick={() => setWmType('text')} icon={<Type className="w-4 h-4" />} label="Текст усан тэмдэг" />
                  <TypeToggleBtn active={wmType === 'image'} onClick={() => setWmType('image')} icon={<ImageIcon className="w-4 h-4" />} label="Лого / зураг" />
                </div>

                {wmType === 'text' ? (
                  <div className="space-y-4">
                    <Field label="Усан тэмдгийн текст" error={errors.watermarkValue} required>
                      <input type="text" value={wmText} onChange={e => setWmText(e.target.value)} placeholder="© Your Studio Name" className={inputClass(!!errors.watermarkValue)} />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label={`Фонтын хэмжээ: ${wmFontSize}px`}>
                        <input type="range" min={12} max={60} value={wmFontSize} onChange={e => setWmFontSize(Number(e.target.value))} className="w-full accent-amber-500 mt-1" />
                      </Field>
                      <Field label="Текстийн өнгө">
                        <div className="flex items-center gap-3 mt-1">
                          <input type="color" value={wmColor} onChange={e => setWmColor(e.target.value)} className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                          <span className="text-stone-300 text-sm font-mono">{wmColor}</span>
                        </div>
                      </Field>
                    </div>
                    <Field label={`Тунгалаг байдал: ${wmOpacity}%`}>
                      <input type="range" min={10} max={100} value={wmOpacity} onChange={e => setWmOpacity(Number(e.target.value))} className="w-full accent-amber-500 mt-1" />
                    </Field>
                  </div>
                ) : (
                  <div>
                    <input ref={wmImageInputRef} type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={handleWmImageChange} />
                    {wmImagePreview ? (
                      <div className="relative inline-block">
                        <img src={wmImagePreview} alt="Watermark logo" className="h-20 rounded-lg border border-white/10 object-contain bg-white/5 px-4" />
                        <button type="button" onClick={() => { setWmImageFile(null); setWmImagePreview(''); }} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400 transition-colors">
                          <X className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => wmImageInputRef.current?.click()} className="w-full border-2 border-dashed border-white/20 hover:border-amber-500/50 hover:bg-amber-500/5 rounded-xl py-8 flex flex-col items-center gap-3 text-stone-400 hover:text-amber-400 transition-all duration-200">
                        <Upload className="w-8 h-8" />
                        <div className="text-center">
                          <p className="font-medium">Лого / усан тэмдгийн зураг байршуулах</p>
                          <p className="text-sm opacity-70 mt-0.5">Тунгалаг PNG зураг ашиглахыг зөвлөж байна</p>
                        </div>
                      </button>
                    )}
                  </div>
                )}

                <Field label="Байршил">
                  <div className="grid grid-cols-3 gap-1.5 w-fit mt-1">
                    {POSITIONS.map(p => (
                      <button key={p.value} type="button" title={POSITION_LABEL[p.value]} onClick={() => setWmPosition(p.value)}
                        className={`w-12 h-12 rounded-lg border transition-all duration-150 flex items-center justify-center ${wmPosition === p.value ? 'bg-amber-500 border-amber-500' : 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10'}`}>
                        <div className={`w-2 h-2 rounded-full ${wmPosition === p.value ? 'bg-stone-950' : 'bg-white/40'}`} />
                      </button>
                    ))}
                  </div>
                  <p className="text-stone-500 text-xs mt-2">{POSITION_LABEL[wmPosition]}</p>
                </Field>
              </div>
            </Section>

            {/* ── Pricing ── */}
            <Section title="Үнэлгээ" icon={<span className="text-xs font-bold text-stone-400">₮</span>}>
              <div className="space-y-5">
                <div className="flex rounded-xl overflow-hidden border border-white/10">
                  <TypeToggleBtn active={isFree} onClick={() => setIsFree(true)} icon={<span className="text-xs font-bold">FREE</span>} label="Үнэгүй татах" />
                  <TypeToggleBtn active={!isFree} onClick={() => setIsFree(false)} icon={<span className="text-xs font-bold">₮</span>} label="Төлбөртэй татах" />
                </div>
                {!isFree && (
                  <Field label="Татах үнэ (₮)" error={errors.downloadPrice} required>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-medium">₮</span>
                      <input type="number" value={downloadPrice} onChange={e => setDownloadPrice(e.target.value)} placeholder="10000" min={1} className={inputClass(!!errors.downloadPrice) + ' pl-8'} />
                    </div>
                  </Field>
                )}
                <FeeBreakdown
                  price={isFree ? 0 : parseFloat(downloadPrice) || 0}
                  revenueModel={revenueModel}
                  organizerPercent={organizerPercent}
                  photographers={photographers}
                />
              </div>
            </Section>

            {/* ── Contact Info ── */}
            <Section title="Холбоо барих мэдээлэл" icon={<Phone className="w-4 h-4" />}>
              <p className="text-stone-500 text-sm mb-4">Таны цомогт нэгдэх зурагчидад харагдана.</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Утасны дугаар">
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                      <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+976 9900 0000" className={inputClass(false) + ' pl-10'} />
                    </div>
                  </Field>
                  <Field label="Имэйл" error={errors.contactEmail}>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                      <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="organizer@example.com" className={inputClass(!!errors.contactEmail) + ' pl-10'} />
                    </div>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Facebook">
                    <div className="relative">
                      <Facebook className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                      <input type="url" value={contactFacebook} onChange={e => setContactFacebook(e.target.value)} placeholder="https://facebook.com/..." className={inputClass(false) + ' pl-10'} />
                    </div>
                  </Field>
                  <Field label="Instagram">
                    <div className="relative">
                      <Instagram className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                      <input type="url" value={contactInstagram} onChange={e => setContactInstagram(e.target.value)} placeholder="https://instagram.com/..." className={inputClass(false) + ' pl-10'} />
                    </div>
                  </Field>
                </div>
                <Field label="Бусад холбоос">
                  <div className="relative">
                    <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                    <input type="url" value={contactOther} onChange={e => setContactOther(e.target.value)} placeholder="https://..." className={inputClass(false) + ' pl-10'} />
                  </div>
                </Field>
              </div>
            </Section>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6">
            <div className="sticky top-24">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-stone-300 text-sm font-medium mb-3">Усан тэмдгийн урьдчилан харах</p>
                <div className="relative rounded-xl overflow-hidden aspect-[3/2]">
                  <img src={PREVIEW_IMAGE} alt="Sample preview" className="w-full h-full object-cover" />
                  <div className={`absolute flex ${overlayPositionClass[wmPosition]} pointer-events-none`}>
                    {wmType === 'text' && wmText && (
                      <span className="font-semibold px-1 select-none whitespace-nowrap"
                        style={{ fontSize: `${Math.max(8, Math.round(wmFontSize * 0.4))}px`, color: wmColor, opacity: wmOpacity / 100, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                        {wmText}
                      </span>
                    )}
                    {wmType === 'image' && wmImagePreview && (
                      <img src={wmImagePreview} alt="watermark" className="h-8 object-contain" style={{ opacity: wmOpacity / 100 }} />
                    )}
                  </div>
                </div>
                <p className="text-stone-600 text-xs mt-2 text-center">Худалдан авагчид ийм байдлаар усан тэмдэгтэй зурагнуудыг харна</p>
              </div>

              <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2 text-xs">
                <p className="text-stone-300 font-medium mb-2">Цомгийн тойм</p>
                <div className="flex justify-between text-stone-400">
                  <span>Зурагчид</span>
                  <span className="text-white">{photographers.length} нэмэгдсэн</span>
                </div>
                <div className="flex justify-between text-stone-400">
                  <span>Загвар</span>
                  <span className="text-white">{revenueModel === 'shared' ? 'Хуваалцах' : 'Бүрэн өмчлөх'}</span>
                </div>
                <div className="flex justify-between text-stone-400">
                  <span>Үнэ</span>
                  <span className="text-white">{isFree ? 'Үнэгүй' : `₮${parseFloat(downloadPrice || '0').toLocaleString()}`}</span>
                </div>
              </div>

              <button type="submit" disabled={saving}
                className="w-full mt-4 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-xl py-3.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {saving
                  ? <div className="w-5 h-5 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
                  : <><QrCode className="w-5 h-5" />Цомог үүсгэж QR код гаргах</>
                }
              </button>
              <button type="button" onClick={() => navigate('/dashboard')} className="w-full mt-3 text-stone-400 hover:text-white transition-colors py-2 text-sm">Цуцлах</button>
            </div>
          </div>
        </div>
      </form>

      {successData && (
        <SuccessModal
          shareLink={successData.shareLink}
          copied={copied}
          onCopy={copyLink}
          onDownloadQR={downloadQR}
          onGoToAlbum={() => navigate(`/dashboard/albums/${successData.albumId}`)}
          onClose={() => navigate('/dashboard')}
        />
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
      {error && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </div>
  );
}

function TypeToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-medium transition-all duration-200 ${active ? 'bg-amber-500 text-stone-950' : 'bg-transparent text-stone-400 hover:text-stone-200'}`}>
      {icon}<span>{label}</span>
    </button>
  );
}

function FeeBreakdown({ price, revenueModel, organizerPercent, photographers }: {
  price: number;
  revenueModel: 'shared' | 'owned';
  organizerPercent: number;
  photographers: PhotographerEntry[];
}) {
  if (price <= 0) return (
    <div className="bg-white/5 rounded-xl p-4 text-stone-500 text-sm text-center">Шимтгэлийн задаргааг харахын тулд үнэ оруулна уу</div>
  );

  const qpayAmt = Math.round(price * QPAY_FEE);
  const platAmt = Math.round(price * PLATFORM_FEE);

  if (revenueModel === 'owned') {
    const ownerAmt = Math.round(price * OWNER_COMMISSION_OWNED);
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
        <p className="text-stone-300 text-sm font-medium mb-3">₮{price.toLocaleString()} үнийн задаргаа</p>
        {[
          { label: 'QPay (1%)', amt: qpayAmt, color: 'text-stone-400' },
          { label: 'Платформ (3%)', amt: platAmt, color: 'text-stone-300' },
          { label: 'Таны хувь (96%)', amt: ownerAmt, color: 'text-amber-400' },
        ].map(r => (
          <div key={r.label} className="flex justify-between text-xs mb-1">
            <span className="text-stone-400">{r.label}</span>
            <span className={r.color + ' font-medium'}>₮{r.amt.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }

  const orgAmt = Math.round(price * organizerPercent / 100);
  const totalPhotoPercent = photographers.reduce((s, p) => s + p.photographer_percent, 0);

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
      {totalPhotoPercent < (96 - organizerPercent) && (
        <div className="flex justify-between text-xs">
          <span className="text-stone-500">Хуваарилагдаагүй ({96 - organizerPercent - totalPhotoPercent}%)</span>
          <span className="text-stone-500">₮{Math.round(price * (96 - organizerPercent - totalPhotoPercent) / 100).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

function SuccessModal({ shareLink, copied, onCopy, onDownloadQR, onGoToAlbum, onClose }: {
  shareLink: string; copied: boolean; onCopy: () => void; onDownloadQR: () => void; onGoToAlbum: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-stone-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 text-center border-b border-white/10">
          <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-7 h-7 text-green-400" />
          </div>
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
            <button onClick={onCopy} className="flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors flex-shrink-0">
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Хуулагдлаа!' : 'Хуулах'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onDownloadQR} className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl py-2.5 text-sm font-medium transition-all duration-200">
              <Download className="w-4 h-4" />QR татах
            </button>
            <button onClick={onGoToAlbum} className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200">
              Цомог харах
            </button>
          </div>
          <button onClick={onClose} className="w-full text-stone-500 hover:text-stone-300 text-sm transition-colors py-1">Хяналтын самбар руу буцах</button>
        </div>
      </div>
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `w-full bg-white/5 border ${hasError ? 'border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20' : 'border-white/10 focus:border-amber-500/50 focus:ring-amber-500/20'} focus:ring-2 text-white placeholder-stone-600 rounded-xl px-4 py-3 outline-none transition-all duration-200 [&_option]:bg-stone-900`;
}
