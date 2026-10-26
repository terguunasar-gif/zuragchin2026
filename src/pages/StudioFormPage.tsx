import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ImagePlus, Store } from 'lucide-react';
import LocationPicker from '../components/map/LocationPicker';
import StudioChrome from '../components/StudioChrome';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  fetchStudioBySlug,
  makeStudioSlug,
  STUDIO_CITIES,
  STUDIO_SPECIALTIES,
  STUDIO_STATUS_LABEL,
  uploadStudioImage,
  type Studio,
  type StudioStatus,
} from '../lib/studios';

const fieldClass = 'w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none text-sm transition-colors';

interface FormState {
  name: string;
  description: string;
  phone: string;
  instagram: string;
  facebook: string;
  address: string;
  city: string;
  district: string;
  specialties: string[];
  latitude: number | null;
  longitude: number | null;
  logo_url: string;
  cover_url: string;
  is_visible: boolean;
}

const EMPTY: FormState = {
  name: '',
  description: '',
  phone: '',
  instagram: '',
  facebook: '',
  address: '',
  city: '',
  district: '',
  specialties: [],
  latitude: null,
  longitude: null,
  logo_url: '',
  cover_url: '',
  is_visible: true,
};

export default function StudioFormPage() {
  const { slug } = useParams();
  const editing = Boolean(slug);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [existing, setExisting] = useState<Studio | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);

  useEffect(() => {
    if (!slug || !profile) return;
    let cancelled = false;
    setLoading(true);
    fetchStudioBySlug(slug)
      .then(row => {
        if (cancelled) return;
        if (!row || row.owner_user_id !== profile.id) {
          setError('Студи олдсонгүй эсвэл засварлах эрхгүй.');
          return;
        }
        setExisting(row);
        setForm({
          name: row.name,
          description: row.description,
          phone: row.phone,
          instagram: row.instagram,
          facebook: row.facebook,
          address: row.address,
          city: row.city,
          district: row.district,
          specialties: row.specialties,
          latitude: row.latitude,
          longitude: row.longitude,
          logo_url: row.logo_url ?? '',
          cover_url: row.cover_url ?? '',
          is_visible: row.is_visible,
        });
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Ачааллахад алдаа гарлаа'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug, profile]);

  function patch(partial: Partial<FormState>) {
    setForm(prev => ({ ...prev, ...partial }));
  }

  function toggleSpecialty(tag: string) {
    setForm(prev => ({
      ...prev,
      specialties: prev.specialties.includes(tag)
        ? prev.specialties.filter(item => item !== tag)
        : [...prev.specialties, tag],
    }));
  }

  async function onFile(kind: 'logo' | 'cover', file: File | undefined) {
    if (!file || !profile) return;
    setUploading(kind);
    setError('');
    try {
      const url = await uploadStudioImage(profile.id, file, kind);
      patch(kind === 'logo' ? { logo_url: url } : { cover_url: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Зураг байршуулахад алдаа гарлаа');
    } finally {
      setUploading(null);
    }
  }

  async function save(nextStatus: StudioStatus) {
    if (!profile) return;
    const name = form.name.trim();
    if (!name) {
      setError('Студийн нэрийг оруулна уу.');
      return;
    }
    if (form.latitude == null || form.longitude == null) {
      setError('Газрын зураг дээр дарж студийн байршлаа тэмдэглэнэ үү.');
      return;
    }
    const status: StudioStatus = existing?.status === 'approved' ? 'approved' : nextStatus;
    const isVisible = status === 'approved' ? form.is_visible : false;
    const payload = {
      name,
      description: form.description.trim(),
      phone: form.phone.trim(),
      instagram: form.instagram.trim().replace(/^@/, ''),
      facebook: form.facebook.trim(),
      address: form.address.trim(),
      city: form.city,
      district: form.district.trim(),
      latitude: form.latitude,
      longitude: form.longitude,
      logo_url: form.logo_url || null,
      cover_url: form.cover_url || null,
      specialties: form.specialties,
      status,
      is_visible: isVisible,
    };

    setSaving(true);
    setError('');
    try {
      if (existing) {
        const { error: updateError } = await supabase.from('studios').update(payload).eq('id', existing.id);
        if (updateError) throw updateError;
        navigate(`/studios/${existing.slug}`);
        return;
      }
      let slugValue = makeStudioSlug(name);
      let createdSlug = '';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error: insertError } = await supabase
          .from('studios')
          .insert({ ...payload, owner_user_id: profile.id, slug: slugValue })
          .select('slug')
          .single();
        if (!insertError && data) {
          createdSlug = data.slug as string;
          break;
        }
        if (insertError && insertError.code !== '23505') throw insertError;
        slugValue = makeStudioSlug(name);
      }
      if (!createdSlug) throw new Error('Хаяг давхцлаа. Дахин оролдоно уу.');
      navigate(`/studios/${createdSlug}`);
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Хадгалахад алдаа гарлаа';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  const approved = existing?.status === 'approved';

  return (
    <StudioChrome backTo={editing ? `/studios/${slug}` : '/studios'} backLabel="Буцах">
      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Store className="w-6 h-6 text-amber-400" />
          <h1 className="text-2xl font-bold">{editing ? 'Студи засах' : 'Студи бүртгүүлэх'}</h1>
        </div>
        <p className="text-stone-400 text-sm mb-6">
          Зурагчнаас тусдаа фото студи. Илгээсний дараа админ баталснаар газрын зургийн хайлтад гарна.
          {existing ? ` Одоогийн төлөв: ${STUDIO_STATUS_LABEL[existing.status]}.` : ''}
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : (
          <form className="space-y-5" onSubmit={e => { e.preventDefault(); void save(approved ? 'approved' : 'pending'); }}>
            <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold">Үндсэн мэдээлэл</h2>
              <label className="block">
                <span className="block text-stone-400 text-xs mb-1.5">Нэр</span>
                <input value={form.name} onChange={e => patch({ name: e.target.value })} maxLength={160} className={fieldClass} placeholder="Жишээ: Гэрэл студи" />
              </label>
              <label className="block">
                <span className="block text-stone-400 text-xs mb-1.5">Танилцуулга</span>
                <textarea value={form.description} onChange={e => patch({ description: e.target.value })} rows={4} maxLength={4000} className={fieldClass} placeholder="Студи юу санал болгодог вэ?" />
              </label>
              <div>
                <span className="block text-stone-400 text-xs mb-2">Чиглэл</span>
                <div className="flex flex-wrap gap-2">
                  {STUDIO_SPECIALTIES.map(tag => {
                    const on = form.specialties.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleSpecialty(tag)}
                        className={`px-3 py-1.5 rounded-full text-sm ${on ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 border border-white/10 text-stone-300'}`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold">Холбоо барих</h2>
              <label className="block">
                <span className="block text-stone-400 text-xs mb-1.5">Утас</span>
                <input value={form.phone} onChange={e => patch({ phone: e.target.value })} className={fieldClass} placeholder="9911..." />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-stone-400 text-xs mb-1.5">Instagram</span>
                  <input value={form.instagram} onChange={e => patch({ instagram: e.target.value })} className={fieldClass} placeholder="@studio" />
                </label>
                <label className="block">
                  <span className="block text-stone-400 text-xs mb-1.5">Facebook</span>
                  <input value={form.facebook} onChange={e => patch({ facebook: e.target.value })} className={fieldClass} placeholder="facebook.com/..." />
                </label>
              </div>
            </section>

            <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold">Хаяг ба байршил</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-stone-400 text-xs mb-1.5">Хот / аймаг</span>
                  <select value={form.city} onChange={e => patch({ city: e.target.value })} className={fieldClass}>
                    <option value="">Сонгох</option>
                    {STUDIO_CITIES.map(city => <option key={city} value={city}>{city}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-stone-400 text-xs mb-1.5">Дүүрэг</span>
                  <input value={form.district} onChange={e => patch({ district: e.target.value })} className={fieldClass} placeholder="Сүхбаатар" />
                </label>
              </div>
              <label className="block">
                <span className="block text-stone-400 text-xs mb-1.5">Хаяг</span>
                <input value={form.address} onChange={e => patch({ address: e.target.value })} className={fieldClass} placeholder="Гудамж, байр, тоот" />
              </label>
              <LocationPicker
                value={form.latitude != null && form.longitude != null ? { lat: form.latitude, lng: form.longitude } : null}
                onChange={pos => patch({ latitude: pos.lat, longitude: pos.lng })}
              />
            </section>

            <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold">Зураг</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ImageField label="Лого" url={form.logo_url} busy={uploading === 'logo'} onPick={file => void onFile('logo', file)} onClear={() => patch({ logo_url: '' })} />
                <ImageField label="Хавтгай зураг" url={form.cover_url} busy={uploading === 'cover'} onPick={file => void onFile('cover', file)} onClear={() => patch({ cover_url: '' })} />
              </div>
            </section>

            {approved && (
              <section className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Хайлтад харуулах</h2>
                  <p className="text-stone-500 text-xs mt-1">Батлагдсан студийг түр нууж болно.</p>
                </div>
                <button
                  type="button"
                  onClick={() => patch({ is_visible: !form.is_visible })}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border ${form.is_visible ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-stone-400'}`}
                >
                  {form.is_visible ? 'Харагдаж байна' : 'Нуугдсан'}
                </button>
              </section>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex flex-wrap gap-3">
              {!approved && (
                <button
                  type="button"
                  disabled={saving || uploading != null}
                  onClick={() => void save('draft')}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium border border-white/10 text-stone-200 hover:bg-white/5 disabled:opacity-60"
                >
                  Ноорог хадгалах
                </button>
              )}
              <button
                type="submit"
                disabled={saving || uploading != null}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 disabled:opacity-60"
              >
                {saving ? 'Хадгалж байна…' : approved ? 'Хадгалах' : 'Баталгаажуулахаар илгээх'}
              </button>
            </div>
          </form>
        )}
      </main>
    </StudioChrome>
  );
}

function ImageField({
  label,
  url,
  busy,
  onPick,
  onClear,
}: {
  label: string;
  url: string;
  busy: boolean;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <p className="text-stone-400 text-xs mb-1.5">{label}</p>
      <label className="flex flex-col items-center justify-center gap-2 h-28 rounded-xl border border-dashed border-white/15 bg-stone-900/60 cursor-pointer overflow-hidden">
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : busy ? (
          <span className="text-stone-400 text-xs">Байршуулж байна…</span>
        ) : (
          <>
            <ImagePlus className="w-5 h-5 text-amber-400" />
            <span className="text-stone-500 text-xs">JPG, PNG, WebP</span>
          </>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => onPick(e.target.files?.[0])}
        />
      </label>
      {url && (
        <button type="button" onClick={onClear} className="text-xs text-stone-500 hover:text-white mt-1">
          Хасах
        </button>
      )}
    </div>
  );
}
