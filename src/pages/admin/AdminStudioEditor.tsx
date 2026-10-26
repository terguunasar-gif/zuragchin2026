import { useEffect, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import LocationPicker from '../../components/map/LocationPicker';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  fromDatetimeLocalValue,
  listingWindowError,
  makeStudioSlug,
  normalizeStudio,
  searchStudioOwners,
  STUDIO_CITIES,
  STUDIO_SPECIALTIES,
  studioOwnerLabel,
  toDatetimeLocalValue,
  uploadStudioImage,
  type Studio,
  type StudioOwner,
} from '../../lib/studios';

const fieldClass = 'w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none text-sm transition-colors [color-scheme:dark]';

interface EditorState {
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
  show_on_home: boolean;
  listed_from: string;
  listed_until: string;
  owner: StudioOwner | null;
}

function emptyState(): EditorState {
  return {
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
    show_on_home: true,
    listed_from: '',
    listed_until: '',
    owner: null,
  };
}

function fromStudio(studio: Studio, owner: StudioOwner | null): EditorState {
  return {
    name: studio.name,
    description: studio.description,
    phone: studio.phone,
    instagram: studio.instagram,
    facebook: studio.facebook,
    address: studio.address,
    city: studio.city,
    district: studio.district,
    specialties: studio.specialties,
    latitude: studio.latitude,
    longitude: studio.longitude,
    logo_url: studio.logo_url ?? '',
    cover_url: studio.cover_url ?? '',
    is_visible: studio.is_visible,
    show_on_home: studio.show_on_home,
    listed_from: toDatetimeLocalValue(studio.listed_from),
    listed_until: toDatetimeLocalValue(studio.listed_until),
    owner,
  };
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: string }).message);
  return fallback;
}

export default function AdminStudioEditor({
  studio,
  owner,
  onClose,
  onSaved,
}: {
  studio: Studio | null;
  owner: StudioOwner | null;
  onClose: () => void;
  onSaved: (studio: Studio, owner: StudioOwner | null) => void;
}) {
  const { profile } = useAuth();
  const editing = Boolean(studio);
  const [form, setForm] = useState<EditorState>(() => (studio ? fromStudio(studio, owner) : emptyState()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);

  function patch(partial: Partial<EditorState>) {
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
      setError(errorMessage(err, 'Зураг байршуулахад алдаа гарлаа'));
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    const name = form.name.trim();
    if (!name) {
      setError('Студийн нэрийг оруулна уу.');
      return;
    }
    if (form.is_visible && (form.latitude == null || form.longitude == null)) {
      setError('Хайлтад гаргахын тулд газрын зураг дээр цэг тавина уу.');
      return;
    }
    const listedFrom = fromDatetimeLocalValue(form.listed_from);
    const listedUntil = fromDatetimeLocalValue(form.listed_until);
    const windowError = listingWindowError(listedFrom, listedUntil);
    if (windowError) {
      setError(windowError);
      return;
    }
    if ((form.listed_from && !listedFrom) || (form.listed_until && !listedUntil)) {
      setError('Огноо буруу байна.');
      return;
    }

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
      is_visible: form.is_visible,
      show_on_home: form.show_on_home,
      listed_from: listedFrom,
      listed_until: listedUntil,
      owner_user_id: form.owner?.id ?? null,
    };

    setSaving(true);
    setError('');
    try {
      if (studio) {
        const { data, error: updateError } = await supabase
          .from('studios')
          .update(payload)
          .eq('id', studio.id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        onSaved(normalizeStudio(data as Studio), form.owner);
        return;
      }

      let slugValue = makeStudioSlug(name);
      let created: Studio | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error: insertError } = await supabase
          .from('studios')
          .insert({ ...payload, slug: slugValue, status: 'approved' })
          .select('*')
          .single();
        if (!insertError && data) {
          created = normalizeStudio(data as Studio);
          break;
        }
        if (insertError && insertError.code !== '23505') throw insertError;
        slugValue = makeStudioSlug(name);
      }
      if (!created) throw new Error('Хаяг давхцлаа. Дахин оролдоно уу.');
      onSaved(created, form.owner);
    } catch (err) {
      setError(errorMessage(err, 'Хадгалахад алдаа гарлаа'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto bg-stone-950 border border-white/10 rounded-2xl shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="admin-studio-editor-title">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div>
            <h3 id="admin-studio-editor-title" className="text-white font-semibold">
              {editing ? 'Студи засах' : 'Студи нэмэх'}
            </h3>
            <p className="text-stone-500 text-xs mt-1">
              {editing
                ? 'Агуулга, эзэмшигч, жагсаалтын хугацаа, харагдац.'
                : 'Админ нэмсэн студи шууд батлагдсан төлөвтэй хадгалагдана.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-white p-1" aria-label="Хаах">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form className="p-5 space-y-5" onSubmit={e => { e.preventDefault(); void save(); }}>
          <section className="space-y-4">
            <h4 className="text-white text-sm font-semibold">Үндсэн мэдээлэл</h4>
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

          <section className="space-y-4">
            <h4 className="text-white text-sm font-semibold">Холбоо барих</h4>
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

          <section className="space-y-4">
            <h4 className="text-white text-sm font-semibold">Хаяг ба байршил</h4>
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

          <section className="space-y-4">
            <h4 className="text-white text-sm font-semibold">Зураг</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ImageField label="Лого" url={form.logo_url} busy={uploading === 'logo'} onPick={file => void onFile('logo', file)} onClear={() => patch({ logo_url: '' })} />
              <ImageField label="Хавтгай зураг" url={form.cover_url} busy={uploading === 'cover'} onPick={file => void onFile('cover', file)} onClear={() => patch({ cover_url: '' })} />
            </div>
          </section>

          <section className="space-y-4 border-t border-white/10 pt-5">
            <h4 className="text-white text-sm font-semibold">Эзэмшигч</h4>
            <OwnerPicker value={form.owner} onChange={next => patch({ owner: next })} />
          </section>

          <section className="space-y-4">
            <div>
              <h4 className="text-white text-sm font-semibold">Жагсаалтын хугацаа</h4>
              <p className="text-stone-500 text-xs mt-1">Хоосон орхивол хязгааргүй. Цонхны гадна студи хайлт болон нүүрэнд гарахгүй.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-stone-400 text-xs mb-1.5">Эхлэх</span>
                <input type="datetime-local" value={form.listed_from} onChange={e => patch({ listed_from: e.target.value })} className={fieldClass} />
                {form.listed_from && (
                  <button type="button" onClick={() => patch({ listed_from: '' })} className="text-xs text-stone-500 hover:text-white mt-1">Хязгааргүй болгох</button>
                )}
              </label>
              <label className="block">
                <span className="block text-stone-400 text-xs mb-1.5">Дуусах</span>
                <input type="datetime-local" value={form.listed_until} onChange={e => patch({ listed_until: e.target.value })} className={fieldClass} />
                {form.listed_until && (
                  <button type="button" onClick={() => patch({ listed_until: '' })} className="text-xs text-stone-500 hover:text-white mt-1">Хязгааргүй болгох</button>
                )}
              </label>
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ToggleCard
              title="Хайлтад харуулах"
              hint="Батлагдсан үед /studios дээр гарна."
              on={form.is_visible}
              onLabel="Харагдаж байна"
              offLabel="Нуугдсан"
              onClick={() => patch({ is_visible: !form.is_visible })}
            />
            <ToggleCard
              title="Нүүр хуудас"
              hint="Хайлтаас тусдаа. Нүүрэнд гарахад харагдах + хугацаа хэрэгтэй."
              on={form.show_on_home}
              onLabel="Нүүрэнд гарна"
              offLabel="Нүүрнээс хаасан"
              onClick={() => patch({ show_on_home: !form.show_on_home })}
            />
          </section>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-white/10 text-stone-200 hover:bg-white/5">
              Болих
            </button>
            <button type="submit" disabled={saving || uploading != null} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 disabled:opacity-60">
              {saving ? 'Хадгалж байна…' : editing ? 'Хадгалах' : 'Студи нэмэх'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function OwnerAssignDialog({
  studio,
  owner,
  onClose,
  onSaved,
}: {
  studio: Studio;
  owner: StudioOwner | null;
  onClose: () => void;
  onSaved: (owner: StudioOwner | null) => void;
}) {
  const [next, setNext] = useState<StudioOwner | null>(owner);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase
      .from('studios')
      .update({ owner_user_id: next?.id ?? null })
      .eq('id', studio.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved(next);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div className="max-w-lg mx-auto bg-stone-950 border border-white/10 rounded-2xl shadow-2xl p-5" role="dialog" aria-modal="true" aria-labelledby="owner-assign-title">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 id="owner-assign-title" className="text-white font-semibold">Эзэмшигч оноох</h3>
            <p className="text-stone-500 text-xs mt-1">{studio.name}. Одоо: {studioOwnerLabel(owner)}.</p>
          </div>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-white p-1" aria-label="Хаах">
            <X className="w-5 h-5" />
          </button>
        </div>
        <OwnerPicker value={next} onChange={setNext} />
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-white/10 text-stone-200">Болих</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-stone-950 disabled:opacity-60">
            {saving ? 'Хадгалж байна…' : 'Оноох'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OwnerPicker({
  value,
  onChange,
}: {
  value: StudioOwner | null;
  onChange: (next: StudioOwner | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudioOwner[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      searchStudioOwners(query)
        .then(rows => {
          if (cancelled) return;
          setResults(rows);
          setSearchError('');
        })
        .catch(err => {
          if (!cancelled) setSearchError(errorMessage(err, 'Хайлт амжилтгүй'));
        })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  return (
    <div>
      {value ? (
        <div className="flex items-center justify-between gap-3 bg-stone-900 border border-white/10 rounded-xl px-4 py-2.5 mb-2">
          <div className="min-w-0">
            <p className="text-white text-sm truncate">{value.name || 'Нэргүй'}</p>
            <p className="text-stone-500 text-xs truncate">{value.email || value.id}</p>
          </div>
          <button type="button" onClick={() => onChange(null)} className="text-xs text-stone-400 hover:text-white shrink-0">Хасах</button>
        </div>
      ) : (
        <p className="text-stone-500 text-xs mb-2">Эзэмшигчгүй. Оноовол тухайн зурагчин «Миний студи» дээрээс засна.</p>
      )}
      <div className="relative">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder="Зурагчны нэр эсвэл имэйл"
          className={fieldClass}
        />
        {open && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-stone-900 border border-white/10 rounded-xl shadow-xl" onMouseDown={e => e.preventDefault()}>
            {searching && <p className="px-3 py-2 text-xs text-stone-500">Хайж байна…</p>}
            {searchError && <p className="px-3 py-2 text-xs text-red-400">{searchError}</p>}
            {!searching && !searchError && results.length === 0 && (
              <p className="px-3 py-2 text-xs text-stone-500">Зурагчин олдсонгүй</p>
            )}
            {results.map(person => (
              <button
                key={person.id}
                type="button"
                onClick={() => { onChange(person); setOpen(false); setQuery(''); }}
                className="w-full text-left px-3 py-2 hover:bg-white/5"
              >
                <span className="block text-sm text-white">{person.name || 'Нэргүй'}</span>
                <span className="block text-xs text-stone-500">{person.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleCard({
  title,
  hint,
  on,
  onLabel,
  offLabel,
  onClick,
}: {
  title: string;
  hint: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-white text-sm font-medium">{title}</p>
        <p className="text-stone-500 text-xs mt-1">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium border ${on ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-stone-400'}`}
      >
        {on ? onLabel : offLabel}
      </button>
    </div>
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
        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => onPick(e.target.files?.[0])} />
      </label>
      {url && (
        <button type="button" onClick={onClear} className="text-xs text-stone-500 hover:text-white mt-1">Хасах</button>
      )}
    </div>
  );
}
