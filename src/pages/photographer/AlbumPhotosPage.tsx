import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Upload, Trash2, SlidersHorizontal, LogOut, User, Tag, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, ImageOff, Loader2, FolderOpen, FolderPlus, Pencil, Check, Square, CheckSquare, ScanFace, HandCoins, Download, Clapperboard, Copy,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAllPages } from '../../lib/fetchAll';
import { supabase } from '../../lib/supabase';
import { makeSalePreview, WM_STRENGTHS, normalizeStrength, WmStrength } from '../../lib/watermark';
import { backfillThumb, IMMUTABLE_CACHE, isThumbSqlMissing, makeThumb, previewPathFromUrl, uploadThumb } from '../../lib/thumbs';
import { albumFaceSearchEnabled, fileToImage, scanStoredPhoto, selfieDescriptor, FACE_MATCH_THRESHOLD } from '../../lib/faceSearch';
import BrandMark from '../../components/BrandMark';
import PrintEditor from '../../components/PrintEditor';
import { originalUrlFor, saveOwnerEdit, type OwnerEdit } from '../../lib/ownerEdit';
import { applyBaseEdit, hasEdit } from '../../lib/photoAdjust';

const PRINT_SIZES = ['10x15', '13x18', '20x30', 'A4', '21x30'] as const;

interface Photo {
  id: string;
  filename: string;
  preview_url: string;
  /** Жижиг хувилбар (update photo_thumbs). Хуучин зурагт null */
  thumb_url?: string | null;
  original_url: string;
  print_prices: Record<string, number>;
  created_at: string;
  folder_id?: string | null;
  source?: string | null;
  faces_scanned_at?: string | null;
  photographer_id?: string;
  /** Зураг тус бүрийн татах үнэ. null бол цомгийн үнэ */
  download_price?: number | null;
  /** Зурагчны өгсөн нэр — нүүр хуудасны хайлтад гарна (update-50) */
  title?: string | null;
  /** Цомгийн эзний засвар (гэрэл, өнгө, тайралт) — эх файл өөрчлөгдөхгүй */
  adjust?: OwnerEdit | null;
}

interface Folder { id: string; name: string; }
interface AlbumWm { name: string; is_free: boolean; watermark_type: string; watermark_value: string; watermark_position: string; download_price?: number; watermark_strength?: string | null }

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
  const [albumWm, setAlbumWm] = useState<AlbumWm | null>(null);
  const [protectProgress, setProtectProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  // Жижиг хувилбар (thumb) — SQL ажиллуулсан эсэх, үүсгэлтийн явц
  const [thumbSupported, setThumbSupported] = useState(false);
  const [thumbProgress, setThumbProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Зураг засах цонх (цомгийн эзэн / зурагчин)
  const [photoEdit, setPhotoEdit] = useState<Photo | null>(null);
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
  // Зураг тус бүрийн татах үнэ (update-40)
  const [bulkPrice, setBulkPrice] = useState('');
  const [dlEdit, setDlEdit] = useState<Record<string, string>>({});
  const [titleEdit, setTitleEdit] = useState<Record<string, string>>({});
  const [bulkTitle, setBulkTitle] = useState('');
  const [titleBusy, setTitleBusy] = useState(false);
  const [priceBusy, setPriceBusy] = useState(false);
  const [offerCfg, setOfferCfg] = useState<{ accept: boolean; autoPct: string; loaded: boolean; saving: boolean }>({ accept: true, autoPct: '', loaded: false, saving: false });

  // Царайгаар хайх
  const [faceEnabled, setFaceEnabled] = useState(false);
  const [faceBusy, setFaceBusy] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!albumId || !profile) return;
    checkAccessAndLoad();
  }, [albumId, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const { data: albumData } = await supabase.from('albums')
      .select('name, is_free, watermark_type, watermark_value, watermark_position, download_price').eq('id', albumId!).maybeSingle();
    setAlbumName(albumData?.name ?? '');
    if (albumData) {
      // Тамганы хүч — багана байхгүй үед ч алдаагүй (анхдагч 'medium')
      const { data: wmCfg } = await supabase.from('albums').select('watermark_strength').eq('id', albumId!).maybeSingle();
      (albumData as AlbumWm).watermark_strength = (wmCfg as { watermark_strength?: string } | null)?.watermark_strength ?? null;
    }
    setAlbumWm(albumData as AlbumWm | null);
    if (isManager) {
      const { data: cfg, error: cfgErr } = await supabase.from('albums').select('accept_offers, offer_auto_accept_ratio').eq('id', albumId!).maybeSingle();
      if (!cfgErr && cfg) {
        const r = Number((cfg as { offer_auto_accept_ratio: number | null }).offer_auto_accept_ratio ?? 0);
        setOfferCfg({ accept: (cfg as { accept_offers: boolean }).accept_offers === true, autoPct: r > 0 ? String(Math.round(r * 100)) : '', loaded: true, saving: false });
      }
      const { data: vc, error: vcErr } = await supabase.from('albums').select('ai_video_enabled').eq('id', albumId!).maybeSingle();
      if (!vcErr && vc) setVideoOn((vc as { ai_video_enabled: boolean }).ai_video_enabled !== false);
    }
    await Promise.all([loadPhotos(isManager), loadFolders(), albumFaceSearchEnabled(albumId!).then(setFaceEnabled)]);
    setLoading(false);
  }

  async function loadPhotos(isManager = canManage) {
    const COLS = 'id, filename, preview_url, original_url, print_prices, created_at, folder_id, source, faces_scanned_at, photographer_id, download_price, title';
    // 1000-аас олон зурагтай цомог: 1000-аар нь хуудаслан бүгдийг уншина (Supabase max_rows)
    const run = (cols: string) => fetchAllPages((from, to) => {
      let q = supabase.from('photo_uploads').select(cols)
        .eq('album_id', albumId!)
        .is('hidden_at', null) // нуусан (худалдагдсан тул устгаагүй) зургийг харуулахгүй
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
      if (!isManager) q = q.eq('photographer_id', profile!.id);
      return q.range(from, to);
    });
    let { data, error } = await run(COLS + ', thumb_url, adjust');
    // adjust багана нэмэгдээгүй (SQL ажиллуулаагүй) үед
    if (error && /adjust/.test(error.message)) ({ data, error } = await run(COLS + ', thumb_url'));
    setThumbSupported(!error);
    // thumb_url багана нэмэгдээгүй (SQL ажиллуулаагүй) үед
    if (error && isThumbSqlMissing(error)) ({ data, error } = await run(COLS));
    if (error) { showToast('Зургийг уншиж чадсангүй: ' + error.message, 'error'); return; }
    setPhotos((data ?? []) as unknown as Photo[]);
  }

  /** Миний оруулсан, хуучин (том, хамгаалалтгүй) preview-тэй зургууд */
  const unprotected = photos.filter(p =>
    p.photographer_id === profile?.id && p.source !== 'ai_booth' && !p.preview_url.includes('preview_p2_'));

  /** Миний оруулсан бүх (AI booth-оос бусад) зураг — тамгыг дахин тавихад */
  const mine = photos.filter(p => p.photographer_id === profile?.id && p.source !== 'ai_booth');

  async function saveStrength(v: WmStrength) {
    if (!albumWm || normalizeStrength(albumWm.watermark_strength) === v) return;
    const { error } = await supabase.from('albums').update({ watermark_strength: v }).eq('id', albumId!);
    if (error) {
      showToast(/watermark_strength/.test(error.message)
        ? 'Өгөгдлийн санд тохиргоо нэмэгдээгүй байна (SQL ажиллуулах шаардлагатай)'
        : 'Хадгалж чадсангүй: ' + error.message, 'error');
      return;
    }
    setAlbumWm({ ...albumWm, watermark_strength: v });
    showToast('Тамганы хүч хадгалагдлаа. Одоо байгаа зурагт «Тамгыг дахин тавих»-г дарна уу.');
  }

  async function protectPreviews(list: Photo[] = unprotected) {
    if (!albumWm || albumWm.is_free || !profile) return;
    const todo = list;
    if (!todo.length) return;
    if (!confirm(`${todo.length} зургийн урьдчилан харах хувилбарт тамгыг «${WM_STRENGTHS.find(x => x.value === normalizeStrength(albumWm.watermark_strength))?.label}» түвшнээр дахин тавих уу? Эх зураг өөрчлөгдөхгүй.`)) return;
    setProtectProgress({ done: 0, total: todo.length, failed: 0 });
    let failed = 0;
    for (let i = 0; i < todo.length; i++) {
      const ph = todo[i];
      try {
        const origPath = ph.original_url.replace(/^photos-original\//, '');
        const { data: blob, error: dlErr } = await supabase.storage.from('photos-original').download(origPath);
        if (dlErr || !blob) throw dlErr ?? new Error('download');
        // Цомгийн эзний засвар (байвал) урьдчилан харах зурагт хэвээр үлдэнэ
        const src = hasEdit(ph.adjust) ? await applyBaseEdit(blob, ph.adjust) : blob;
        const preview = await makeSalePreview(new File([src], ph.filename || 'photo.jpg', { type: src.type || 'image/jpeg' }), albumWm);
        const newPath = `${profile.id}/${albumId}/preview_p2_${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from('photos-preview').upload(newPath, preview, { contentType: 'image/jpeg', cacheControl: IMMUTABLE_CACHE });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('photos-preview').getPublicUrl(newPath);
        const { error: dbErr } = await supabase.rpc('set_photo_preview', { p_photo_id: ph.id, p_url: publicUrl });
        if (dbErr) {
          await supabase.storage.from('photos-preview').remove([newPath]);
          throw dbErr;
        }
        const oldPath = ph.preview_url.includes('/photos-preview/') ? ph.preview_url.split('/photos-preview/')[1]?.split('?')[0] : null;
        const oldThumb = previewPathFromUrl(ph.thumb_url);
        const stale = [oldPath, oldThumb].filter(Boolean) as string[];
        if (stale.length) await supabase.storage.from('photos-preview').remove(stale);
        // set_photo_preview нь thumb_url-ыг цэвэрлэнэ — шинэ тамгатай жижиг хувилбарыг дахин үүсгэнэ
        let newThumb: string | null = null;
        try {
          const t = await uploadThumb(await makeThumb(preview), profile.id, albumId!);
          const { error: tErr } = await supabase.rpc('set_photo_thumb', { p_photo_id: ph.id, p_url: t.url });
          if (tErr) await supabase.storage.from('photos-preview').remove([t.path]);
          else newThumb = t.url;
        } catch { /* жижиг хувилбаргүй бол preview-ээр харагдана */ }
        setPhotos(prev => prev.map(x => (x.id === ph.id ? { ...x, preview_url: publicUrl, thumb_url: newThumb } : x)));
      } catch (e) {
        console.warn('protect failed', ph.id, e);
        failed++;
      }
      setProtectProgress({ done: i + 1, total: todo.length, failed });
    }
    showToast(failed ? `${todo.length - failed} зураг шинэчлэгдлээ, ${failed} алдаатай` : 'Бүх зургийн тамга шинэчлэгдлээ');
    setTimeout(() => setProtectProgress(null), 4000);
  }

  /** Жижиг хувилбаргүй (хуучин) зургууд — цомог хурдан ачаалагдахын тулд нэг удаа үүсгэнэ */
  const noThumb = thumbSupported ? photos.filter(p => !p.thumb_url && !!p.preview_url) : [];

  async function buildThumbs() {
    if (!profile || !noThumb.length) return;
    const todo = [...noThumb];
    setThumbProgress({ done: 0, total: todo.length, failed: 0 });
    let done = 0, failed = 0, next = 0;
    // 3 зургийг зэрэг боловсруулна
    const worker = async () => {
      while (next < todo.length) {
        const ph = todo[next++];
        try {
          const url = await backfillThumb(ph, profile.id, albumId!);
          setPhotos(prev => prev.map(x => (x.id === ph.id ? { ...x, thumb_url: url } : x)));
        } catch (e) {
          console.warn('thumb backfill failed', ph.id, e);
          failed++;
        }
        done++;
        setThumbProgress({ done, total: todo.length, failed });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    showToast(failed ? `${done - failed} зурагт жижиг хувилбар үүслээ, ${failed} алдаатай` : 'Бүх зурагт жижиг хувилбар үүслээ — цомог хурдан ачаалагдана', failed ? 'error' : 'success');
    setTimeout(() => setThumbProgress(null), 4000);
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

  // Царайгаар хайх асаалттай бол шинээр нэмэгдсэн (жишээ нь AI бүүтийн) зургуудыг автоматаар уншуулна
  const autoScanned = useRef(false);
  // Царай шалгах хэрэгсэл: зураг бүрийн царайны тоо, selfie-ээс зай
  const [faceInfo, setFaceInfo] = useState<Record<string, { faces: number; distance: number | null }> | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const testFileRef = useRef<HTMLInputElement>(null);

  async function loadFaceInfo(descriptor: number[] | null) {
    const { data, error } = await supabase.rpc('face_debug', { p_album_id: albumId!, p_descriptor: descriptor });
    if (error) { showToast('Шалгах боломжгүй: ' + error.message + ' (SQL face_debug ажиллуулсан уу?)', 'error'); return; }
    const map: Record<string, { faces: number; distance: number | null }> = {};
    for (const r of (data ?? []) as { photo_id: string; faces: number; distance: number | null }[]) map[r.photo_id] = { faces: r.faces, distance: r.distance };
    setFaceInfo(map);
  }

  async function testWithSelfie(file: File) {
    setTestBusy(true);
    try {
      const d = await selfieDescriptor(await fileToImage(file));
      if (!d) { showToast('Selfie дээр царай олдсонгүй', 'error'); return; }
      await loadFaceInfo(d);
    } catch (e) {
      showToast('Алдаа: ' + (e instanceof Error ? e.message : ''), 'error');
    } finally {
      setTestBusy(false);
    }
  }

  useEffect(() => {
    if (!faceEnabled || autoScanned.current || scanProgress) return;
    if (photos.some(p => !p.faces_scanned_at)) {
      autoScanned.current = true;
      scanFaces();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceEnabled, photos]);

  /** Царай уншуулаагүй зургуудыг (preview-ээс) уншуулна */
  async function scanFaces() {
    const todo = photos.filter(p => !p.faces_scanned_at);
    if (todo.length === 0) { showToast('Бүх зураг уншуулсан байна'); return; }
    setScanProgress({ done: 0, total: todo.length });
    let failed = 0;
    for (let i = 0; i < todo.length; i++) {
      try {
        await scanStoredPhoto(todo[i]);
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

  /** Сонгосон зургуудад татах үнэ тавих. null = цомгийн үнэ рүү буцаах */
  async function applyDownloadPrice(ids: string[], price: number | null) {
    if (ids.length === 0) return;
    if (price !== null && !(price > 0)) { showToast('Үнээ зөв оруулна уу', 'error'); return; }
    setPriceBusy(true);
    const { data, error } = await supabase.rpc('set_photo_download_price', { p_photo_ids: ids, p_price: price });
    setPriceBusy(false);
    if (error) { showToast('Үнэ хадгалахад алдаа: ' + error.message, 'error'); return; }
    showToast(price === null ? `${data ?? 0} зураг цомгийн үнэ рүү буцлаа` : `${data ?? 0} зурагт ₮${price.toLocaleString()} үнэ тавигдлаа`);
    setPhotos(prev => prev.map(p => (ids.includes(p.id) && p.source !== 'ai_booth' ? { ...p, download_price: price } : p)));
    setDlEdit(prev => { const n = { ...prev }; ids.forEach(id => delete n[id]); return n; });
  }

  /** Зурагт нэр өгөх — хайлтаар олдоно. Хоосон бол нэрийг арилгана */
  async function applyTitle(ids: string[], title: string) {
    if (ids.length === 0) return;
    const t = title.trim().slice(0, 120);
    setTitleBusy(true);
    const { data, error } = await supabase.rpc('set_photo_title', { p_photo_ids: ids, p_title: t });
    setTitleBusy(false);
    if (error) {
      showToast(/set_photo_title|schema cache/i.test(error.message) ? 'Зургийн нэрийн SQL (update-50) ажиллуулаагүй байна' : 'Нэр хадгалахад алдаа: ' + error.message, 'error');
      return;
    }
    showToast(t ? `${data ?? 0} зурагт «${t}» нэр өгөгдлөө` : `${data ?? 0} зургийн нэр арилгагдлаа`);
    setPhotos(prev => prev.map(p => (ids.includes(p.id) ? { ...p, title: t } : p)));
    setTitleEdit(prev => { const n = { ...prev }; ids.forEach(id => delete n[id]); return n; });
    setBulkTitle('');
  }

  async function saveOfferSettings() {
    const pct = offerCfg.autoPct.trim() === '' ? null : Number(offerCfg.autoPct);
    if (pct !== null && !(pct >= 1 && pct <= 100)) { showToast('Автомат зөвшөөрөх хувь 1–100 байна', 'error'); return; }
    setOfferCfg(c => ({ ...c, saving: true }));
    const { error } = await supabase.rpc('set_album_offer_settings', {
      p_album_id: albumId!, p_accept: offerCfg.accept, p_auto_ratio: pct === null ? null : pct / 100,
    });
    setOfferCfg(c => ({ ...c, saving: false }));
    if (error) showToast('Хадгалахад алдаа: ' + error.message, 'error');
    else showToast('Үнийн саналын тохиргоо хадгалагдлаа');
  }

  const [videoOn, setVideoOn] = useState<boolean | null>(null);
  const [videoSaving, setVideoSaving] = useState(false);
  async function toggleVideo() {
    if (videoOn === null) return;
    setVideoSaving(true);
    const { error } = await supabase.rpc('set_album_ai_video_enabled', { p_album_id: albumId!, p_enabled: !videoOn });
    setVideoSaving(false);
    if (error) { showToast('Хадгалж чадсангүй: ' + error.message, 'error'); return; }
    setVideoOn(!videoOn);
    showToast(!videoOn ? 'AI видео нээгдлээ' : '«Видео үүсгэх» товч цомгоос нуугдлаа');
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(''), 3000);
  }

  /** Нэг зургийг устгана (баталгаажуулалтгүй). Буцаах: 'deleted' | 'hidden' | null (алдаа) */
  async function removePhoto(photo: Photo): Promise<string | null> {
    const { data: res, error } = await supabase.rpc('delete_album_photo', { p_photo_id: photo.id });
    if (error) return null;
    if (res === 'deleted') {
      const originalPath = photo.original_url.replace(/^photos-original\//, '');
      const previewPath = photo.preview_url.includes('/photos-preview/')
        ? photo.preview_url.split('/photos-preview/')[1]?.split('?')[0]
        : null;
      const thumbPath = previewPathFromUrl(photo.thumb_url);
      await Promise.all([
        supabase.storage.from('photos-original').remove([originalPath]).catch(() => null),
        previewPath ? supabase.storage.from('photos-preview').remove([previewPath]).catch(() => null) : null,
        thumbPath ? supabase.storage.from('photos-preview').remove([thumbPath]).catch(() => null) : null,
      ]);
    }
    return String(res);
  }

  const [bulkDeleting, setBulkDeleting] = useState<{ done: number; total: number } | null>(null);
  async function deleteSelected() {
    const list = photos.filter(p => selected.has(p.id));
    if (!list.length) return;
    if (!confirm(`Сонгосон ${list.length} зургийг цомгоос устгах уу? Буцаах боломжгүй.`)) return;
    setBulkDeleting({ done: 0, total: list.length });
    const gone = new Set<string>();
    let failed = 0, i = 0;
    const worker = async () => {
      while (i < list.length) {
        const ph = list[i++];
        const r = await removePhoto(ph);
        if (r) gone.add(ph.id); else failed++;
        setBulkDeleting(b => (b ? { ...b, done: b.done + 1 } : b));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setPhotos(prev => prev.filter(p => !gone.has(p.id)));
    setSelected(new Set());
    setBulkDeleting(null);
    showToast(failed ? `${gone.size} зураг устгагдлаа, ${failed} зураг устгах эрхгүй/алдаатай` : `${gone.size} зураг устгагдлаа`, failed ? 'error' : 'success');
  }

  /** Ижил нэртэй (давхар оруулсан) зургуудыг олж, хамгийн эхний нэгээс бусдыг сонгоно */
  function selectDuplicates(silent = false) {
    const groups = new Map<string, Photo[]>();
    for (const p of photos) {
      if (p.source === 'ai_booth' || !p.filename) continue;
      const k = p.filename.toLowerCase();
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    const extra: string[] = [];
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      g.sort((a, b) => a.created_at.localeCompare(b.created_at));
      g.slice(1).forEach(p => extra.push(p.id));
    }
    if (!extra.length) { if (!silent) showToast('Давхардсан (ижил нэртэй) зураг олдсонгүй'); return; }
    setFilter('all');
    setSelected(new Set(extra));
    showToast(`${extra.length} давхардсан зураг сонгогдлоо — «Устгах» дарна уу (эхнийх нь үлдэнэ)`);
  }

  async function deletePhoto(photo: Photo) {
    if (!confirm('Энэ зургийг цомгоос устгах уу?')) return;
    setDeleting(photo.id);
    const { data: res, error } = await supabase.rpc('delete_album_photo', { p_photo_id: photo.id });
    if (error) {
      showToast('Устгахад алдаа гарлаа: ' + error.message, 'error');
      setDeleting(null);
      return;
    }
    if (res === 'deleted') {
      // Файлуудыг хадгалалтаас цэвэрлэнэ (алдаа гарвал бичлэг аль хэдийн устсан тул саадгүй)
      const originalPath = photo.original_url.replace(/^photos-original\//, '');
      const previewPath = photo.preview_url.includes('/photos-preview/')
        ? photo.preview_url.split('/photos-preview/')[1]?.split('?')[0]
        : null;
      const thumbPath = previewPathFromUrl(photo.thumb_url);
      await Promise.all([
        supabase.storage.from('photos-original').remove([originalPath]).catch(() => null),
        previewPath ? supabase.storage.from('photos-preview').remove([previewPath]).catch(() => null) : null,
        thumbPath ? supabase.storage.from('photos-preview').remove([thumbPath]).catch(() => null) : null,
      ]);
    }
    setPhotos(prev => prev.filter(p => p.id !== photo.id));
    showToast(res === 'hidden' ? 'Зураг цомгоос нуугдлаа (худалдагдсан тул худалдан авагчид татах боломжтой хэвээр)' : 'Зураг устгагдлаа');
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

  // Анхаар: hook-ууд early return-ээс ӨМНӨ байх ёстой (эс бөгөөс хуудас унана).
  // Байршуулах хуудаснаас «Давхардал шалгах» дарж ирсэн бол автоматаар сонгоно
  const [searchParams, setSearchParams] = useSearchParams();
  const dupsParam = searchParams.get('dups');
  useEffect(() => {
    if (dupsParam && photos.length) {
      selectDuplicates();
      const p = new URLSearchParams(searchParams); p.delete('dups'); setSearchParams(p, { replace: true });
    }
  }, [dupsParam, photos.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

        {/* ── Үнийн санал ба зургийн үнэ (худалдах цомог) ── */}
        {albumWm && !albumWm.is_free && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6 space-y-3">
            <p className="text-white font-semibold flex items-center gap-2"><HandCoins className="w-5 h-5 text-amber-400" /> Үнэ ба үнийн санал</p>
            <p className="text-stone-400 text-xs leading-relaxed">
              Цомгийн анхдагч татах үнэ: <span className="text-white font-semibold">₮{Number(albumWm.download_price ?? 0).toLocaleString()}</span>.
              Зураг бүр дээр өөр үнэ тавьж болно (доорх ☐ тэмдгээр олон зургийг сонгоод нэг дор). Худалдан авагч төлсний дараа 14 хоногийн дотор эх файлаа татна.
            </p>
            {canManage && offerCfg.loaded && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5">
                <label className="flex items-center gap-2 text-sm text-stone-200 cursor-pointer">
                  <input type="checkbox" checked={offerCfg.accept} onChange={e => setOfferCfg(c => ({ ...c, accept: e.target.checked }))}
                    className="w-4 h-4 accent-amber-500" />
                  Зочдоос үнийн санал хүлээн авах
                </label>
                <label className="flex items-center gap-2 text-sm text-stone-400">
                  Үнийн
                  <input type="number" inputMode="numeric" min={1} max={100} value={offerCfg.autoPct} disabled={!offerCfg.accept}
                    onChange={e => setOfferCfg(c => ({ ...c, autoPct: e.target.value.replace(/[^\d]/g, '').slice(0, 3) }))}
                    placeholder="—" className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-sm outline-none disabled:opacity-40" />
                  %-иас дээш саналыг автоматаар зөвшөөрөх
                </label>
                <button onClick={saveOfferSettings} disabled={offerCfg.saving}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-1.5 rounded-lg text-sm">
                  {offerCfg.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Хадгалах
                </button>
                <button onClick={() => navigate('/dashboard/offers')} className="text-amber-400 hover:text-amber-300 text-sm ml-auto">Ирсэн саналууд →</button>
              </div>
            )}
            {canManage && videoOn !== null && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5">
                <label className="flex items-center gap-2 text-sm text-stone-200 cursor-pointer">
                  <input type="checkbox" checked={videoOn} disabled={videoSaving} onChange={toggleVideo} className="w-4 h-4 accent-fuchsia-500" />
                  <Clapperboard className="w-4 h-4 text-fuchsia-300" /> Цомогт «Видео үүсгэх» (AI видео) товч харуулах
                </label>
                {videoSaving && <Loader2 className="w-4 h-4 animate-spin text-fuchsia-300" />}
                <span className="text-stone-500 text-xs">Уран сайхны зураг зардаг цомогт хэрэггүй бол чагтыг авна.</span>
              </div>
            )}
          </div>
        )}

        {/* ── Усан тамганы хүч (худалдах цомог) ── */}
        {albumWm && !albumWm.is_free && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
            <p className="text-white font-semibold">💧 Усан тамганы хүч</p>
            <p className="text-white/50 text-sm mt-1">
              Худалдан авагчид харагдах зураг дээрх тамга. Худалдаж авсан зурагт тамга байхгүй.
              {!canManage && ' Зөвхөн цомгийн эзэн өөрчилнө.'}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {WM_STRENGTHS.map(o => {
                const active = normalizeStrength(albumWm.watermark_strength) === o.value;
                return (
                  <button key={o.value} onClick={() => canManage && saveStrength(o.value)} disabled={!canManage}
                    className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${active ? 'border-amber-400 bg-amber-500/15' : 'border-white/10 hover:border-white/25'} ${!canManage ? 'cursor-default' : ''}`}>
                    <span className={`block text-sm font-semibold ${active ? 'text-amber-300' : 'text-white'}`}>{o.label}</span>
                    <span className="block text-xs text-white/50 mt-0.5">{o.hint}</span>
                  </button>
                );
              })}
            </div>
            {mine.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <button onClick={() => protectPreviews(mine)} disabled={!!protectProgress && protectProgress.done < protectProgress.total}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-2 rounded-xl flex items-center gap-2 text-sm">
                  {protectProgress && protectProgress.done < protectProgress.total ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Миний {mine.length} зурагт тамгыг дахин тавих
                </button>
                {protectProgress && (
                  <span className="text-amber-300 text-xs">{protectProgress.done} / {protectProgress.total}{protectProgress.failed ? ` · ${protectProgress.failed} алдаа` : ''}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Хуучин зурагт жижиг хувилбар үүсгэх (цомгийн хурд) ── */}
        {(noThumb.length > 0 || thumbProgress) && (
          <div className="bg-sky-500/10 border border-sky-500/30 rounded-2xl p-5 mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-white font-semibold">⚡ Цомгийг хурдан ачаалагддаг болгох</p>
              <p className="text-sky-100/70 text-sm mt-1 max-w-2xl">
                {canManage ? 'Энэ цомгийн' : 'Таны оруулсан'} {noThumb.length} зурагт жижиг хувилбар алга — зочид цомог нээхэд том зураг татагдаж удаан ачаалагдана.
                Нэг удаа дарж үүсгэнэ. Эх зураг, тамга өөрчлөгдөхгүй. Шинээр оруулах зурагт автоматаар үүснэ.
              </p>
              {thumbProgress && (
                <p className="text-sky-300 text-xs mt-2">{thumbProgress.done} / {thumbProgress.total} боловсруулсан{thumbProgress.failed ? ` · ${thumbProgress.failed} алдаа` : ''} — хуудсаа хаалгүй хүлээнэ үү</p>
              )}
            </div>
            <button onClick={buildThumbs} disabled={!!thumbProgress && thumbProgress.done < thumbProgress.total}
              className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-stone-950 font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2">
              {thumbProgress && thumbProgress.done < thumbProgress.total ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Жижиг хувилбар үүсгэх
            </button>
          </div>
        )}

        {/* ── Хуучин preview-г хамгаалалттай болгох (худалдах цомог) ── */}
        {albumWm && !albumWm.is_free && (unprotected.length > 0 || protectProgress) && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-white font-semibold">🛡️ Зургаа хулгайлахаас хамгаалах</p>
              <p className="text-amber-100/70 text-sm mt-1 max-w-2xl">
                Таны {unprotected.length} зургийн урьдчилан харах хувилбар том, тамга нь бүдэг байна — дэлгэцийн зураг авч AI-аар тамгыг арилгах эрсдэлтэй.
                Нэг товчоор жижиг (1000px), өтгөн тамгатай болгоно. Эх зураг, худалдан авагчид очих зураг өөрчлөгдөхгүй.
              </p>
              {protectProgress && (
                <p className="text-amber-300 text-xs mt-2">{protectProgress.done} / {protectProgress.total} боловсруулсан{protectProgress.failed ? ` · ${protectProgress.failed} алдаа` : ''}</p>
              )}
            </div>
            <button onClick={() => protectPreviews()} disabled={!!protectProgress && protectProgress.done < protectProgress.total}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2">
              {protectProgress && protectProgress.done < protectProgress.total ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Хамгаалалттай болгох
            </button>
          </div>
        )}

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
                  Царайны мэдээлэл хувийн мэдээлэлд хамаарах тул зочдод урьдчилан мэдэгдээрэй.{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300">Нууцлалын бодлого</a>
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
              <input ref={testFileRef} type="file" accept="image/*" capture="user" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) testWithSelfie(f); }} />
              <button onClick={() => testFileRef.current?.click()} disabled={testBusy || !!scanProgress}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 px-4 py-2 rounded-xl text-sm">
                {testBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanFace className="w-4 h-4" />} Selfie-ээр турших
              </button>
              <button onClick={() => loadFaceInfo(null)} disabled={testBusy}
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 px-4 py-2 rounded-xl text-sm">
                Царайны тоо харах
              </button>
            </div>
            {faceInfo && (
              <p className="text-stone-500 text-xs mt-2">
                Зураг бүр дээр: <span className="text-white">👤 царайны тоо</span>, selfie-ээр туршсан бол зай
                (<span className="text-emerald-400">ногоон</span> = олдоно, <span className="text-amber-400">шар</span> = «төстэй», саарал = олдохгүй).
                Тэг царайтай зураг хайлтад хэзээ ч гарахгүй.
              </p>
            )}
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
          <button onClick={() => selectDuplicates()}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg">
            <Copy className="w-3.5 h-3.5" /> Давхардсан зураг олох (ижил нэртэй)
          </button>
          <p className="text-stone-500 text-xs mt-3">
            Зураг дээрх ☐ тэмдгээр сонгоод доорх товчоор хавтас руу зөөх эсвэл устгана. AI бүүтийн зургууд «AI бүүт» хавтсанд автоматаар харагдана.
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
            {albumWm && !albumWm.is_free && (
              <span className="flex items-center gap-1.5 border-l border-white/10 pl-3">
                <input type="number" inputMode="numeric" value={bulkPrice} placeholder="₮ татах үнэ"
                  onChange={e => setBulkPrice(e.target.value.replace(/[^\d]/g, ''))}
                  className="w-28 bg-stone-800 border border-white/10 text-white rounded-lg px-2 py-1.5 text-sm outline-none" />
                <button onClick={() => applyDownloadPrice([...selected], Number(bulkPrice))} disabled={priceBusy || !bulkPrice}
                  className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-semibold px-3 py-1.5 rounded-lg text-sm">
                  {priceBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />} Үнэ тавих
                </button>
                <button onClick={() => applyDownloadPrice([...selected], null)} disabled={priceBusy}
                  className="text-stone-400 hover:text-white text-xs">Цомгийн үнэ рүү</button>
              </span>
            )}
            <span className="flex items-center gap-1.5 border-l border-white/10 pl-3">
              <input value={bulkTitle} placeholder="Зургийн нэр (хайлтад)" maxLength={120}
                onChange={e => setBulkTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && bulkTitle.trim()) applyTitle([...selected], bulkTitle); }}
                className="w-44 bg-stone-800 border border-white/10 text-white rounded-lg px-2 py-1.5 text-sm outline-none" />
              <button onClick={() => applyTitle([...selected], bulkTitle)} disabled={titleBusy || !bulkTitle.trim()}
                className="flex items-center gap-1 bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded-lg text-sm">
                {titleBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />} Нэр өгөх
              </button>
            </span>
            <button onClick={deleteSelected} disabled={!!bulkDeleting}
              className="flex items-center gap-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-200 font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-60">
              {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {bulkDeleting ? `Устгаж байна ${bulkDeleting.done}/${bulkDeleting.total}` : `Устгах (${selected.size})`}
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
                  <div className="relative aspect-[4/5] bg-stone-950">
                    <button onClick={() => toggleSelect(photo.id)} title="Сонгох"
                      className="absolute top-2 left-2 z-10 w-8 h-8 bg-stone-950/80 rounded-lg flex items-center justify-center">
                      {isSel ? <CheckSquare className="w-5 h-5 text-amber-400" /> : <Square className="w-5 h-5 text-white" />}
                    </button>
                    {(folderName || photo.source === 'ai_booth') && (
                      <span className="absolute bottom-2 left-2 z-10 text-[11px] bg-stone-950/80 text-stone-200 px-2 py-0.5 rounded-md">
                        {photo.source === 'ai_booth' ? '✨ AI бүүт' : folderName}
                      </span>
                    )}
                    {faceInfo && (() => {
                      const fi = faceInfo[photo.id];
                      const dist = fi?.distance;
                      const color = dist == null ? 'text-stone-300' : dist < FACE_MATCH_THRESHOLD ? 'text-emerald-300' : dist < 0.64 ? 'text-amber-300' : 'text-stone-400';
                      return (
                        <span className={`absolute top-12 left-2 z-10 text-[11px] bg-stone-950/85 px-2 py-0.5 rounded-md ${color}`}>
                          👤 {fi?.faces ?? 0}{dist != null ? ` · ${dist.toFixed(2)}` : ''}
                        </span>
                      );
                    })()}
                    <img
                      src={photo.thumb_url || photo.preview_url}
                      alt={photo.filename}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-contain"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {photo.source !== 'ai_booth' && (
                      <button onClick={() => setPhotoEdit(photo)} title="Гэрэл, өнгө, тайралтыг засах"
                        className={`absolute bottom-2 right-2 z-10 h-8 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold ${hasEdit(photo.adjust) ? 'bg-amber-500 text-stone-950' : 'bg-stone-950/80 text-white hover:bg-amber-500 hover:text-stone-950'}`}>
                        <SlidersHorizontal className="w-3.5 h-3.5" /> {hasEdit(photo.adjust) ? 'Засварласан' : 'Засах'}
                      </button>
                    )}
                    {/* Delete button */}
                    <button
                      onClick={() => deletePhoto(photo)}
                      disabled={deleting === photo.id}
                      title="Устгах"
                      className="absolute top-2 right-2 w-8 h-8 bg-stone-950/80 hover:bg-red-500 rounded-lg flex items-center justify-center transition-colors sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-50"
                    >
                      {deleting === photo.id
                        ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                        : <Trash2 className="w-4 h-4 text-white" />
                      }
                    </button>
                  </div>

                  <div className="p-3 space-y-2">
                    {/* Зургийн нэр — худалдан авагч нүүр хуудаснаас хайж олно */}
                    {titleEdit[photo.id] !== undefined ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        <input autoFocus value={titleEdit[photo.id]} maxLength={120} placeholder="Жишээ: Төгсөлтийн бүжиг"
                          onChange={e => setTitleEdit(d => ({ ...d, [photo.id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') applyTitle([photo.id], titleEdit[photo.id]);
                            if (e.key === 'Escape') setTitleEdit(d => { const n = { ...d }; delete n[photo.id]; return n; });
                          }}
                          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 text-white outline-none focus:border-amber-500/50" />
                        <button onClick={() => applyTitle([photo.id], titleEdit[photo.id])} disabled={titleBusy}
                          className="text-amber-400 disabled:opacity-40"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setTitleEdit(d => { const n = { ...d }; delete n[photo.id]; return n; })} className="text-stone-500">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setTitleEdit(d => ({ ...d, [photo.id]: photo.title ?? '' }))}
                        className="w-full flex items-center gap-1 text-left text-xs group/title" title="Нэр өгвөл нүүр хуудасны хайлтаар олдоно">
                        {photo.title
                          ? <span className="text-white font-medium truncate">{photo.title}</span>
                          : <span className="text-stone-500 truncate">+ Нэр өгөх <span className="text-stone-600">({photo.filename})</span></span>}
                        <Pencil className="w-3 h-3 text-stone-500 flex-shrink-0 group-hover/title:text-white" />
                      </button>
                    )}
                    <p className="text-stone-600 text-xs">
                      {new Date(photo.created_at).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>

                    {/* Татах үнэ (зураг тус бүр) */}
                    {albumWm && !albumWm.is_free && photo.source !== 'ai_booth' && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Download className="w-3 h-3 text-stone-500 flex-shrink-0" />
                        {dlEdit[photo.id] !== undefined ? (
                          <>
                            <input type="number" inputMode="numeric" autoFocus value={dlEdit[photo.id]}
                              onChange={e => setDlEdit(d => ({ ...d, [photo.id]: e.target.value.replace(/[^\d]/g, '') }))}
                              onKeyDown={e => { if (e.key === 'Enter') applyDownloadPrice([photo.id], Number(dlEdit[photo.id])); }}
                              className="w-20 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 text-white outline-none focus:border-amber-500/50" />
                            <button onClick={() => applyDownloadPrice([photo.id], Number(dlEdit[photo.id]))} disabled={priceBusy || !dlEdit[photo.id]}
                              className="text-amber-400 disabled:opacity-40"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDlEdit(d => { const n = { ...d }; delete n[photo.id]; return n; })} className="text-stone-500">✕</button>
                          </>
                        ) : (
                          <button onClick={() => setDlEdit(d => ({ ...d, [photo.id]: String(photo.download_price ?? albumWm.download_price ?? '') }))}
                            className="flex items-center gap-1 text-stone-300 hover:text-white">
                            {photo.download_price !== null && photo.download_price !== undefined
                              ? <><span className="text-amber-300 font-semibold">₮{Number(photo.download_price).toLocaleString()}</span> <span className="text-stone-500">тусгай</span></>
                              : <><span>₮{Number(albumWm.download_price ?? 0).toLocaleString()}</span> <span className="text-stone-500">цомгийн</span></>}
                            <Pencil className="w-3 h-3 text-stone-500" />
                          </button>
                        )}
                        {photo.download_price !== null && photo.download_price !== undefined && dlEdit[photo.id] === undefined && (
                          <button onClick={() => applyDownloadPrice([photo.id], null)} title="Цомгийн үнэ рүү буцаах" className="text-stone-500 hover:text-white ml-auto">↺</button>
                        )}
                      </div>
                    )}

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
      {photoEdit && albumWm && profile && (
        <div className="fixed inset-0 z-[60]">
          <PrintEditor
            purchaseId={`photo-${photoEdit.id}`}
            title={photoEdit.title || photoEdit.filename}
            heading="Зургийг засах"
            brand={albumWm.watermark_value || ''}
            note="Худалдан авагчид засварласан зураг харагдаж, түүгээр татаж угаалгана. Эх файл өөрчлөгдөхгүй — «Анхны байдалд» дараад хадгалбал буцна."
            source={{
              load: async () => ({ url: await originalUrlFor(photoEdit), size: 'original', adjust: photoEdit.adjust ?? {} }),
              save: async a => {
                const ph = photoEdit;
                const r = await saveOwnerEdit(ph, albumWm, profile.id, albumId!, a);
                setPhotos(prev => prev.map(x => (x.id === ph.id ? { ...x, ...r } : x)));
                setPhotoEdit(p => (p && p.id === ph.id ? { ...p, ...r } : p));
                showToast('Засвар хадгалагдлаа — худалдан авагчид шинэ зураг харагдана');
              },
            }}
            onClose={() => setPhotoEdit(null)}
          />
        </div>
      )}
    </div>
  );
}
