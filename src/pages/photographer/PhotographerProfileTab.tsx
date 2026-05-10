import { useEffect, useRef, useState } from 'react';
import { Camera, Copy, CheckCircle2, Eye, EyeOff, Save, Instagram, Facebook, Phone, Upload, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface PhotographerProfile {
  id?: string;
  display_name: string;
  bio: string;
  phone: string;
  instagram: string;
  facebook: string;
  specialties: string[];
  is_visible: boolean;
  zur_id?: string;
  avatar_url?: string;
}

const SPECIALTIES = ['Хурим', 'Баяр наадам', 'Спорт', 'Соёл', 'Хөгжим', 'Марафон', 'Хурал', 'Портрет', 'Байгаль', 'Мода'];

export default function PhotographerProfileTab() {
  const { profile } = useAuth();
  const [data, setData] = useState<PhotographerProfile>({
    display_name: '',
    bio: '',
    phone: '',
    instagram: '',
    facebook: '',
    specialties: [],
    is_visible: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) loadProfile();
  }, [profile]);

  async function loadProfile() {
    const { data: p } = await supabase
      .from('photographer_profiles')
      .select('*')
      .eq('user_id', profile!.id)
      .maybeSingle();
    if (p) setData(p);
    setLoading(false);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingAvatar(true);

    const ext = file.name.split('.').pop();
    const path = `${profile.id}/avatar.${ext}`;

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (!error) {
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatar_url = urlData.publicUrl + '?t=' + Date.now();
      setData(prev => ({ ...prev, avatar_url }));

      if (data.id) {
        await supabase.from('photographer_profiles')
          .update({ avatar_url })
          .eq('id', data.id);
      }
    }
    setUploadingAvatar(false);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);

    if (data.id) {
      await supabase
        .from('photographer_profiles')
        .update({ ...data, user_id: profile.id })
        .eq('id', data.id);
    } else {
      const { data: zurResult } = await supabase.rpc('generate_zur_id');
      const { data: created } = await supabase
        .from('photographer_profiles')
        .insert({ ...data, user_id: profile.id, zur_id: zurResult })
        .select()
        .single();
      if (created) setData(created);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function copyZurId() {
    if (data.zur_id) {
      navigator.clipboard.writeText(data.zur_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function toggleSpecialty(s: string) {
    setData(prev => ({
      ...prev,
      specialties: prev.specialties.includes(s)
        ? prev.specialties.filter(x => x !== s)
        : [...prev.specialties, s],
    }));
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ZUR-ID — хадгалсны дараа харагдана */}
      {data.zur_id && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
            <Camera className="w-4 h-4 text-amber-400" />
            Зурагчины ID (ZUR-ID)
          </h3>
          <p className="text-stone-500 text-xs mb-4">Зохион байгуулагч энэ ID-г ашиглан таныг цомогт нэмнэ.</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-stone-900 border border-white/10 rounded-xl px-4 py-3 font-mono text-amber-400 font-bold text-lg tracking-widest">
              {data.zur_id}
            </div>
            <button
              onClick={copyZurId}
              className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 px-4 py-3 rounded-xl transition-colors text-sm font-medium"
            >
              {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Хуулагдлаа' : 'Хуулах'}
            </button>
          </div>
        </div>
      )}

      {/* Профайл зураг */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-4">Профайл зураг</h3>
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-stone-800 border-2 border-white/10 flex-shrink-0 flex items-center justify-center">
            {data.avatar_url ? (
              <img src={data.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-8 h-8 text-stone-600" />
            )}
          </div>
          <div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              {uploadingAvatar
                ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                : <Upload className="w-4 h-4" />
              }
              {uploadingAvatar ? 'Байршуулж байна...' : 'Зураг оруулах'}
            </button>
            <p className="text-stone-600 text-xs mt-1.5">JPG, PNG, WebP • Дээд тал 5MB</p>
          </div>
        </div>
      </div>

      {/* Нүүр хуудсанд харагдах */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">Нүүр хуудсанд харагдах</h3>
            <p className="text-stone-500 text-xs mt-1">Зурагчингуудын жагсаалтад таны профайл харагдана</p>
          </div>
          <button
            onClick={() => setData(prev => ({ ...prev, is_visible: !prev.is_visible }))}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              data.is_visible
                ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                : 'bg-white/5 border border-white/10 text-stone-400'
            }`}
          >
            {data.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {data.is_visible ? 'Харагдаж байна' : 'Нуугдсан'}
          </button>
        </div>
      </div>

      {/* Үндсэн мэдээлэл */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-semibold">Үндсэн мэдээлэл</h3>

        <div>
          <label className="block text-stone-400 text-xs mb-1.5">Дэлгэцийн нэр</label>
          <input
            value={data.display_name}
            onChange={e => setData(prev => ({ ...prev, display_name: e.target.value }))}
            placeholder="Б. Мөнхбаяр"
            className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none text-sm transition-colors"
          />
        </div>

        <div>
          <label className="block text-stone-400 text-xs mb-1.5">Танилцуулга</label>
          <textarea
            value={data.bio}
            onChange={e => setData(prev => ({ ...prev, bio: e.target.value }))}
            placeholder="Өөрийгөө товч танилцуулна уу..."
            rows={3}
            className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 outline-none text-sm transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-stone-400 text-xs mb-1.5">Утасны дугаар</label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" />
            <input
              value={data.phone}
              onChange={e => setData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="+976 9911-2233"
              className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white placeholder-stone-600 rounded-xl pl-10 pr-4 py-2.5 outline-none text-sm transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-stone-400 text-xs mb-1.5">Instagram</label>
            <div className="relative">
              <Instagram className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" />
              <input
                value={data.instagram}
                onChange={e => setData(prev => ({ ...prev, instagram: e.target.value }))}
                placeholder="@username"
                className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white placeholder-stone-600 rounded-xl pl-10 pr-4 py-2.5 outline-none text-sm transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-stone-400 text-xs mb-1.5">Facebook</label>
            <div className="relative">
              <Facebook className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" />
              <input
                value={data.facebook}
                onChange={e => setData(prev => ({ ...prev, facebook: e.target.value }))}
                placeholder="facebook.com/..."
                className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white placeholder-stone-600 rounded-xl pl-10 pr-4 py-2.5 outline-none text-sm transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Мэргэшил */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-3">Мэргэшил / Чиглэл</h3>
        <div className="flex flex-wrap gap-2">
          {SPECIALTIES.map(s => (
            <button
              key={s}
              onClick={() => toggleSpecialty(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                data.specialties.includes(s)
                  ? 'bg-amber-500 text-stone-950'
                  : 'bg-white/5 border border-white/10 text-stone-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Хадгалах */}
      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-6 py-3 rounded-xl transition-colors"
      >
        {saving
          ? <div className="w-4 h-4 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
          : saved
          ? <CheckCircle2 className="w-4 h-4" />
          : <Save className="w-4 h-4" />
        }
        {saved ? 'Хадгалагдлаа!' : 'Хадгалах'}
      </button>

      {!data.zur_id && (
        <p className="text-stone-500 text-xs text-center">
          Хадгалах дарахад таны давтагдашгүй ZUR-ID автоматаар үүснэ
        </p>
      )}
    </div>
  );
}
