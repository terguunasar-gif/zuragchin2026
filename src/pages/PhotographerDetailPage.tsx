import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera, Star, Phone, Instagram, Facebook, User,
  MapPin, Copy, CheckCircle2, ArrowLeft, ChevronRight, LogIn
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800&h=400&fit=crop';

export default function PhotographerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [p, setP] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  useEffect(() => {
    if (id) loadProfile();
  }, [id]);

  async function loadProfile() {
    setLoading(true);
    const { data } = await supabase
      .from('photographer_profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    setP(data);
    setLoading(false);
  }

  function copyZurId() {
    if (!p?.zur_id) return;
    navigator.clipboard.writeText(p.zur_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyPhone() {
    if (!p?.phone) return;
    navigator.clipboard.writeText(p.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );

  if (!p) return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center gap-4 text-white">
      <Camera className="w-12 h-12 text-stone-600" />
      <p className="text-lg font-semibold">Зурагчин олдсонгүй</p>
      <button onClick={() => navigate('/photographers')} className="text-amber-400 hover:text-amber-300 text-sm">
        ← Жагсаалт руу буцах
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/photographers')} className="flex items-center gap-2 text-stone-400 hover:text-white transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" /> Буцах
            </button>
            <div className="w-px h-5 bg-white/10" />
            <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center">
                <Camera className="w-4 h-4 text-stone-950" />
              </div>
              <span className="text-white font-bold text-sm">Zuragchin<span className="text-amber-400">.mn</span></span>
            </button>
          </div>
          {profile
            ? <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm transition-colors">Хяналтын самбар <ChevronRight className="w-4 h-4" /></button>
            : <button onClick={() => navigate('/auth/login')} className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm transition-colors"><LogIn className="w-4 h-4" /> Нэвтрэх</button>
          }
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Cover + avatar */}
        <div className="relative rounded-2xl overflow-hidden mb-6">
          {/* Cover image */}
          <div className="h-56 md:h-72 w-full bg-stone-900">
            <img
              src={p.cover_url || DEFAULT_COVER}
              alt="cover"
              className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).src = DEFAULT_COVER; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/30 to-transparent" />
          </div>

          {/* Profile info overlaid */}
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-5 flex items-end gap-5">
            <div className="flex-shrink-0">
              {p.avatar_url
                ? <img src={p.avatar_url} alt={p.display_name} className="w-20 h-20 rounded-full border-3 border-stone-950 object-cover ring-2 ring-amber-500/30" />
                : <div className="w-20 h-20 rounded-full border-3 border-stone-950 bg-stone-800 flex items-center justify-center ring-2 ring-amber-500/30">
                    <User className="w-9 h-9 text-stone-500" />
                  </div>
              }
            </div>
            <div className="pb-1 flex-1 min-w-0">
              <h1 className="text-white text-2xl font-bold truncate">{p.display_name || 'Нэргүй'}</h1>
              <div className="flex items-center flex-wrap gap-3 mt-1">
                {p.location && (
                  <div className="flex items-center gap-1 text-stone-300 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" /> {p.location}
                  </div>
                )}
                {p.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-white text-sm font-medium">{p.rating}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Left — main info */}
          <div className="md:col-span-2 space-y-5">

            {/* Мэргэшил */}
            {Array.isArray(p.specialties) && p.specialties.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h2 className="text-white font-semibold mb-3">Мэргэшил / Чиглэл</h2>
                <div className="flex flex-wrap gap-2">
                  {p.specialties.map((s: string) => (
                    <span key={s} className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm px-3 py-1.5 rounded-full font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Танилцуулга */}
            {p.bio && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h2 className="text-white font-semibold mb-3">Танилцуулга</h2>
                <p className="text-stone-300 text-sm leading-relaxed whitespace-pre-line">{p.bio}</p>
              </div>
            )}

            {/* ZUR-ID */}
            {p.zur_id && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Camera className="w-4 h-4 text-amber-400" />
                  <h2 className="text-white font-semibold">Зурагчины ID (ZUR-ID)</h2>
                </div>
                <p className="text-stone-500 text-xs mb-3">Зохион байгуулагч энэ ID-г ашиглан зурагчинг цомогт нэмнэ.</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-stone-900 border border-white/10 rounded-xl px-4 py-3 font-mono text-amber-400 font-bold text-lg tracking-widest">
                    {p.zur_id}
                  </div>
                  <button onClick={copyZurId} className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 px-4 py-3 rounded-xl transition-colors text-sm font-medium whitespace-nowrap">
                    {copied ? <><CheckCircle2 className="w-4 h-4" /> Хуулагдлаа</> : <><Copy className="w-4 h-4" /> Хуулах</>}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right — contact */}
          <div className="space-y-4">

            {/* Холбоо барих */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Холбоо барих</h2>
              <div className="space-y-3">
                {p.phone && (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-4 h-4 text-stone-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-stone-500 text-xs">Утас</p>
                      <p className="text-white text-sm font-medium">{p.phone}</p>
                    </div>
                    <button onClick={copyPhone} className="text-stone-500 hover:text-amber-400 transition-colors">
                      {copiedPhone ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                )}
                {p.instagram && (
                  <a href={`https://instagram.com/${p.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:bg-white/5 rounded-xl p-1 -m-1 transition-colors group">
                    <div className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center flex-shrink-0">
                      <Instagram className="w-4 h-4 text-pink-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-stone-500 text-xs">Instagram</p>
                      <p className="text-white text-sm font-medium group-hover:text-pink-400 transition-colors truncate">{p.instagram}</p>
                    </div>
                  </a>
                )}
                {p.facebook && (
                  <a href={p.facebook.startsWith('http') ? p.facebook : `https://${p.facebook}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:bg-white/5 rounded-xl p-1 -m-1 transition-colors group">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <Facebook className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-stone-500 text-xs">Facebook</p>
                      <p className="text-white text-sm font-medium group-hover:text-blue-400 transition-colors truncate">{p.facebook}</p>
                    </div>
                  </a>
                )}
                {!p.phone && !p.instagram && !p.facebook && (
                  <p className="text-stone-500 text-sm">Холбоо барих мэдээлэл байхгүй</p>
                )}
              </div>
            </div>

            {/* Байршил */}
            {p.location && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h2 className="text-white font-semibold mb-3">Байршил</h2>
                <div className="flex items-center gap-2 text-stone-300 text-sm">
                  <MapPin className="w-4 h-4 text-amber-400" /> {p.location}, Монгол
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
