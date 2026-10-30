import { useEffect, useRef, useState, useCallback, DragEvent, ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Upload, X, CheckCircle2, AlertCircle, LogOut, User, Loader2, Tag, ChevronDown, ChevronUp, Eye, FolderOpen, FolderPlus, Gauge,
} from 'lucide-react';
import QuotaPayModal, { QuotaPackage, normalizeQuotaPackages, DEFAULT_QUOTA_PACKAGES } from '../../components/QuotaPayModal';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { applyWatermark, makeSalePreview, WatermarkPosition } from '../../lib/watermark';
import { albumFaceSearchEnabled, fileToImage, scanAndSavePhoto } from '../../lib/faceSearch';
import BrandMark from '../../components/BrandMark';

interface AlbumInfo {
  id: string;
  name: string;
  event_date: string;
  watermark_type: 'text' | 'image' | 'layers';
  watermark_value: string;
  watermark_position: WatermarkPosition;
  owner_id: string;
  is_free?: boolean;
  free_activated?: boolean;
  photo_limit?: number | null;
}

const PRINT_SIZES = ['10x15', '13x18', '20x30', 'A4', '21x30'] as const;
type PrintSize = typeof PRINT_SIZES[number];

interface PrintPrices {
  [size: string]: { enabled: boolean; price: string };
}

type UploadStatus = 'idle' | 'processing' | 'uploading' | 'done' | 'error';

interface FileEntry {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  progress: number;
  errorMsg: string;
  printPrices: PrintPrices;
}

const defaultPrintPrices = (): PrintPrices =>
  Object.fromEntries(PRINT_SIZES.map(s => [s, { enabled: false, price: '' }]));

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 20 * 1024 * 1024;
/** Эх файлыг хадгалахын өмнө шахах: урт тал 4000px, JPEG 90% — утас, A4 хэвлэлд ялгаагүй, 3–4 дахин бага зай */
const ORIGINAL_MAX_EDGE = 4000;
const ORIGINAL_QUALITY = 0.9;

interface PhotoQuota { applies: boolean; used: number; free_quota: number; extra: number; quota: number }

function fmtSize(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

export default function PhotoUploadPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const [album, setAlbum] = useState<AlbumInfo | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploadStarted, setUploadStarted] = useState(false);
  const [successCount, setSuccessCount] = useState(0);

  const [batchPrices, setBatchPrices] = useState<PrintPrices>(defaultPrintPrices());
  const [batchOpen, setBatchOpen] = useState(false);
  const [expandedPrices, setExpandedPrices] = useState<Set<string>>(new Set());

  // Цомог доторх хавтас (сэдэв) — зургуудыг ангилж байршуулна
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [folderId, setFolderId] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState('');
  const [faceEnabled, setFaceEnabled] = useState(false);
  // «Худалдах» цомогт зурагчин бүрийн зургийн хязгаар (update-49)
  const [quota, setQuota] = useState<PhotoQuota | null>(null);
  const [quotaPkgs, setQuotaPkgs] = useState<QuotaPackage[]>(DEFAULT_QUOTA_PACKAGES);
  const [payPkg, setPayPkg] = useState<QuotaPackage | null>(null);

  async function loadQuota(albumIdArg: string): Promise<PhotoQuota | null> {
    const { data, error } = await supabase.rpc('photographer_quota', { p_album_id: albumIdArg });
    const row = !error && Array.isArray(data) ? (data[0] as PhotoQuota | undefined) : undefined;
    const q = row && row.applies ? row : null;
    setQuota(q);
    return q;
  }

  useEffect(() => {
    if (!album || album.is_free) return;
    loadQuota(album.id);
    supabase.from('platform_settings').select('value').eq('key', 'photo_quota_packages').maybeSingle()
      .then(({ data }) => { if (data) setQuotaPkgs(normalizeQuotaPackages(data.value)); });
  }, [album]);

  useEffect(() => {
    if (!album) return;
    albumFaceSearchEnabled(album.id).then(setFaceEnabled);
    supabase.from('album_folders').select('id, name')
      .eq('album_id', album.id)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      .then(({ data }) => setFolders(data ?? []));
  }, [album]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!album || !name) return;
    setCreatingFolder(true); setFolderError('');
    const { data, error } = await supabase.from('album_folders')
      .insert({ album_id: album.id, name, sort_order: folders.length })
      .select('id, name').single();
    setCreatingFolder(false);
    if (error || !data) { setFolderError('Хавтас үүсгэж чадсангүй: ' + (error?.message ?? '')); return; }
    setFolders(prev => [...prev, data]);
    setFolderId(data.id);
    setNewFolderName('');
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!albumId || !profile) return;
    (async () => {
      const { data: albumData } = await supabase
        .from('albums')
        .select('id, name, event_date, watermark_type, watermark_value, watermark_position, owner_id, is_free, free_activated, photo_limit')
        .eq('id', albumId)
        .maybeSingle();

      if (!albumData) {
        setAccessDenied(true);
        setCheckingAccess(false);
        return;
      }

      if (albumData.owner_id === profile.id) {
        setAlbum(albumData);
        setCheckingAccess(false);
        return;
      }

      const { data: membership } = await supabase
        .from('album_photographers')
        .select('status')
        .eq('album_id', albumId)
        .eq('photographer_id', profile.id)
        .maybeSingle();

      if (!membership || membership.status !== 'approved') {
        setAccessDenied(true);
      } else {
        setAlbum(albumData);
      }
      setCheckingAccess(false);
    })();
  }, [albumId, profile]);

  function addFiles(incoming: File[]) {
    const valid = incoming.filter(f => ACCEPTED.includes(f.type) && f.size <= MAX_SIZE);
    const entries: FileEntry[] = valid.map(f => ({
      id: crypto.randomUUID(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      status: 'idle',
      progress: 0,
      errorMsg: '',
      printPrices: defaultPrintPrices(),
    }));
    setFiles(prev => [...prev, ...entries]);
  }

  function removeFile(id: string) {
    setFiles(prev => {
      const entry = prev.find(e => e.id === id);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter(e => e.id !== id);
    });
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files));
  }, []);

  function setFilePrice(fileId: string, size: PrintSize, field: 'enabled' | 'price', value: boolean | string) {
    setFiles(prev => prev.map(f => {
      if (f.id !== fileId) return f;
      return { ...f, printPrices: { ...f.printPrices, [size]: { ...f.printPrices[size], [field]: value } } };
    }));
  }

  function applyBatchToAll() {
    setFiles(prev => prev.map(f => ({ ...f, printPrices: { ...batchPrices } })));
  }

  function togglePricePanel(id: string) {
    setExpandedPrices(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setFileStatus(id: string, patch: Partial<FileEntry>) {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  async function uploadAll() {
    if (!album || !profile || files.length === 0) return;
    setUploadStarted(true);
    let succeeded = 0;

    // Идэвхжсэн «үнэгүй хуваалцах» цомгийн багцын хязгаар
    let remaining = Infinity;
    let quotaLimit = 0;
    if (!album.is_free) {
      const q = await loadQuota(album.id);
      if (q) { remaining = Math.max(0, q.quota - q.used); quotaLimit = q.quota; }
    }
    if (album.is_free && album.free_activated && album.photo_limit) {
      const { count } = await supabase.from('photo_uploads').select('id', { count: 'exact', head: true })
        .eq('album_id', album.id).neq('source', 'ai_booth');
      remaining = Math.max(0, album.photo_limit - (count ?? 0));
    }

    for (const entry of files) {
      if (entry.status === 'done') { succeeded++; continue; }
      if (remaining <= 0) {
        setFileStatus(entry.id, {
          status: 'error',
          errorMsg: album.is_free
            ? `Багцын хязгаар (${album.photo_limit} зураг) хүрсэн. Илүү том багц авна уу.`
            : `Таны зургийн хязгаар (${quotaLimit.toLocaleString()} зураг) дүүрсэн. Нэмэлт багц аваад дахин оролдоно уу.`,
        });
        continue;
      }
      setFileStatus(entry.id, { status: 'processing', progress: 0 });

      try {
        // «Үнэгүй хуваалцах» цомогт усан тэмдэг тавихгүй (зочид эх зургийг үнэгүй татна)
        // Үнэгүй цомог: зохион байгуулагчийн лого / мэндчилгээг (булангийн давхарга) эх зурагт ч, preview-д ч суулгана
        const brand = album.is_free && hasBrandLayers(album);
        let originalBlob: Blob = entry.file;
        let compressed = false;
        if (brand) {
          originalBlob = await applyWatermark(entry.file, { type: 'layers', value: album.watermark_value, position: album.watermark_position, brandOnly: true, keepTiled: true, quality: ORIGINAL_QUALITY, maxSize: ORIGINAL_MAX_EDGE });
          compressed = true;
        } else {
          // Эх файлыг шахна — илт багасах үед л (аль хэдийн жижиг файлыг хөндөхгүй)
          try {
            const c = await applyWatermark(entry.file, { type: 'none', value: '', position: album.watermark_position, quality: ORIGINAL_QUALITY, maxSize: ORIGINAL_MAX_EDGE });
            if (c.size < entry.file.size * 0.9) { originalBlob = c; compressed = true; }
          } catch { /* шахаж чадаагүй бол эх файлаар нь */ }
        }
        const previewBlob = album.is_free
          ? await applyWatermark(entry.file, brand
              ? { type: 'layers', value: album.watermark_value, position: album.watermark_position, brandOnly: true, keepTiled: true, maxSize: 1600 }
              : { type: 'none', value: '', position: album.watermark_position, maxSize: 1600 })
          : await makeSalePreview(entry.file, album);

        setFileStatus(entry.id, { progress: 20 });

        const ext = compressed ? 'jpg' : (entry.file.name.split('.').pop() ?? 'jpg');
        const baseName = `${crypto.randomUUID()}.${ext}`;
        const originalPath = `${profile.id}/${album.id}/${baseName}`;
        const previewPath = `${profile.id}/${album.id}/${album.is_free ? 'preview_' : 'preview_p2_'}${baseName.replace(/\.\w+$/, '.jpg')}`;

        setFileStatus(entry.id, { status: 'uploading', progress: 30 });

        const { error: origErr } = await supabase.storage
          .from('photos-original')
          .upload(originalPath, originalBlob, { contentType: compressed ? 'image/jpeg' : entry.file.type, upsert: false });
        if (origErr) throw new Error(origErr.message);

        setFileStatus(entry.id, { progress: 60 });

        const { error: prevErr } = await supabase.storage
          .from('photos-preview')
          .upload(previewPath, previewBlob, { contentType: 'image/jpeg', upsert: false });
        if (prevErr) throw new Error(prevErr.message);

        setFileStatus(entry.id, { progress: 85 });

        const { data: { publicUrl } } = supabase.storage
          .from('photos-preview')
          .getPublicUrl(previewPath);

        const originalStoragePath = `photos-original/${originalPath}`;

        const printPricesJson: Record<string, number> = {};
        for (const [size, cfg] of Object.entries(entry.printPrices)) {
          if (cfg.enabled && cfg.price) {
            const n = parseFloat(cfg.price);
            if (!isNaN(n) && n > 0) printPricesJson[size] = n;
          }
        }

        const { data: inserted, error: dbErr } = await supabase.from('photo_uploads').insert({
          album_id: album.id,
          photographer_id: profile.id,
          original_url: originalStoragePath,
          preview_url: publicUrl,
          print_prices: printPricesJson,
          filename: entry.file.name,
          ...(folderId ? { folder_id: folderId } : {}),
        }).select('id').single();
        if (dbErr) {
          // Бүртгэл амжилтгүй бол байршуулсан файлуудыг устгана (зай эзлэхгүй)
          await supabase.storage.from('photos-original').remove([originalPath]).catch(() => null);
          await supabase.storage.from('photos-preview').remove([previewPath]).catch(() => null);
          if (/QUOTA_EXCEEDED/.test(dbErr.message)) {
            remaining = 0;
            throw new Error(dbErr.message.replace(/^.*QUOTA_EXCEEDED:\s*/, ''));
          }
          throw new Error(dbErr.message);
        }

        // Царайгаар хайх асаалттай бол царайны хээг тооцоолно (алдаа гарвал байршуулалтад нөлөөлөхгүй)
        if (faceEnabled && inserted?.id) {
          try {
            setFileStatus(entry.id, { progress: 92 });
            await scanAndSavePhoto(inserted.id, await fileToImage(entry.file));
          } catch (e) {
            console.warn('Face scan failed', e);
          }
        }

        setFileStatus(entry.id, { status: 'done', progress: 100 });
        succeeded++;
        remaining--;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setFileStatus(entry.id, { status: 'error', errorMsg: msg });
      }
    }
    setSuccessCount(succeeded);
    if (!album.is_free) loadQuota(album.id);
  }

  const allDone = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error');
  const anyUploading = files.some(f => f.status === 'uploading' || f.status === 'processing');
  const pendingCount = files.filter(f => f.status === 'idle').length;

  if (checkingAccess) {
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
          <p className="text-stone-400 text-sm mb-6">
            Энэ цомогт зураг байршуулахын тулд зөвшөөрөгдсөн хүсэлт шаардлагатай.
          </p>
          <button onClick={() => navigate('/dashboard')}
            className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
            Хяналтын самбар руу буцах
          </button>
        </div>
      </div>
    );
  }

  // Усан тэмдгийн мэдээлэл харуулах
  const wmTypeLabel = () => {
    if (album?.watermark_type === 'layers') {
      try {
        const layers = JSON.parse(album.watermark_value);
        return `${layers.length} давхарга`;
      } catch { return 'Давхарга'; }
    }
    return album?.watermark_type === 'text' ? 'Текст' : 'Зураг';
  };

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 sticky top-0 z-20 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <a href="/" title="Нүүр хуудас" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <BrandMark className="w-8 h-8 flex-shrink-0" />
              <div>
                <span className="font-brand text-white font-semibold tracking-tight">Zuragchin</span>
                <span className="font-brand text-amber-400 font-semibold">.mn</span>
              </div>
            </a>
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

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-stone-500 text-sm mb-1">Байршуулж байгаа цомог</p>
          <h1 className="text-white text-3xl font-bold">{album?.name}</h1>
          <p className="text-stone-400 text-sm mt-1">
            {album && new Date(album.event_date).toLocaleDateString('mn-MN', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}
          </p>
        </div>

        {allDone && successCount > 0 && (
          <div className="mb-6 bg-green-500/10 border border-green-500/20 rounded-2xl p-5 flex items-start gap-4">
            <div className="w-10 h-10 bg-green-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1">
              <p className="text-green-400 font-semibold">{successCount} зураг амжилттай оруулагдлаа</p>
              <p className="text-stone-400 text-sm mt-0.5">
                {successCount === files.length ? 'Бүх зураг амжилттай байршлаа.' : `${files.length - successCount} зурагт алдаа гарлаа.`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setFiles([]); setUploadStarted(false); setSuccessCount(0); }}
                className="text-sm text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-colors">
                Дахин байршуулах
              </button>
              <button onClick={() => navigate(`/dashboard/albums/${albumId}/photos`)}
                className="text-sm text-stone-950 font-semibold bg-amber-500 hover:bg-amber-400 px-3 py-1.5 rounded-lg transition-colors">
                Цомог харах
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {!uploadStarted && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <p className="text-white font-semibold flex items-center gap-2 mb-1">
                  <FolderOpen className="w-4 h-4 text-amber-400" /> Хавтас (сэдэв)
                </p>
                <p className="text-stone-500 text-xs mb-3">
                  Зургуудыг сэдвээр нь ангилбал зочид өөрийн зургийг амархан олно. Жишээ нь: «Нээлт», «Шагнал гардуулах», «1-р ангийнхан».
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button type="button" onClick={() => setFolderId('')}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${folderId === '' ? 'bg-amber-500 border-amber-500 text-stone-950 font-semibold' : 'border-white/10 text-stone-300 hover:border-white/30'}`}>
                    Хавтасгүй
                  </button>
                  {folders.map(f => (
                    <button key={f.id} type="button" onClick={() => setFolderId(f.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm border ${folderId === f.id ? 'bg-amber-500 border-amber-500 text-stone-950 font-semibold' : 'border-white/10 text-stone-300 hover:border-white/30'}`}>
                      {f.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} maxLength={60}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createFolder(); } }}
                    placeholder="Шинэ хавтасны нэр"
                    className="flex-1 bg-stone-900 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-3 py-2 text-sm outline-none" />
                  <button type="button" onClick={createFolder} disabled={creatingFolder || !newFolderName.trim()}
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white px-3 rounded-xl text-sm">
                    {creatingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />} Үүсгэх
                  </button>
                </div>
                {folderError && <p className="text-red-400 text-xs mt-2">{folderError}</p>}
              </div>
            )}
            {!uploadStarted && (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
                  dragging ? 'border-amber-500 bg-amber-500/5' : 'border-white/15 hover:border-white/30 hover:bg-white/5'
                }`}
              >
                <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={onInputChange} />
                <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-7 h-7 text-amber-400" />
                </div>
                <p className="text-white font-semibold text-lg mb-1">
                  {dragging ? 'Зурагнуудаа энд тавина уу' : 'Зурагнуудаа чирж оруулах'}
                </p>
                <p className="text-stone-400 text-sm mb-3">эсвэл дарж сонгоно уу</p>
                <p className="text-stone-600 text-xs">JPG, PNG, WebP — хамгийн ихдээ 20MB</p>
              </div>
            )}

            {files.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-medium">{files.length} зураг сонгогдсон</h3>
                  {!uploadStarted && (
                    <button onClick={() => fileInputRef.current?.click()} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
                      + Нэмэх
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {files.map(entry => (
                    <FileCard
                      key={entry.id}
                      entry={entry}
                      uploadStarted={uploadStarted}
                      priceExpanded={expandedPrices.has(entry.id)}
                      onTogglePrices={() => togglePricePanel(entry.id)}
                      onRemove={() => removeFile(entry.id)}
                      onPriceChange={(size, field, value) => setFilePrice(entry.id, size as PrintSize, field, value)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-400" />Усан тэмдэг
              </h3>
              <div className="space-y-2 text-sm">
                <Row label="Төрөл" value={wmTypeLabel()} />
                <Row label="Тунгалаг байдал" value="70%" />
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <button onClick={() => setBatchOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors">
                <h3 className="text-white font-medium flex items-center gap-2">
                  <Tag className="w-4 h-4 text-amber-400" />Бөөнөөр хэвлэх үнэ
                </h3>
                {batchOpen ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
              </button>
              {batchOpen && (
                <div className="px-5 pb-5 space-y-3 border-t border-white/10 pt-4">
                  <p className="text-stone-400 text-xs mb-3">Үнэ нэг удаа тохируулаад бүх зурагт хэрэглэнэ.</p>
                  {PRINT_SIZES.map(size => (
                    <PrintSizeRow key={size} size={size}
                      enabled={batchPrices[size].enabled} price={batchPrices[size].price}
                      onToggle={v => setBatchPrices(p => ({ ...p, [size]: { ...p[size], enabled: v } }))}
                      onPrice={v => setBatchPrices(p => ({ ...p, [size]: { ...p[size], price: v } }))} />
                  ))}
                  {files.length > 0 && (
                    <button onClick={applyBatchToAll} className="w-full mt-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium py-2 rounded-xl transition-colors">
                      Бүх {files.length} зурагт хэрэглэх
                    </button>
                  )}
                </div>
              )}
            </div>

            {quota && (() => {
              const left = Math.max(0, quota.quota - quota.used);
              const pending = files.filter(f => f.status === 'idle');
              const over = Math.max(0, pending.length - left);
              const overBytes = pending.slice(left).reduce((n, f) => n + f.file.size, 0);
              const pct = Math.min(100, Math.round((quota.used / Math.max(1, quota.quota)) * 100));
              return (
                <div className={`rounded-2xl p-5 border ${over > 0 ? 'bg-amber-500/10 border-amber-500/40' : 'bg-white/5 border-white/10'}`}>
                  <h3 className="text-white font-medium flex items-center gap-2 mb-3"><Gauge className="w-4 h-4 text-amber-400" />Таны зургийн хязгаар</h3>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-stone-400">Оруулсан</span>
                    <span className="text-white font-semibold">{quota.used.toLocaleString()} / {quota.quota.toLocaleString()} зураг</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className={`h-full ${pct >= 90 ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} /></div>
                  <p className="text-stone-500 text-xs mt-2">
                    Үнэгүй {quota.free_quota.toLocaleString()} зураг{quota.extra > 0 ? ` + нэмэлт ${quota.extra.toLocaleString()}` : ''}. AI бүүтийн зураг тооцогдохгүй.
                  </p>
                  {over > 0 && (
                    <div className="mt-4 pt-4 border-t border-amber-500/30 space-y-3">
                      <p className="text-amber-100 text-sm leading-relaxed">
                        Та <b>{pending.length.toLocaleString()}</b> зураг сонгосон. Үлдсэн эрх <b>{left.toLocaleString()}</b> зураг тул
                        <b className="text-amber-300"> {over.toLocaleString()} зураг ({fmtSize(overBytes)})</b> хязгаараас хэтэрч байна.
                        Эдгээрийг цомогт оруулахын тулд нэмэлт багц авна уу:
                      </p>
                      <div className="grid gap-2">
                        {quotaPkgs.map(p => (
                          <button key={p.code} onClick={() => setPayPkg(p)}
                            className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${p.photos >= over ? 'bg-amber-500 hover:bg-amber-400 text-stone-950' : 'bg-white/10 hover:bg-white/15 text-white'}`}>
                            <span>{p.name}</span><span>₮{p.price.toLocaleString()} · QPay</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-stone-400 text-xs">Төлөхгүй бол «Зураг байршуулах» дарахад эхний {left.toLocaleString()} зураг л орно.</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {files.length > 0 && !allDone && (
              <button onClick={uploadAll} disabled={anyUploading || files.length === 0}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-stone-950 font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2.5 text-base">
                {anyUploading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Байршуулж байна…</>
                ) : (
                  <><Upload className="w-5 h-5" />{pendingCount > 0 ? `${pendingCount} ` : ''}Зураг байршуулах</>
                )}
              </button>
            )}

            {files.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                <StatusRow label="Дараалалд" value={files.filter(f => f.status === 'idle').length} color="text-stone-300" />
                <StatusRow label="Боловсруулж байна" value={files.filter(f => f.status === 'processing').length} color="text-amber-400" />
                <StatusRow label="Байршуулж байна" value={files.filter(f => f.status === 'uploading').length} color="text-blue-400" />
                <StatusRow label="Дууссан" value={files.filter(f => f.status === 'done').length} color="text-green-400" />
                <StatusRow label="Алдаа" value={files.filter(f => f.status === 'error').length} color="text-red-400" />
              </div>
            )}
          </div>
        </div>
      </main>
      {payPkg && album && (
        <QuotaPayModal albumId={album.id} pkg={payPkg}
          onClose={() => setPayPkg(null)}
          onPaid={() => { setPayPkg(null); loadQuota(album.id); }} />
      )}
    </div>
  );
}

function FileCard({ entry, uploadStarted, priceExpanded, onTogglePrices, onRemove, onPriceChange }: {
  entry: FileEntry; uploadStarted: boolean; priceExpanded: boolean;
  onTogglePrices: () => void; onRemove: () => void;
  onPriceChange: (size: string, field: 'enabled' | 'price', value: boolean | string) => void;
}) {
  const statusColor: Record<UploadStatus, string> = {
    idle: 'bg-stone-500', processing: 'bg-amber-500', uploading: 'bg-blue-500', done: 'bg-green-500', error: 'bg-red-500',
  };
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <div className="relative aspect-square">
        <img src={entry.previewUrl} alt={entry.file.name} className="w-full h-full object-cover" />
        {!uploadStarted && (
          <button onClick={onRemove} className="absolute top-1.5 right-1.5 w-6 h-6 bg-stone-950/80 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors">
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        )}
        {(entry.status === 'processing' || entry.status === 'uploading') && (
          <div className="absolute inset-0 bg-stone-950/60 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
            <div className="w-4/5 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${entry.progress}%` }} />
            </div>
            <p className="text-white text-xs">{entry.progress}%</p>
          </div>
        )}
        {entry.status === 'done' && (
          <div className="absolute inset-0 bg-stone-950/40 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
        )}
        {entry.status === 'error' && (
          <div className="absolute inset-0 bg-stone-950/60 flex flex-col items-center justify-center gap-1 p-2">
            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-xs text-center line-clamp-2">{entry.errorMsg}</p>
          </div>
        )}
        <div className={`absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full ${statusColor[entry.status]}`} />
      </div>
      <div className="p-2">
        <p className="text-stone-300 text-xs truncate">{entry.file.name}</p>
        <p className="text-stone-600 text-xs">{(entry.file.size / 1024 / 1024).toFixed(1)} MB</p>
        {!uploadStarted && (
          <button onClick={onTogglePrices} className="mt-2 w-full flex items-center justify-between text-xs text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-2.5 py-1.5 transition-colors">
            <span className="flex items-center gap-1.5"><Tag className="w-3 h-3" />Хэвлэх үнэ</span>
            {priceExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>
      {priceExpanded && !uploadStarted && (
        <div className="px-2 pb-2 space-y-1.5 border-t border-white/5 pt-2">
          {PRINT_SIZES.map(size => (
            <PrintSizeRow key={size} size={size} compact
              enabled={entry.printPrices[size].enabled} price={entry.printPrices[size].price}
              onToggle={v => onPriceChange(size, 'enabled', v)}
              onPrice={v => onPriceChange(size, 'price', v)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrintSizeRow({ size, enabled, price, onToggle, onPrice, compact = false }: {
  size: string; enabled: boolean; price: string;
  onToggle: (v: boolean) => void; onPrice: (v: string) => void; compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 cursor-pointer select-none flex-shrink-0">
        <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} className="w-3.5 h-3.5 accent-amber-500 cursor-pointer" />
        <span className={`font-medium ${compact ? 'text-xs text-stone-400' : 'text-sm text-stone-300'} w-12`}>{size}</span>
      </label>
      <div className="flex-1 relative">
        <span className={`absolute left-2 top-1/2 -translate-y-1/2 ${compact ? 'text-xs' : 'text-sm'} text-stone-500`}>₮</span>
        <input type="number" min="0" value={price} disabled={!enabled} onChange={e => onPrice(e.target.value)} placeholder="0"
          className={`w-full bg-white/5 border ${enabled ? 'border-white/15 text-white' : 'border-white/5 text-stone-600'} rounded-lg pl-6 pr-2 ${compact ? 'py-1 text-xs' : 'py-1.5 text-sm'} outline-none focus:border-amber-500/50 transition-colors disabled:cursor-not-allowed`} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-stone-500">{label}</span>
      <span className="text-stone-300 capitalize">{value}</span>
    </div>
  );
}

function StatusRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-stone-500">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}

/** Цомогт лого / текст / эзний нэмсэн битүү тамга давхарга байгаа эсэх */
function hasBrandLayers(album: { watermark_type: string; watermark_value: string }): boolean {
  if (album.watermark_type !== 'layers' || !album.watermark_value) return false;
  try {
    const layers = JSON.parse(album.watermark_value) as { type: string; text?: string; imagePreview?: string }[];
    return Array.isArray(layers) && layers.some(l => ((l.type === 'text' || l.type === 'tiled-text') && !!l.text?.trim()) || (l.type === 'image' && !!l.imagePreview));
  } catch { return false; }
}
