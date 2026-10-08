import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera, ArrowLeft, Upload, Trash2, LogOut, User,
  Tag, ChevronDown, ChevronUp, CheckCircle2, AlertCircle,
  ImageOff, Loader2, FolderOpen, FolderPlus, Pencil, Check, Square, CheckSquare, ScanFace,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { albumFaceSearchEnabled, loadImage, scanAndSavePhoto } from '../../lib/faceSearch';

const PRINT_SIZES = ['10x15', '13x18', '20x30', 'A4', '21x30'] as const;

interface Photo {
  id: string;
  filename: string;
  preview_url: string;
  original_url: string;
  print_prices: Record<string, number>;
  created_at: string;
  folder_id?: string | null;
  source?: string | null;
  faces_scanned_at?: string | null;
}

interface Folder { id: string; name: string; }

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

  // Хавтас
  const [canManage, setCanManage] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [filter, setFilter] = useState<string>('all'); // all | ai | none | <folderId>
  const [newFolder, setNewFolder] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState<string>('');
  const [moving, setMoving] = useState(false);

  // Царайгаар хайх
  const [faceEnabled, setFaceEnabled] = useState(false);
  const [faceBusy, setFaceBusy] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!albumId || !profile) return;
    checkAccessAndLoad();
  }, [albumId, profile]);

  async function checkAccessAndLoad() {
    setLoading(true);

    // Цомгийн эзэн/админ бүх зургийг, зурагчин зөвхөн өөрийнхөө зургийг удирдана
    const { data: manage } = await supabase.rpc('ai_can_manage_album', { p_album_id: albumId! });
    const isManager = manage === true;
    setCanManage(isManager);

    if (!isManager) {
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
    }

    const { data: albumData } = await supabase.from('albums').select('name').eq('id', albumId!).maybeSingle();
    setAlbumName(albumData?.name ?? '');
    await Promise.all([loadPhotos(isManager), loadFolders(), albumFaceSearchEnabled(albumId!).then(setFaceEnabled)]);
    setLoading(false);
  }

  async function loadPhotos(isManager = canManage) {
    let q = supabase
      .from('photo_uploads')
      .select('id, filename, preview_url, original_url, print_prices, created_at, folder_id, source, faces_scanned_at')
      .eq('album_id', albumId!)
      .order('created_at', { ascending: false });
    if (!isManager) q = q.eq('photographer_id', profile!.id);
    const { data, error } = await q;
    if (error) {
      // Хавтасны SQL ажиллаагүй үед
      let q2 = supabase
        .from('photo_uploads')
        .select('id, filename, preview_url, original_url, print_prices, created_at')
        .eq('album_id', albumId!)
        .order('created_at', { ascending: false });
      if (!isManager) q2 = q2.eq('photographer_id', profile!.id);
      const { data: d2 } = await q2;
      setPhotos((d2 ?? []) as Photo[]);
      return;
    }
    setPhotos((data ?? []) as Photo[]);
  }

  async function loadFolders() {
    const { data } = await supabase.from('album_folders').select('id, name')
      .eq('album_id', albumId!)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    setFolders(data ?? []);
  }

  async function createFolder() {
    const name = newFolder.trim();
    if (!name) return;
    const { error } = await supabase.from('album_folders').insert({ album_id: albumId!, name, sort_order: folders.length });
    if (error) { showToast('Хавтас үүсгэж чадсангүй: ' + error.message, 'error'); return; }
    setNewFolder('');
    await loadFolders();
    showToast('Хавтас үүслээ');
  }

  async function renameFolder(f: Folder) {
    const name = window.prompt('Хавтасны шинэ нэр', f.name)?.trim();
    if (!name || name === f.name) return;
    const { error } = await supabase.from('album_folders').update({ name }).eq('id', f.id);
    if (error) { showToast('Нэр солиход алдаа: ' + error.message, 'error'); return; }
    await loadFolders();
  }

  async function deleteFolder(f: Folder) {
    if (!window.confirm(`«${f.name}» хавтсыг устгах уу? Доторх зургууд устахгүй, «Хавтасгүй» болно.`)) return;
    const { error } = await supabase.from('album_folders').delete().eq('id', f.id);
    if (error) { showToast('Устгахад алдаа: ' + error.message, 'error'); return; }
    if (filter === f.id) setFilter('all');
    await Promise.all([loadFolders(), loadPhotos()]);
  }

  async function toggleFaceSearch() {
    setFaceBusy(true);
    const { error } = await supabase.rpc('set_face_search', { p_album_id: albumId!, p_enabled: !faceEnabled });
    setFaceBusy(false);
    if (error) { showToast('Алдаа: ' + error.message, 'error'); return; }
    setFaceEnabled(!faceEnabled);
    showToast(!faceEnabled ? 'Царайгаар хайх асаалаа' : 'Царайгаар хайх унтраалаа');
  }

  /** Царай уншуулаагүй зургуудыг (preview-ээс) уншуулна */
  async function scanFaces() {
    const todo = photos.filter(p => !p.faces_scanned_at);
    if (todo.length === 0) { showToast('Бүх зураг уншуулсан байна'); return; }
    setScanProgress({ done: 0, total: todo.length });
    let failed = 0;
    for (let i = 0; i < todo.length; i++) {
      try {
        const img = await loadImage(todo[i].preview_url);
        await scanAndSavePhoto(todo[i].id, img);
      } catch (e) {
        failed++;
        console.warn('scan failed', todo[i].id, e);
      }
      setScanProgress({ done: i + 1, total: todo.length });
    }
    setScanProgress(null);
    await loadPhotos();
    showToast(failed ? `${todo.length - failed} зураг уншуулсан, ${failed} алдаатай` : `${todo.length} зураг уншуулсан`, failed ? 'error' : 'success');
  }

  async function clearFaces() {
    if (!window.confirm('Энэ цомгийн бүх царайны мэдээллийг устгах уу? Дараа нь дахин уншуулах шаардлагатай болно.')) return;
    setFaceBusy(true);
    const { error } = await supabase.rpc('clear_album_faces', { p_album_id: albumId! });
    setFaceBusy(false);
    if (error) { showToast('Алдаа: ' + error.message, 'error'); return; }
    await loadPhotos();
    showToast('Царайны мэдээлэл устлаа');
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function moveSelected() {
    if (selected.size === 0) return;
    setMoving(true);
    const { data, error } = await supabase.rpc('set_photos_folder', {
      p_photo_ids: [...selected], p_folder_id: moveTarget || null,
    });
    setMoving(false);
    if (error) { showToast('Зөөхөд алдаа: ' + error.message, 'error'); return; }
    showToast(`${data ?? 0} зураг зөөгдлөө`);
    setSelected(new Set());
    await loadPhotos();
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

  const isAiPhoto = (p: Photo) => p.source === 'ai_booth';
  const shownPhotos = photos.filter(p =>
    filter === 'all' ? true
    : filter === 'ai' ? isAiPhoto(p)
    : filter === 'none' ? !isAiPhoto(p) && !p.folder_id
    : p.folder_id === filter);
  const folderCount = (id: string) => photos.filter(p => p.folder_id === id).length;

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
            <p className="text-stone-400 text-sm mt-1">
              {canManage ? `Цомгийн нийт ${photos.length} зураг` : `Таны байршуулсан ${photos.length} зураг`}
            </p>
          </div>
          <button
            onClick={() => navigate(`/dashboard/albums/${albumId}/upload`)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            <Upload className="w-5 h-5" />
            Дахин байршуулах
          </button>
        </div>

        {/* ── Царайгаар хайх (цомгийн эзэн/админ) ── */}
        {canManage && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold flex items-center gap-2">
                  <ScanFace className="w-4 h-4 text-amber-400" /> Царайгаар хайх
                </p>
                <p className="text-stone-500 text-xs mt-1 max-w-xl">
                  Асаавал зочид selfie авч өөрийн орсон зургуудыг олно. Зурган дахь царайны тоон хээ л хадгалагдана, selfie хадгалагдахгүй.
                  Царайны мэдээлэл хувийн мэдээлэлд хамаарах тул зочдод урьдчилан мэдэгдээрэй.
                </p>
                <p className="text-stone-400 text-xs mt-2">
                  Уншуулсан: <span className="text-white font-semibold">{photos.filter(p => p.faces_scanned_at).length}</span> / {photos.length} зураг
                </p>
              </div>
              <button onClick={toggleFaceSearch} disabled={faceBusy}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold border ${
                  faceEnabled ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/15 text-stone-300'}`}>
                {faceEnabled ? 'Асаалттай' : 'Унтраалттай'}
              </button>
            </div>
            <div className="flex gap-2 mt-4 flex-wrap">
              <button onClick={scanFaces} disabled={!!scanProgress || faceBusy}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm">
                {scanProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanFace className="w-4 h-4" />}
                {scanProgress ? `Уншуулж байна… ${scanProgress.done}/${scanProgress.total}` : 'Царай уншуулах'}
              </button>
              <button onClick={clearFaces} disabled={!!scanProgress || faceBusy}
                className="flex items-center gap-2 bg-white/5 hover:bg-red-500/15 border border-white/10 text-stone-300 hover:text-red-300 px-4 py-2 rounded-xl text-sm">
                <Trash2 className="w-4 h-4" /> Царайны мэдээлэл устгах
              </button>
            </div>
            {scanProgress && <p className="text-stone-500 text-xs mt-2">Хуудсаа хаалгүй хүлээнэ үү. Анх удаа загвар ачаалахад хэдэн секунд болно.</p>}
          </div>
        )}

        {/* ── Хавтаснууд ── */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <p className="text-white font-semibold flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-amber-400" /> Хавтас (сэдэв)
            </p>
            <div className="flex gap-2">
              <input value={newFolder} onChange={e => setNewFolder(e.target.value)} maxLength={60}
                onKeyDown={e => { if (e.key === 'Enter') createFolder(); }}
                placeholder="Шинэ хавтасны нэр"
                className="bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-3 py-2 text-sm outline-none w-48" />
              <button onClick={createFolder} disabled={!newFolder.trim()}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-3 rounded-xl text-sm">
                <FolderPlus className="w-4 h-4" /> Үүсгэх
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'Бүгд', count: photos.length },
              ...folders.map(f => ({ key: f.id, label: f.name, count: folderCount(f.id) })),
              ...(photos.some(isAiPhoto) ? [{ key: 'ai', label: '✨ AI бүүт', count: photos.filter(isAiPhoto).length }] : []),
              { key: 'none', label: 'Хавтасгүй', count: photos.filter(p => !isAiPhoto(p) && !p.folder_id).length },
            ].map(tab => {
              const folder = folders.find(f => f.id === tab.key);
              return (
                <div key={tab.key} className={`flex items-center rounded-lg border text-sm ${
                  filter === tab.key ? 'bg-amber-500 border-amber-500 text-stone-950' : 'border-white/10 text-stone-300'}`}>
                  <button onClick={() => setFilter(tab.key)} className="px-3 py-1.5 flex items-center gap-1.5">
                    <span className="font-medium">{tab.label}</span>
                    <span className={filter === tab.key ? 'text-stone-800 text-xs' : 'text-stone-500 text-xs'}>{tab.count}</span>
                  </button>
                  {folder && (
                    <>
                      <button onClick={() => renameFolder(folder)} title="Нэр солих" className="px-1.5 py-1.5 opacity-70 hover:opacity-100"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteFolder(folder)} title="Устгах" className="pl-0.5 pr-2 py-1.5 opacity-70 hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-stone-500 text-xs mt-3">
            Зураг дээрх ☐ тэмдгээр сонгоод доорх товчоор хавтас руу зөөнө. AI бүүтийн зургууд «AI бүүт» хавтсанд автоматаар харагдана.
          </p>
        </div>

        {selected.size > 0 && (
          <div className="sticky top-20 z-10 mb-5 bg-stone-900 border border-amber-500/40 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap shadow-xl">
            <span className="text-white text-sm font-semibold">{selected.size} зураг сонгосон</span>
            <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)}
              className="bg-stone-800 border border-white/10 text-white rounded-lg px-3 py-1.5 text-sm outline-none">
              <option value="">Хавтасгүй болгох</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button onClick={moveSelected} disabled={moving}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-1.5 rounded-lg text-sm">
              {moving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Зөөх
            </button>
            <button onClick={() => setSelected(new Set(shownPhotos.map(p => p.id)))} className="text-stone-400 hover:text-white text-sm">Бүгдийг сонгох</button>
            <button onClick={() => setSelected(new Set())} className="text-stone-400 hover:text-white text-sm ml-auto">Цуцлах</button>
          </div>
        )}

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
            {shownPhotos.map(photo => {
              const editor = editingPrices[photo.id];
              const isSel = selected.has(photo.id);
              const folderName = folders.find(f => f.id === photo.folder_id)?.name;
              const priceCount = Object.keys(photo.print_prices).length;

              return (
                <div key={photo.id} className={`bg-white/5 border rounded-2xl overflow-hidden group ${isSel ? 'border-amber-500' : 'border-white/10'}`}>
                  {/* Thumbnail */}
                  <div className="relative aspect-square bg-stone-900">
                    <button onClick={() => toggleSelect(photo.id)} title="Сонгох"
                      className="absolute top-2 left-2 z-10 w-8 h-8 bg-stone-950/80 rounded-lg flex items-center justify-center">
                      {isSel ? <CheckSquare className="w-5 h-5 text-amber-400" /> : <Square className="w-5 h-5 text-white" />}
                    </button>
                    {(folderName || photo.source === 'ai_booth') && (
                      <span className="absolute bottom-2 left-2 z-10 text-[11px] bg-stone-950/80 text-stone-200 px-2 py-0.5 rounded-md">
                        {photo.source === 'ai_booth' ? '✨ AI бүүт' : folderName}
                      </span>
                    )}
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
