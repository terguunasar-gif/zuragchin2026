import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, MapPin, Calendar, Users, Banknote,
  Send, CheckCircle2, AlertCircle, X, ChevronRight,
  Briefcase, LogIn,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { hasRole } from '../lib/supabase';

interface Listing {
  id: string;
  organizer_id: string;
  organizer_name: string;
  title: string;
  event_date: string;
  location: string;
  photographer_count: number;
  description: string;
  compensation: string;
  contact_info: string;
  status: string;
  created_at: string;
  alreadyApplied?: boolean;
}

export default function EventListingsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const [applyModal, setApplyModal] = useState<Listing | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const isPhotographer = hasRole(profile, 'photographer');

  useEffect(() => { load(); }, [profile]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('event_listings')
      .select(`
        id, organizer_id, title, event_date, location,
        photographer_count, description, compensation,
        contact_info, status, created_at,
        users!event_listings_organizer_id_fkey ( name )
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    let appliedIds = new Set<string>();
    if (profile && isPhotographer) {
      const { data: apps } = await supabase
        .from('event_applications')
        .select('listing_id')
        .eq('photographer_id', profile.id);
      appliedIds = new Set((apps ?? []).map((a: any) => a.listing_id));
    }

    setListings((data ?? []).map((l: any) => ({
      id: l.id,
      organizer_id: l.organizer_id,
      organizer_name: l.users?.name ?? 'Тодорхойгүй',
      title: l.title,
      event_date: l.event_date,
      location: l.location,
      photographer_count: l.photographer_count,
      description: l.description,
      compensation: l.compensation,
      contact_info: l.contact_info,
      status: l.status,
      created_at: l.created_at,
      alreadyApplied: appliedIds.has(l.id),
    })));
    setLoading(false);
  }

  async function submitApplication() {
    if (!profile || !applyModal) return;
    setSubmitError('');
    setSubmitting(true);

    const { error } = await supabase.from('event_applications').insert({
      listing_id: applyModal.id,
      photographer_id: profile.id,
      message: message.trim(),
    });

    if (error) {
      setSubmitError(error.message.includes('unique') ? 'Та аль хэдийн өргөдөл гаргасан байна' : error.message);
    } else {
      setSubmitSuccess(true);
      setListings(prev => prev.map(l => l.id === applyModal.id ? { ...l, alreadyApplied: true } : l));
    }
    setSubmitting(false);
  }

  function openApply(listing: Listing) {
    setApplyModal(listing);
    setMessage('');
    setSubmitError('');
    setSubmitSuccess(false);
  }

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <Camera className="w-5 h-5 text-stone-950" />
            </div>
            <div>
              <span className="text-white font-bold tracking-tight">Zuragchin</span>
              <span className="text-amber-400 font-bold">.mn</span>
            </div>
          </button>
          <div className="flex items-center gap-3">
            {profile ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                Хяналтын самбар
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => navigate('/auth/login')}
                className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Нэвтрэх
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-amber-400" />
            </div>
            <h1 className="text-white text-3xl font-bold">Зурагчин хайж байна</h1>
          </div>
          <p className="text-stone-400">Арга хэмжээний зурагчин хайж буй зохион байгуулагчид.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-7 h-7 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
            <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-7 h-7 text-stone-500" />
            </div>
            <p className="text-white font-medium mb-1">Одоогоор нээлттэй ажлын байр байхгүй</p>
            <p className="text-stone-500 text-sm">Удахгүй шинэ зарлал гарах болно.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {listings.map(listing => (
              <div key={listing.id} className="bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl p-6 transition-colors">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-white font-bold text-lg mb-1">{listing.title}</h2>
                    <p className="text-stone-400 text-sm mb-3">{listing.organizer_name}</p>
                    <div className="flex flex-wrap gap-3 mb-3">
                      <div className="flex items-center gap-1.5 text-stone-400 text-sm">
                        <Calendar className="w-4 h-4 text-stone-500 flex-shrink-0" />
                        {new Date(listing.event_date).toLocaleDateString('mn-MN', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </div>
                      {listing.location && (
                        <div className="flex items-center gap-1.5 text-stone-400 text-sm">
                          <MapPin className="w-4 h-4 text-stone-500 flex-shrink-0" />
                          {listing.location}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-stone-400 text-sm">
                        <Users className="w-4 h-4 text-stone-500 flex-shrink-0" />
                        {listing.photographer_count} зурагчин хэрэгтэй
                      </div>
                      {listing.compensation && (
                        <div className="flex items-center gap-1.5 text-amber-400 text-sm font-medium">
                          <Banknote className="w-4 h-4 flex-shrink-0" />
                          {listing.compensation}
                        </div>
                      )}
                    </div>
                    {listing.description && (
                      <p className="text-stone-400 text-sm leading-relaxed line-clamp-3">{listing.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {listing.alreadyApplied ? (
                      <span className="flex items-center gap-2 text-green-400 text-sm font-medium bg-green-500/10 border border-green-500/20 px-4 py-2 rounded-xl">
                        <CheckCircle2 className="w-4 h-4" />Өргөдөл илгээсэн
                      </span>
                    ) : isPhotographer ? (
                      <button onClick={() => openApply(listing)} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
                        <Send className="w-4 h-4" />Өргөдөл гаргах
                      </button>
                    ) : !profile ? (
                      <button onClick={() => navigate('/auth/login')} className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 text-stone-300 hover:text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
                        <LogIn className="w-4 h-4" />Нэвтрэн орж өргөдөл гаргах
                      </button>
                    ) : (
                      <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 text-stone-300 hover:text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
                        Зурагчин болох
                      </button>
                    )}
                    <p className="text-stone-600 text-xs">
                      {new Date(listing.created_at).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {applyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={() => !submitting && setApplyModal(null)} />
          <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-white font-bold">{applyModal.title}</p>
                <p className="text-stone-400 text-sm">{applyModal.organizer_name}</p>
              </div>
              {!submitting && (
                <button onClick={() => setApplyModal(null)} className="text-stone-500 hover:text-white mt-0.5">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            {submitSuccess ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-7 h-7 text-green-400" />
                </div>
                <p className="text-white font-semibold mb-1">Өргөдөл амжилттай илгээгдлээ!</p>
                <p className="text-stone-400 text-sm">Зохион байгуулагч хянаад тантай холбогдоно.</p>
                <button onClick={() => setApplyModal(null)} className="mt-4 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors">Хаах</button>
              </div>
            ) : (
              <>
                {submitError && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-red-400 text-sm">{submitError}</p>
                  </div>
                )}
                <div>
                  <label className="block text-stone-300 text-sm font-medium mb-2">Танилцуулга мессеж</label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Өөрийгөө товч танилцуулж, яагаад энэ ажилд тохиромжтой гэж үзэж байгаагаа бичнэ үү..."
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl px-4 py-3 outline-none transition-all text-sm resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={submitApplication} disabled={submitting} className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold py-2.5 rounded-xl transition-colors text-sm">
                    {submitting ? <div className="w-4 h-4 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" /> : <><Send className="w-4 h-4" />Илгээх</>}
                  </button>
                  <button onClick={() => setApplyModal(null)} disabled={submitting} className="px-4 text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-sm">
                    Цуцлах
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
