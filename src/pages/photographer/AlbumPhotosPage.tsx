import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera, ArrowLeft, Upload, Trash2, LogOut, User,
  Tag, ChevronDown, ChevronUp, CheckCircle2, AlertCircle,
  ImageOff, Loader2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const PRINT_SIZES = ['10x15', '13x18', '20x30', 'A4', '21x30'] as const;

interface Photo {
  id: string;
  filename: string;
  preview_url: string;
  original_url: string;
  print_prices: Record<string, number>;
  created_at: string;
}

interface EditingPrices {
  [photoId: string]: {
    open: boolean;
    prices: Record<string, { enabled: boolean; price: string }>;
    saving: boolean;
  };
}

export default function AlbumPhotosPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const [albumName, setAlbumName] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingPrices, setEditingPrices] = useState<EditingPrices>({});
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    if (!albumId || !profile) return;
    checkAccessAndLoad();
  }, [albumId, profile]);

  async function checkAccessAndLoad() {
    setLoading(true);

    const { data: membership } = await supabase
      .from('album_photographers')
      .select('status')
      .eq('album_id', albumId!)
      .eq('photographer_id', profile!.id)
      .maybeSingle();

    if (!membership || membership.status !== 'approved') {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    const [{ data: albumData }, { data: photoData }] = await Promise.all([
      supabase.from('albums').select('name').eq('id', albumId!).maybeSingle(),
      supabase
        .from('photo_uploads')
        .select('id, filename, preview_url, original_url, print_prices, created_at')
        .eq('album_id', albumId!)
        .eq('photographer_id', profile!.id)
        .order('created_at', { ascending: false }),
    ]);

    setAlbumName(albumData?.name ?? '');
    setPhotos(photoData ?? []);
    setLoading(false);
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(''), 3000);
  }

  async function deletePhoto(photo: Photo) {
    setDeleting(photo.id);

    // Extract storage paths from URLs
    const originalPath = photo.original_url.replace('photos-original/', '');
    const previewPath = photo.preview_url.includes('photos-preview')
      ? photo.preview_url.split('/photos-preview/')[1]?.split('?')[0]
      : null;

    const [origDel, prevDel] = await Promise.all([
      supabase.storage.from('photos-original').remove([originalPath]),
      previewPath
        ? supabase.storage.from('photos-preview').remove([previewPath])
        : Promise.resolve({ error: null }),
    ]);

    if (origDel.error || prevDel.error) {
      showToast('Хадгалалтаас устгахад алдаа гарлаа', 'error');
      setDeleting(null);
      return;
    }

    const { error: dbErr } = await supabase.from('photo_uploads').delete().eq('id', photo.id);
    if (dbErr) {
      showToast('Бичлэг устгахад алдаа гарлаа', 'error');
    } else {
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      showToast('Зураг устгагдлаа');
    }
    setDeleting(null);
  }

  function openPriceEditor(photo: Photo) {
    const prices = Object.fromEntries(
      PRINT_SIZES.map(s => [s, {
        enabled: s in photo.print_prices,
        price: photo.print_prices[s]?.toString() ?? '',
      }]),
    );
    setEditingPrices(prev => ({
      ...prev,
      [photo.id]: { open: true, prices, saving: false },
    }));
  }

  function closePriceEditor(photoId: string) {
    setEditingPrices(prev => {
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
  }

  function updateEditPrice(photoId: string, size: string, field: 'enabled' | 'price', value: boolean | string) {
    setEditingPrices(prev => ({
      ...prev,
      [photoId]: {
        ...prev[photoId],
        prices: {
          ...prev[photoId].prices,
          [size]: { ...prev[photoId].prices[size], [field]: value },
        },
      },
    }));
  }

  async function savePrices(photoId: string) {
    const editor = editingPrices[photoId];
    if (!editor) return;

    setEditingPrices(prev => ({ ...prev, [photoId]: { ...prev[photoId], saving: true } }));

    const printPricesJson: Record<string, number> = {};
    for (const [size, cfg] of Object.entries(editor.prices)) {
      if (cfg.enabled && cfg.price) {
        const n = parseFloat(cfg.price);
        if (!isNaN(n) && n > 0) printPricesJson[size] = n;
      }
    }

    const { error } = await supabase
      .from('photo_uploads')
      .update({ print_prices: printPricesJson })
      .eq('id', photoId);

    if (error) {
      showToast('Үнэ хадгалахад алдаа гарлаа', 'error');
    } else {
      setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, print_prices: printPricesJson } : p));
      showToast('Үнэ шинэчлэгдлээ');
      closePriceEditor(photoId);
    }
    setEditingPrices(prev => ({ ...prev, [photoId]: { ...prev[photoId], saving: false } }));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-white font-semibold text-lg mb-2">Хандах эрхгүй</p>
          <p className="text-stone-400 text-sm mb-6">Энэ цомогт зураг удирдахын тулд зөвшөөрөгдсөн хүсэлт шаардлагатай.</p>
          <button onClick={() => navigate('/dashboard')} className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
            Хяналтын самбар руу буцах
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <Camera className="w-5 h-5 text-stone-950" />
              </div>
              <div>
                <span className="text-white font-bold tracking-tight">Zuragchin</span>
                <span className="text-amber-400 font-bold">.mn</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-stone-300">
              <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium leading-none">{profile?.name || profile?.email}</p>
                <p className="text-xs text-stone-500 mt-0.5 capitalize">{profile?.role?.join(', ')}</p>
              </div>
            </div>
            <button onClick={signOut} className="flex items-center gap-2 text-stone-400 hover:text-white transition-colors text-sm">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Гарах</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toastMsg && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium transition-all ${
          toastType === 'success'
            ? 'bg-green-500/90 text-white'
            : 'bg-red-500/90 text-white'
        }`}>
          {toastType === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toastMsg}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <p className="text-stone-500 text-sm mb-1">Зураг удирдлага</p>
            <h1 className="text-white text-3xl font-bold">{albumName}</h1>
            <p className="text-stone-400 text-sm mt-1">Таны байршуулсан {photos.length} зураг</p>
          </div>
          <button
            onClick={() => navigate(`/dashboard/albums/${albumId}/upload`)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            <Upload className="w-5 h-5" />
            Дахин байршуулах
          </button>
        </div>

        {photos.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <ImageOff className="w-8 h-8 text-stone-500" />
            </div>
            <p className="text-white font-medium text-lg mb-2">Одоогоор зураг байхгүй</p>
            <p className="text-stone-500 text-sm mb-6">Энэ цомогт анхны зурагнуудаа байршуулаарай.</p>
            <button
              onClick={() => navigate(`/dashboard/albums/${albumId}/upload`)}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
            >
              <Upload className="w-4 h-4" />
              Зураг байршуулах
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {photos.map(photo => {
              const editor = editingPrices[photo.id];
              const priceCount = Object.keys(photo.print_prices).length;

              return (
                <div key={photo.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden group">
                  {/* Thumbnail */}
                  <div className="relative aspect-square bg-stone-900">
                    <img
                      src={photo.preview_url}
                      alt={photo.filename}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {/* Delete button */}
                    <button
                      onClick={() => deletePhoto(photo)}
                      disabled={deleting === photo.id}
                      className="absolute top-2 right-2 w-8 h-8 bg-stone-950/80 hover:bg-red-500 rounded-lg flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    >
                      {deleting === photo.id
                        ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                        : <Trash2 className="w-4 h-4 text-white" />
                      }
                    </button>
                  </div>

                  <div className="p-3 space-y-2">
                    <p className="text-stone-300 text-xs truncate">{photo.filename}</p>
                    <p className="text-stone-600 text-xs">
                      {new Date(photo.created_at).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>

                    {/* Print price summary */}
                    <div className="text-xs text-stone-500 flex items-center gap-1.5">
                      <Tag className="w-3 h-3" />
                      {priceCount > 0 ? `${priceCount} хэвлэх хэмжээ` : 'Хэвлэх үнэ тогтоогоогүй'}
                    </div>

                    {/* Edit prices button */}
                    <button
                      onClick={() => editor ? closePriceEditor(photo.id) : openPriceEditor(photo)}
                      className="w-full flex items-center justify-between text-xs text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3" />
                        Үнэ засах
                      </span>
                      {editor?.open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {/* Inline price editor */}
                    {editor?.open && (
                      <div className="space-y-1.5 pt-2 border-t border-white/5">
                        {PRINT_SIZES.map(size => (
                          <div key={size} className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                              <input
                                type="checkbox"
                                checked={editor.prices[size].enabled}
                                onChange={e => updateEditPrice(photo.id, size, 'enabled', e.target.checked)}
                                className="w-3.5 h-3.5 accent-amber-500"
                              />
                              <span className="text-xs text-stone-400 w-10">{size}</span>
                            </label>
                            <div className="flex-1 relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-stone-500">₮</span>
                              <input
                                type="number"
                                min="0"
                                value={editor.prices[size].price}
                                disabled={!editor.prices[size].enabled}
                                onChange={e => updateEditPrice(photo.id, size, 'price', e.target.value)}
                                placeholder="0"
                                className="w-full bg-white/5 border border-white/10 disabled:border-white/5 rounded-lg pl-5 pr-2 py-1 text-xs text-white disabled:text-stone-600 outline-none focus:border-amber-500/50 transition-colors"
                              />
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => savePrices(photo.id)}
                          disabled={editor.saving}
                          className="w-full mt-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold text-xs py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          {editor.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Үнэ хадгалах
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
