import { useEffect, useState } from 'react';
import {
  Briefcase, Plus, X, CheckCircle2, Clock, AlertCircle,
  ChevronDown, ChevronUp, User, Send, MapPin, Calendar,
  Users, Banknote, Eye, EyeOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Listing {
  id: string;
  title: string;
  event_date: string;
  location: string;
  photographer_count: number;
  description: string;
  compensation: string;
  contact_info: string;
  status: 'open' | 'closed';
  created_at: string;
  applicationCount?: number;
}

interface Application {
  id: string;
  listing_id: string;
  photographer_id: string;
  photographer_name: string;
  photographer_email: string;
  photographer_zid: string | null;
  message: string;
  created_at: string;
}

interface MyAlbum {
  id: string;
  name: string;
}

type View = 'list' | 'create';

export default function OrganizerListingsTab() {
  const { profile } = useAuth();
  const [view, setView] = useState<View>('list');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedListing, setExpandedListing] = useState<string | null>(null);
  const [applications, setApplications] = useState<Record<string, Application[]>>({});
  const [loadingApps, setLoadingApps] = useState<string | null>(null);
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null);
  const [approvingApp, setApprovingApp] = useState<string | null>(null);
  const [myAlbums, setMyAlbums] = useState<MyAlbum[]>([]);

  // Create form state
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [photographerCount, setPhotographerCount] = useState(1);
  const [description, setDescription] = useState('');
  const [compensation, setCompensation] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Approve modal
  const [approveModal, setApproveModal] = useState<{ app: Application; listingId: string } | null>(null);
  const [approveAlbumId, setApproveAlbumId] = useState('');
  const [approveError, setApproveError] = useState('');

  useEffect(() => {
    if (profile) { loadListings(); loadMyAlbums(); }
  }, [profile]);

  async function loadListings() {
    setLoading(true);
    const { data } = await supabase
      .from('event_listings')
      .select('id, title, event_date, location, photographer_count, description, compensation, contact_info, status, created_at')
      .eq('organizer_id', profile!.id)
      .order('created_at', { ascending: false });

    if (data) {
      const ids = data.map((l: any) => l.id);
      let counts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: appData } = await supabase
          .from('event_applications')
          .select('listing_id')
          .in('listing_id', ids);
        (appData ?? []).forEach((a: any) => {
          counts[a.listing_id] = (counts[a.listing_id] ?? 0) + 1;
        });
      }
      setListings(data.map((l: any) => ({ ...l, applicationCount: counts[l.id] ?? 0 })));
    }
    setLoading(false);
  }

  async function loadMyAlbums() {
    const { data } = await supabase
      .from('albums')
      .select('id, name')
      .eq('owner_id', profile!.id)
      .order('created_at', { ascending: false });
    setMyAlbums(data ?? []);
  }

  async function loadApplications(listingId: string) {
    setLoadingApps(listingId);
    const { data } = await supabase
      .from('event_applications')
      .select(`
        id, listing_id, photographer_id, message, created_at,
        users!event_applications_photographer_id_fkey ( name, email, photographer_id )
      `)
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false });

    if (data) {
      setApplications(prev => ({
        ...prev,
        [listingId]: data.map((a: any) => ({
          id: a.id,
          listing_id: a.listing_id,
          photographer_id: a.photographer_id,
          photographer_name: a.users?.name ?? 'Unknown',
          photographer_email: a.users?.email ?? '',
          photographer_zid: a.users?.photographer_id ?? null,
          message: a.message ?? '',
          created_at: a.created_at,
        })),
      }));
    }
    setLoadingApps(null);
  }

  function toggleExpand(listingId: string) {
    if (expandedListing === listingId) {
      setExpandedListing(null);
    } else {
      setExpandedListing(listingId);
      if (!applications[listingId]) loadApplications(listingId);
    }
  }

  async function toggleStatus(listing: Listing) {
    setTogglingStatus(listing.id);
    const newStatus = listing.status === 'open' ? 'closed' : 'open';
    const { error } = await supabase
      .from('event_listings')
      .update({ status: newStatus })
      .eq('id', listing.id);
    if (!error) {
      setListings(prev => prev.map(l => l.id === listing.id ? { ...l, status: newStatus } : l));
    }
    setTogglingStatus(null);
  }

  async function createListing() {
    setCreateError('');
    if (!title.trim()) { setCreateError('Гарчиг оруулна уу'); return; }
    if (!eventDate) { setCreateError('Арга хэмжээний огноо сонгоно уу'); return; }
    setCreating(true);

    const { error } = await supabase.from('event_listings').insert({
      organizer_id: profile!.id,
      title: title.trim(),
      event_date: eventDate,
      location: location.trim(),
      photographer_count: photographerCount,
      description: description.trim(),
      compensation: compensation.trim(),
      contact_info: contactInfo.trim(),
      status: 'open',
    });

    if (error) {
      setCreateError(error.message);
      setCreating(false);
      return;
    }

    setTitle(''); setEventDate(''); setLocation('');
    setPhotographerCount(1); setDescription('');
    setCompensation(''); setContactInfo('');
    setView('list');
    await loadListings();
    setCreating(false);
  }

  function openApproveModal(app: Application, listingId: string) {
    setApproveModal({ app, listingId });
    setApproveAlbumId('');
    setApproveError('');
  }

  async function approveApplication() {
    if (!approveModal) return;
    setApproveError('');

    const { app } = approveModal;
    setApprovingApp(app.id);

    if (approveAlbumId) {
      const { error } = await supabase.from('album_photographers').insert({
        album_id: approveAlbumId,
        photographer_id: app.photographer_id,
        status: 'approved',
      });
      if (error && !error.message.includes('unique')) {
        setApproveError(error.message);
        setApprovingApp(null);
        return;
      }
    }

    setApproveModal(null);
    setApprovingApp(null);
  }

  const statusBadge: Record<string, string> = {
    open:   'bg-green-500/10 text-green-400 border-green-500/20',
    closed: 'bg-stone-500/10 text-stone-400 border-stone-500/20',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setView('list')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              view === 'list' ? 'bg-amber-500 text-stone-950' : 'bg-white/5 border border-white/10 text-stone-300 hover:bg-white/10'
            }`}
          >
            Зарлалууд
          </button>
          <button
            onClick={() => setView('create')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              view === 'create' ? 'bg-amber-500 text-stone-950' : 'bg-white/5 border border-white/10 text-stone-300 hover:bg-white/10'
            }`}
          >
            <Plus className="w-4 h-4" />
            Шинэ зарлал
          </button>
        </div>
      </div>

      {/* ── Create form ── */}
      {view === 'create' && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
          <p className="text-white font-semibold">Зарлал үүсгэх</p>

          {createError && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{createError}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-stone-300 text-sm font-medium mb-1.5">Гарчиг *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Жишээ: Хурим, гэрэл зураг авах зурагчин хэрэгтэй"
                className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-stone-300 text-sm font-medium mb-1.5">Арга хэмжээний огноо *</label>
              <input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-stone-300 text-sm font-medium mb-1.5">Байршил</label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Улаанбаатар, Сүхбаатар дүүрэг"
                className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-stone-300 text-sm font-medium mb-1.5">Хэрэгтэй зурагчдын тоо</label>
              <input
                type="number"
                min={1}
                max={20}
                value={photographerCount}
                onChange={e => setPhotographerCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-stone-300 text-sm font-medium mb-1.5">Урамшуулал / Цалин</label>
              <input
                type="text"
                value={compensation}
                onChange={e => setCompensation(e.target.value)}
                placeholder="Жишээ: 150,000₮"
                className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-stone-300 text-sm font-medium mb-1.5">Тайлбар</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Арга хэмжээний тухай дэлгэрэнгүй мэдээлэл, шаардлагууд..."
                rows={3}
                className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 text-sm outline-none transition-all resize-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-stone-300 text-sm font-medium mb-1.5">Холбоо барих мэдээлэл</label>
              <input
                type="text"
                value={contactInfo}
                onChange={e => setContactInfo(e.target.value)}
                placeholder="Утас, и-мэйл эсвэл бусад холбоо барих хаяг"
                className="w-full bg-stone-900 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={createListing}
              disabled={creating}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              {creating
                ? <div className="w-4 h-4 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
                : <Send className="w-4 h-4" />
              }
              Нийтлэх
            </button>
            <button
              onClick={() => setView('list')}
              disabled={creating}
              className="px-5 py-2.5 text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors"
            >
              Цуцлах
            </button>
          </div>
        </div>
      )}

      {/* ── Listings list ── */}
      {view === 'list' && (
        <>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : listings.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
              <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Briefcase className="w-7 h-7 text-amber-400" />
              </div>
              <p className="text-white font-medium mb-1">Зарлал байхгүй байна</p>
              <p className="text-stone-500 text-sm mb-5">Зурагчин хайж байгаа бол шинэ зарлал үүсгэнэ үү.</p>
              <button
                onClick={() => setView('create')}
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                Зарлал үүсгэх
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {listings.map(listing => (
                <div key={listing.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                  {/* Listing header */}
                  <div className="px-5 py-4 flex items-start gap-4">
                    <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Briefcase className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-white font-semibold">{listing.title}</p>
                          <div className="flex flex-wrap gap-3 mt-1.5">
                            <span className="flex items-center gap-1 text-stone-400 text-xs">
                              <Calendar className="w-3.5 h-3.5" />
                              {new Date(listing.event_date).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                            {listing.location && (
                              <span className="flex items-center gap-1 text-stone-400 text-xs">
                                <MapPin className="w-3.5 h-3.5" />
                                {listing.location}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-stone-400 text-xs">
                              <Users className="w-3.5 h-3.5" />
                              {listing.photographer_count} зурагчин
                            </span>
                            {listing.compensation && (
                              <span className="flex items-center gap-1 text-amber-400 text-xs font-medium">
                                <Banknote className="w-3.5 h-3.5" />
                                {listing.compensation}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusBadge[listing.status]}`}>
                            {listing.status === 'open' ? 'Нээлттэй' : 'Хаалттай'}
                          </span>
                          <button
                            onClick={() => toggleStatus(listing)}
                            disabled={togglingStatus === listing.id}
                            title={listing.status === 'open' ? 'Хаах' : 'Нээх'}
                            className="w-8 h-8 flex items-center justify-center text-stone-500 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {togglingStatus === listing.id
                              ? <div className="w-3.5 h-3.5 border border-white/20 border-t-white rounded-full animate-spin" />
                              : listing.status === 'open' ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />
                            }
                          </button>
                          <button
                            onClick={() => toggleExpand(listing.id)}
                            className="w-8 h-8 flex items-center justify-center text-stone-500 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
                          >
                            {expandedListing === listing.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      {listing.applicationCount !== undefined && listing.applicationCount > 0 && (
                        <button
                          onClick={() => toggleExpand(listing.id)}
                          className="mt-2 text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
                        >
                          {listing.applicationCount} өргөдөл харах
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Applications list */}
                  {expandedListing === listing.id && (
                    <div className="border-t border-white/10">
                      {loadingApps === listing.id ? (
                        <div className="flex justify-center py-8">
                          <div className="w-5 h-5 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
                        </div>
                      ) : !applications[listing.id] || applications[listing.id].length === 0 ? (
                        <div className="px-5 py-8 text-center">
                          <p className="text-stone-500 text-sm">Өргөдөл байхгүй байна</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-white/5">
                          {applications[listing.id].map(app => (
                            <div key={app.id} className="flex items-start gap-4 px-5 py-4">
                              <div className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                <User className="w-4 h-4 text-stone-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-medium text-sm">{app.photographer_name}</p>
                                <p className="text-stone-500 text-xs">{app.photographer_email}</p>
                                {app.photographer_zid && (
                                  <span className="inline-block mt-0.5 text-xs font-mono bg-white/10 text-stone-400 px-2 py-0.5 rounded">
                                    {app.photographer_zid}
                                  </span>
                                )}
                                {app.message && (
                                  <p className="text-stone-400 text-xs mt-2 leading-relaxed">{app.message}</p>
                                )}
                                <p className="text-stone-600 text-xs mt-1">
                                  {new Date(app.created_at).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                              <button
                                onClick={() => openApproveModal(app, listing.id)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-stone-950 bg-amber-500 hover:bg-amber-400 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Зөвшөөрөх
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Approve modal ── */}
      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={() => !approvingApp && setApproveModal(null)} />
          <div className="relative bg-stone-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-white font-bold">Зурагчин зөвшөөрөх</p>
                <p className="text-stone-400 text-sm">{approveModal.app.photographer_name}</p>
              </div>
              {!approvingApp && (
                <button onClick={() => setApproveModal(null)} className="text-stone-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {approveError && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{approveError}</p>
              </div>
            )}

            <div>
              <label className="block text-stone-300 text-sm font-medium mb-1.5">
                Цомогт нэмэх (заавал биш)
              </label>
              <select
                value={approveAlbumId}
                onChange={e => setApproveAlbumId(e.target.value)}
                className="w-full bg-stone-800 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
              >
                <option value="">Цомог сонгохгүй</option>
                {myAlbums.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <p className="text-stone-600 text-xs mt-1">Сонгосон цомогт зурагчин шууд нэмэгдэнэ.</p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={approveApplication}
                disabled={!!approvingApp}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                {approvingApp
                  ? <div className="w-4 h-4 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
                  : <><CheckCircle2 className="w-4 h-4" />Зөвшөөрөх</>
                }
              </button>
              <button
                onClick={() => setApproveModal(null)}
                disabled={!!approvingApp}
                className="px-4 text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors"
              >
                Цуцлах
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
