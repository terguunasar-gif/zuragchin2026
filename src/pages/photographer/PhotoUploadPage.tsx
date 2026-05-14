import { useEffect, useRef, useState, useCallback, DragEvent, ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera, ArrowLeft, Upload, X, CheckCircle2, AlertCircle,
  LogOut, User, Loader2, Tag, ChevronDown,
  ChevronUp, Eye,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { applyWatermark, WatermarkPosition } from '../../lib/watermark';

interface AlbumInfo {
  id: string;
  name: string;
  event_date: string;
  watermark_type: 'text' | 'image' | 'layers';
  watermark_value: string;
  watermark_position: WatermarkPosition;
  owner_id: string;
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!albumId || !profile) return;
    (async () => {
      const { data: albumData } = await supabase
        .from('albums')
        .select('id, name, event_date, watermark_type, watermark_value, watermark_position, owner_id')
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

    for (const entry of files) {
      if (entry.status === 'done') { succeeded++; continue; }
      setFileStatus(entry.id, { status: 'processing', progress: 0 });

      try {
        const previewBlob = await applyWatermark(entry.file, {
          type: album.watermark_type,
          value: album.watermark_value,
          position: album.watermark_position,
          opacity: 0.70,
        });

        setFileStatus(entry.id, { progress: 20 });

        const ext = entry.file.name.split('.').pop() ?? 'jpg';
        const baseName = `${crypto.randomUUID()}.${ext}`;
        const originalPath = `${profile.id}/${album.id}/${baseName}`;
        const previewPath = `${profile.id}/${album.id}/preview_${baseName.replace(/\.\w+$/, '.jpg')}`;

        setFileStatus(entry.id, { status: 'uploading', progress: 30 });

        const { error: origErr } = await supabase.storage
          .from('photos-original')
          .upload(originalPath, entry.file, { contentType: entry.file.type, upsert: false });
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

        const { error: dbErr } = await supabase.from('photo_uploads').insert({
          album_id: album.id,
          photographer_id: profile.id,
          original_url: originalStoragePath,
          preview_url: publicUrl,
          print_prices: printPricesJson,
          filename: entry.file.name,
        });
        if (dbErr) throw new Error(dbErr.message);

        setFileStatus(entry.id, { status: 'done', progress: 100 });
        succeeded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setFileStatus(entry.id, { status: 'error', errorMsg: msg });
      }
    }
    setSuccessCount(succeeded);
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
