import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Download, Printer, ShoppingCart, X, Calendar, User, Image as ImageIcon, AlertCircle, ChevronDown, ChevronUp, ChevronLeft, Receipt, FolderOpen, ScanFace, Loader2, HandCoins,
} from 'lucide-react';
// Нийтийн хуудас — нэвтрэлтээс хамааралгүй клиент (session гацалтад өртөхгүй)
import { publicDb as supabase, withTimeout } from '../lib/supabase';
import CheckoutModal from './checkout/CheckoutModal';
const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
import { loadCart, saveCart, getPendingInvoice, setPendingInvoice, listPurchaseHistory } from '../lib/purchaseHistory';
import { useI18n } from '../lib/i18n';
import { LanguagePickerModal, LanguageSwitcher } from '../components/LanguagePicker';
import FaceSearchModal from '../components/FaceSearchModal';
import InAppBrowserBanner from '../components/InAppBrowserBanner';
import AutoOpenInBrowser from '../components/AutoOpenInBrowser';
import SaveImageViewer from '../components/SaveImageViewer';
import PrintRequestModal, { PrintPick } from '../components/PrintRequestModal';
import { saveImageToDevice } from '../lib/browserEnv';
import { useAuth } from '../contexts/AuthContext';
import AlbumExpiredView from '../components/AlbumExpiredView';
import AlbumPinGate from '../components/AlbumPinGate';
import { albumLockState } from '../lib/albumLock';
import { albumFaceSearchEnabled } from '../lib/faceSearch';
import PriceOfferModal from '../components/PriceOfferModal';
import { rememberAlbum } from '../lib/visitedAlbums';
import BrandMark from '../components/BrandMark';

export interface AlbumData {
  id: string;
  name: string;
  event_date: string;
  description: string;
  is_free: boolean;
  download_price: number;
  owner_id: string;
  organizer_name: string;
  watermark_layers?: WatermarkLayer[];
  watermark_type?: string;
  watermark_value?: string;
  watermark_position?: string;
  watermark_opacity?: number;
  watermark_logo_url?: string;
  expires_at?: string | null;
  free_activated?: boolean;
  /** Зурагчин үнийн санал хүлээн авах эсэх (update-40) */
  accept_offers?: boolean;
}

export interface PhotoData {
  id: string;
  watermarked_url: string;
  title: string;
  photographer_id: string;
  print_prices: Record<string, number>;
  folder_id?: string | null;
  source?: string | null;
  /** Зураг тус бүрийн татах үнэ. null бол цомгийн үнэ */
  download_price?: number | null;
  /** Зурагчны өгсөн нэр (update-50) */
  name?: string | null;
}

/** Зургийн татах үнэ: AI бүүт → админы үнэ, зурагчны тавьсан үнэ → цомгийн анхдагч үнэ */
export function photoDownloadPrice(photo: PhotoData, album: AlbumData, aiPrice: number): number {
  if (photo.source === 'ai_booth') return aiPrice;
  if (album.is_free) return 0;
  if (photo.download_price !== null && photo.download_price !== undefined) return Number(photo.download_price);
  return Number(album.download_price ?? 0);
}

interface AlbumFolder { id: string; name: string; }

/** platform_settings-д утга байхгүй үеийн AI зургийн үнэ (qpay функцтэй ижил) */
const AI_ALBUM_PRICE_DEFAULT = 3000;

/** Хавтасны шүүлтүүр: 'all' | 'ai' | 'other' | хавтасны id */
type FolderFilter = string;

export interface CartItem {
  id: string;
  photoId: string;
  photographerId: string;
  previewUrl: string;
  filename: string;
  type: 'download' | 'print';
  printSize?: string;
  price: number;
}

interface WatermarkLayer {
  id: string;
  type: 'text' | 'logo' | 'tiled-text';
  text: string;
  fontSize: number;
  color: string;
  logoUrl: string;
  logoSize?: number;
  position: string;
  opacity: number;
}

const PRINT_SIZE_LABELS: Record<string, string> = {
  '10x15': '10×15 см', '13x18': '13×18 см', '15x21': '15×21 см (A5)',
  '20x30': '20×30 см', '30x40': '30×40 см', '40x60': '40×60 см',
  'A4': 'A4 (21×29.7)', '21x30': '21×30 см', 'digital': 'Дижитал файл',
};

const POS_STYLE: Record<string, React.CSSProperties> = {
  'top-left':      { top: '6%', left: '4%' },
  'top-center':    { top: '6%', left: '50%', transform: 'translateX(-50%)' },
  'top-right':     { top: '6%', right: '4%' },
  'middle-left':   { top: '50%', left: '4%', transform: 'translateY(-50%)' },
  'middle-center': { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' },
  'middle-right':  { top: '50%', right: '4%', transform: 'translateY(-50%)' },
  'bottom-left':   { bottom: '6%', left: '4%' },
  'bottom-center': { bottom: '6%', left: '50%', transform: 'translateX(-50%)' },
  'bottom-right':  { bottom: '6%', right: '4%' },
  'center':        { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' },
};

function getPosStyle(pos: string): React.CSSProperties {
  return POS_STYLE[pos] ?? POS_STYLE['bottom-right'];
}

export default function PublicAlbumPage() {
  const { shareLink } = useParams<{ shareLink: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, locale } = useI18n();
  // Гадаад хэлээр үзэж буй зочид зөвхөн татаж авна (угаалгах захиалга монгол хэрэглэгчдэд)
  const allowPrint = lang === 'mn';

  const [album, setAlbum] = useState<AlbumData | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [printSelectorPhoto, setPrintSelectorPhoto] = useState<string | null>(null);
  const [folders, setFolders] = useState<AlbumFolder[]>([]);
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all');
  // Зурагчнаар шүүх (?ph=<photographer_id>)
  const [searchParams] = useSearchParams();
  const [phFilter, setPhFilter] = useState<string>(searchParams.get('ph') || '');
  const [focusPhoto, setFocusPhoto] = useState<string | null>(null);
  const [albumPhotographers, setAlbumPhotographers] = useState<{ photographer_id: string; name: string; photo_count: number }[]>([]);
  // Царайгаар хайх
  const [faceEnabled, setFaceEnabled] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);
  const [faceIds, setFaceIds] = useState<string[] | null>(null);
  const [aiPrice, setAiPrice] = useState<number>(AI_ALBUM_PRICE_DEFAULT);
  const { profile } = useAuth();
  // Үнэгүй хуваалцах цомог: эх зургийг шууд татах
  const [freeBusy, setFreeBusy] = useState<string | null>(null);
  // Үнэгүй цомгийн угаалгах хүсэлт (төлбөргүй)
  const [printPicks, setPrintPicks] = useState<PrintPick[]>([]);
  const [printReqOpen, setPrintReqOpen] = useState(false);
  const togglePrintPick = (photoId: string, previewUrl: string) => setPrintPicks(prev =>
    prev.some(p => p.photoId === photoId) ? prev.filter(p => p.photoId !== photoId) : [...prev, { photoId, previewUrl, size: '10x15', qty: 1 }]);
  const [freeViewer, setFreeViewer] = useState<{ url: string; name: string; hint: 'manual' | 'downloaded' | 'shared' } | null>(null);
  async function freeDownload(photoId: string) {
    setFreeBusy(photoId);
    try {
      const res = await fetch(`${QPAY_FN_URL}/free-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ photoId }),
      });
      const data = await res.json();
      if (!res.ok || !data.signedUrl) throw new Error(data.error || 'error');
      try {
        const { result, blobUrl } = await saveImageToDevice(data.signedUrl, data.filename);
        if (result !== 'shared') setFreeViewer({ url: result === 'manual' ? data.signedUrl : (blobUrl || data.signedUrl), name: data.filename, hint: result });
      } catch {
        setFreeViewer({ url: data.signedUrl, name: data.filename, hint: 'manual' });
      }
    } catch (e) {
      window.alert(t('Татаж чадсангүй:') + ' ' + (e instanceof Error ? e.message : ''));
    } finally {
      setFreeBusy(null);
    }
  }
  const [expired, setExpired] = useState<{ id: string; name: string; expiresAt: string; purged: boolean } | null>(null);
  const [pinGate, setPinGate] = useState<{ id: string; name: string } | null>(null);

  const [cartReady, setCartReady] = useState(false);
  // Үнийн санал илгээх зураг
  const [offerPhoto, setOfferPhoto] = useState<PhotoData | null>(null);
  const [paidCount] = useState(() => { try { return listPurchaseHistory().length; } catch { return 0; } });

  useEffect(() => { if (shareLink) loadAlbum(shareLink); }, [shareLink]);

  // Сагсыг браузерт хадгална — өөр хуудас руу ороод буцаж ирэхэд хэвээр байна.
  useEffect(() => {
    if (album && cartReady) saveCart(album.id, cart);
  }, [album, cart, cartReady]);

  async function restoreCart(albumId: string, current: PhotoData[], albumForPrice: AlbumData, aiPrice: number) {
    // Хадгалсан сагсны үнийг одоогийн үнээр шинэчилнэ (үнэ өөрчлөгдсөн байж болно)
    const byId = new Map(current.map(p => [p.id, p]));
    const saved = loadCart<CartItem>(albumId).flatMap(c => {
      const photo = byId.get(c.photoId);
      if (!photo) return [];
      if (c.type === 'download') {
        // Үнэгүй (0₮) зураг сагсанд байх ёсгүй — шууд татна
        const price = photoDownloadPrice(photo, albumForPrice, aiPrice);
        return price > 0 ? [{ ...c, price }] : [];
      }
      const price = Number(photo.print_prices?.[c.printSize ?? ''] ?? 0);
      return price > 0 ? [{ ...c, price }] : [];
    });
    // Өмнө нь QPay нэхэмжлэх үүсгээд хуудаснаас гарсан бол төлөгдсөн эсэхийг шалгана.
    const pending = getPendingInvoice(albumId);
    if (pending) {
      try {
        const res = await fetch(`${QPAY_FN_URL}/check-payment/${pending}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        });
        const data = await res.json();
        if (data.isPaid) {
          setPendingInvoice(albumId, null);
          saveCart(albumId, []);
          setCart([]);
          setCartReady(true);
          navigate(`/receipt/${pending}`);
          return;
        }
      } catch { /* сүлжээний алдаа — сагсыг хэвээр үлдээнэ */ }
    }
    setCart(saved);
    setCartReady(true);
  }

  async function loadAlbum(link: string) {
    setLoading(true);
    const BASE_COLS = 'id, name, title, event_date, description, is_free, download_price, owner_id, status, watermark_layers, watermark_type, watermark_value, watermark_position, watermark_opacity, watermark_logo_url, size_prices';
    const byLink = `share_link.eq./album/${link},share_link.eq.${link},id.eq.${link}`;
    // Хугацааны багана байхгүй (SQL ажиллуулаагүй) үед хуучин хэлбэрээр уншина
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let albumData: any = null;
    const FULL_COLS = BASE_COLS + ', expires_at, files_purged_at, free_activated';
    let withExpiry;
    try {
      withExpiry = await withTimeout(supabase.from('albums').select(FULL_COLS).or(byLink).maybeSingle(), 15000);
    } catch {
      // Сүлжээ удаан — нэг удаа дахин оролдоно, бүтэхгүй бол «олдсонгүй» харуулна
      try {
        withExpiry = await withTimeout(supabase.from('albums').select(FULL_COLS).or(byLink).maybeSingle(), 15000);
      } catch {
        setNotFound(true); setLoading(false); return;
      }
    }
    // Багцын багана байхгүй (SQL ажиллуулаагүй) бол хугацааны баганатайгаар
    if (withExpiry.error) {
      withExpiry = await supabase.from('albums').select(BASE_COLS + ', expires_at, files_purged_at').or(byLink).maybeSingle();
    }
    if (withExpiry.error) {
      ({ data: albumData } = await supabase.from('albums').select(BASE_COLS).or(byLink).eq('status', 'active').maybeSingle());
    } else {
      albumData = withExpiry.data;
    }

    if (!albumData || (albumData.status !== 'active' && !albumData.files_purged_at)) { setNotFound(true); setLoading(false); return; }

    // Хугацаа дууссан бол зураг ачаалахгүй — сунгах хуудсыг харуулна
    if (albumData.files_purged_at || (albumData.expires_at && new Date(albumData.expires_at).getTime() < Date.now())) {
      setExpired({
        id: albumData.id,
        name: albumData.title || albumData.name,
        expiresAt: albumData.expires_at ?? albumData.files_purged_at,
        purged: !!albumData.files_purged_at,
      });
      setLoading(false);
      return;
    }
    setExpired(null);

    // Кодоор түгжээтэй цомог — код оруулаагүй бол зургийг ачаалахгүй
    const lock = await albumLockState(albumData.id);
    if (lock.state === 'locked') {
      setPinGate({ id: albumData.id, name: albumData.title || albumData.name });
      setLoading(false);
      return;
    }
    setPinGate(null);
    const lockToken = lock.state === 'ok' ? lock.token : '';

    const { data: ownerData } = await supabase
      .from('profiles').select('*')
      .eq('id', albumData.owner_id).maybeSingle();

    // Үнийн санал хүлээн авах эсэх (update-40-ийн SQL ажиллаагүй бол асаалттай гэж үзэхгүй)
    const { data: offerCfg, error: offerCfgErr } = await supabase.from('albums').select('accept_offers').eq('id', albumData.id).maybeSingle();
    const albumObj: AlbumData = {
      ...albumData,
      name: albumData.title || albumData.name,
      organizer_name: ownerData?.full_name ?? ownerData?.name ?? ownerData?.display_name ?? '',
      accept_offers: !offerCfgErr && (offerCfg as { accept_offers?: boolean } | null)?.accept_offers !== false,
    };
    setAlbum(albumObj);

    // Хавтасны багана байхгүй (SQL ажиллуулаагүй) үед хуучин хэлбэрээр уншина
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let photoData: any[] | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let first: { data: any[] | null; error: unknown } = lockToken
      // Түгжээтэй цомгийг кодоор нээсэн зочин — зургийг түлхүүрээр уншина
      ? await supabase.rpc('locked_album_photos', { p_album_id: albumData.id, p_token: lockToken })
      : await supabase
        .from('photo_uploads')
        .select('id, preview_url, filename, photographer_id, print_prices, folder_id, source, download_price, title')
        .eq('album_id', albumData.id)
        .order('created_at', { ascending: true });
    if (first.error) {
      // Зургийн нэрийн багана байхгүй (update-50-ийн SQL ажиллаагүй)
      first = await supabase
        .from('photo_uploads')
        .select('id, preview_url, filename, photographer_id, print_prices, folder_id, source, download_price')
        .eq('album_id', albumData.id)
        .order('created_at', { ascending: true });
    }
    if (first.error) {
      // Зураг тус бүрийн үнийн багана байхгүй (update-40-ийн SQL ажиллаагүй)
      first = await supabase
        .from('photo_uploads')
        .select('id, preview_url, filename, photographer_id, print_prices, folder_id, source')
        .eq('album_id', albumData.id)
        .order('created_at', { ascending: true });
    }
    photoData = first.data;
    if (first.error) {
      ({ data: photoData } = await supabase
        .from('photo_uploads')
        .select('id, preview_url, filename, photographer_id, print_prices')
        .eq('album_id', albumData.id)
        .order('created_at', { ascending: true }));
    }
    const { data: folderData } = await supabase
      .from('album_folders')
      .select('id, name')
      .eq('album_id', albumData.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    setFolders((folderData ?? []) as AlbumFolder[]);
    albumFaceSearchEnabled(albumData.id).then(setFaceEnabled);
    supabase.rpc('album_public_photographers', { p_album_id: albumData.id })
      .then(({ data }) => setAlbumPhotographers((data ?? []) as { photographer_id: string; name: string; photo_count: number }[]));

    // Зурагт тусдаа угаалгах үнэ тохируулаагүй бол цомгийн «Үнэ тариф»-ыг ашиглана.
    const albumPrint = albumPrintPrices((albumData as any).size_prices);
    // Нуусан (худалдагдсан тул устгаагүй) зургийг харуулахгүй
    const { data: hiddenRows, error: hiddenErr } = await supabase.from('photo_uploads').select('id')
      .eq('album_id', albumData.id).not('hidden_at', 'is', null);
    const hiddenSet = new Set(hiddenErr ? [] : (hiddenRows ?? []).map((h: { id: string }) => h.id));
    const mapped: PhotoData[] = (photoData ?? []).filter((p: any) => !hiddenSet.has(p.id)).map((p: any) => {
      const own = p.print_prices && typeof p.print_prices === 'object' ? p.print_prices : {};
      return {
        id: p.id,
        watermarked_url: p.preview_url,
        title: p.filename ?? p.id,
        photographer_id: p.photographer_id,
        print_prices: Object.keys(own).length > 0 ? own : albumPrint,
        folder_id: p.folder_id ?? null,
        source: p.source ?? null,
        download_price: p.download_price ?? null,
        name: typeof p.title === 'string' && p.title.trim() ? p.title.trim() : null,
      };
    });
    setPhotos(mapped);
    // Нүүр хуудасны хайлтаас ирсэн бол тухайн зураг руу гүйлгэнэ
    const focusId = searchParams.get('photo');
    if (focusId && mapped.some(p => p.id === focusId)) {
      setFocusPhoto(focusId);
      setTimeout(() => document.getElementById(`photo-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
      setTimeout(() => setFocusPhoto(null), 6000);
    }
    // Нүүр хуудсанд «Таны цомог» товчоор буцаж орох боломжтой болгоно
    rememberAlbum({
      id: albumObj.id,
      name: albumObj.name,
      link: String(albumData.share_link || link),
      cover: mapped.find(p => p.source !== 'ai_booth')?.watermarked_url ?? mapped[0]?.watermarked_url,
    });
    // AI бүүтийн зургийн цомог дахь үнийг сайтын админ тогтооно
    const { data: aiSetting } = await supabase.from('platform_settings').select('value').eq('key', 'ai_album_price').maybeSingle();
    const aiVal = Number((aiSetting as { value?: unknown } | null)?.value);
    const aiP = Number.isFinite(aiVal) && aiVal >= 0 ? aiVal : AI_ALBUM_PRICE_DEFAULT;
    setAiPrice(aiP);
    await restoreCart(albumData.id, mapped, albumObj, aiP);
    setLoading(false);
  }

  const addToCart = useCallback((item: Omit<CartItem, 'id'>) => {
    if (item.type === 'download' && !(item.price > 0)) return; // үнэгүй зургийг сагсанд хийхгүй
    const dup = cart.find(c =>
      c.photoId === item.photoId && c.type === item.type && c.printSize === item.printSize
    );
    if (dup) return;
    setCart(prev => [...prev, { ...item, id: crypto.randomUUID() }]);
  }, [cart]);

  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.id !== id));
  const cartTotal = cart.reduce((s, i) => s + i.price, 0);

  // ── Хавтаснууд: AI бүүтийн зургууд автоматаар «AI бүүт»-д, хавтасгүй нь «Бусад»-д ──
  const isAi = (p: PhotoData) => p.source === 'ai_booth';
  const folderIds = new Set(folders.map(f => f.id));
  const inFolder = (p: PhotoData) => !!p.folder_id && folderIds.has(p.folder_id);
  const aiCount = photos.filter(isAi).length;
  const otherCount = photos.filter(p => !isAi(p) && !inFolder(p)).length;
  const faceSet = new Set(faceIds ?? []);
  const folderTabs: { key: string; label: string; count: number }[] = [
    ...(faceIds ? [{ key: 'mine', label: '🙂 ' + t('Миний зургууд'), count: photos.filter(p => faceSet.has(p.id)).length }] : []),
    { key: 'all', label: t('Бүгд'), count: photos.length },
    ...folders
      .map(f => ({ key: f.id, label: f.name, count: photos.filter(p => !isAi(p) && p.folder_id === f.id).length }))
      .filter(f => f.count > 0),
    ...(aiCount > 0 ? [{ key: 'ai', label: '✨ ' + t('AI бүүт'), count: aiCount }] : []),
    ...(otherCount > 0 && (folders.length > 0 || aiCount > 0) ? [{ key: 'other', label: t('Бусад'), count: otherCount }] : []),
  ];
  const visiblePhotos = photos.filter(p => !phFilter || p.photographer_id === phFilter).filter(p =>
    folderFilter === 'all' ? true
    : folderFilter === 'mine' ? faceSet.has(p.id)
    : folderFilter === 'ai' ? isAi(p)
    : folderFilter === 'other' ? !isAi(p) && !inFolder(p)
    : !isAi(p) && p.folder_id === folderFilter);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (pinGate) {
    return (
      <>
        <LanguagePickerModal />
        <AlbumPinGate albumId={pinGate.id} albumName={pinGate.name} onUnlocked={() => shareLink && loadAlbum(shareLink)} />
      </>
    );
  }

  if (expired) {
    return (
      <>
        <LanguagePickerModal />
        <AlbumExpiredView albumId={expired.id} albumName={expired.name} expiresAt={expired.expiresAt}
          purged={expired.purged} onExtended={() => shareLink && loadAlbum(shareLink)} />
      </>
    );
  }

  if (notFound || !album) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
        <LanguagePickerModal />
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-stone-500" />
          </div>
          <p className="text-white font-semibold text-xl mb-2">{t('Цомог олдсонгүй')}</p>
          <p className="text-stone-400 text-sm">{t('Холбоос буруу эсвэл цомог идэвхгүй болсон байж болно.')}</p>
        </div>
      </div>
    );
  }

  // Үнэгүй хуваалцах цомог идэвхжээгүй — зочдод харуулахгүй, эзэнд идэвхжүүлэх товч
  const isOwner = !!profile && profile.id === album.owner_id;
  const freeMode = album.is_free && album.free_activated !== undefined;
  if (freeMode && !album.free_activated && !isOwner) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
        <LanguagePickerModal />
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="w-8 h-8 text-emerald-400" />
          </div>
          <p className="text-white font-semibold text-xl mb-2">{album.name}</p>
          <p className="text-stone-400 text-sm">{t('Цомог бэлтгэгдэж байна. Удахгүй нээгдэнэ.')}</p>
        </div>
      </div>
    );
  }
  const freeActive = freeMode && !!album.free_activated;

  // watermark_value-с layers parse хийх (шинэ формат)
  let wmLayers: WatermarkLayer[] = [];
  if (album.watermark_type === 'layers' && album.watermark_value) {
    try {
      const parsed = JSON.parse(album.watermark_value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        wmLayers = parsed.map((l: any) => ({
          id: l.id || crypto.randomUUID(),
          type: l.type === 'image' ? 'logo' : l.type,
          text: l.text || '',
          fontSize: l.fontSize || 20,
          color: l.color || '#ffffff',
          logoUrl: l.imagePreview || '',
          logoSize: l.imageSize || 20,
          position: l.position || 'bottom-right',
          opacity: typeof l.opacity === 'number' ? (l.opacity <= 1 ? l.opacity : l.opacity / 100) : 0.7,
        }));
      }
    } catch { wmLayers = []; }
  }

  // watermark_layers column (хуучин формат)
  if (wmLayers.length === 0) {
    let parsedLayers = album.watermark_layers;
    if (typeof parsedLayers === 'string') {
      try { parsedLayers = JSON.parse(parsedLayers); } catch { parsedLayers = []; }
    }
    if (parsedLayers && Array.isArray(parsedLayers) && parsedLayers.length > 0) {
      wmLayers = parsedLayers;
    }
  }

  // Хамгийн хуучин нэг layer формат
  if (wmLayers.length === 0 && (album.watermark_type || album.watermark_value)) {
    wmLayers = [{
      id: 'legacy',
      type: album.watermark_type === 'image' ? 'logo' : 'text',
      text: album.watermark_value || '',
      fontSize: 20,
      color: '#ffffff',
      logoUrl: album.watermark_logo_url || '',
      logoSize: 20,
      position: album.watermark_position || 'bottom-right',
      opacity: album.watermark_opacity ?? 0.7,
    }];
  }

  return (
    <div className="min-h-screen bg-stone-950">
      <LanguagePickerModal />
      <header className="border-b border-white/10 sticky top-0 z-30 bg-stone-950/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* ── Буцах товч ── */}
            <button
              // Линкээр шууд орж ирсэн бол буцах түүх байхгүй — нүүр хуудас руу
              onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/'))}
              className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-white transition-colors flex-shrink-0"
              title={t('Буцах')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {/* Лого → сайтын нүүр хуудас */}
            <a href="/" onClick={e => { e.preventDefault(); navigate('/'); }} title="Zuragchin.mn"
              className="w-8 h-8 flex-shrink-0 hover:opacity-80 transition-opacity">
              <BrandMark className="w-8 h-8" />
            </a>
            <div className="min-w-0">
              <p className="text-white font-bold truncate leading-tight">{album.name}</p>
              <p className="text-stone-500 text-xs truncate">{album.organizer_name || t('Зохион байгуулагч')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
          <LanguageSwitcher />
          <button onClick={() => navigate('/my-purchases')}
            title={t('Төлсөн захиалга')}
            className="relative flex items-center gap-1.5 text-stone-200 hover:text-white bg-white/5 border border-white/15 hover:border-white/30 px-2.5 py-2 rounded-xl transition-colors">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span className="text-xs sm:text-sm leading-tight text-left">{t('Төлсөн')}<span className="hidden sm:inline"> {t('захиалга')}</span></span>
            {paidCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-stone-950 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{paidCount}</span>
            )}
          </button>
          <button onClick={() => setCartOpen(o => !o)}
            className="relative flex items-center gap-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-xl transition-colors flex-shrink-0">
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline text-sm">{t('Сагс')}</span>
            {cart.length > 0 && (
              <span className="w-5 h-5 bg-stone-950 text-amber-400 text-xs font-bold rounded-full flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 border-b border-white/5">
        <AutoOpenInBrowser />
        <InAppBrowserBanner />
        <h1 className="text-white text-3xl font-bold mb-3">{album.name}</h1>
        <div className="flex flex-wrap gap-5 text-sm text-stone-400 mb-3">
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            {new Date(album.event_date).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          <span className="flex items-center gap-2">
            <User className="w-4 h-4 text-amber-400" />
            {album.organizer_name || t('Зохион байгуулагч')}
          </span>
          <span className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-amber-400" />
            {t('{n} зураг', { n: photos.length })}
          </span>
        </div>
        {album.expires_at && (() => {
          const left = Math.ceil((new Date(album.expires_at).getTime() - Date.now()) / 86400000);
          return left <= 7 ? (
            <p className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3 inline-block">
              {t('Цомог {n} хоногийн дараа хаагдана — зургаа эртхэн аваарай.', { n: Math.max(left, 0) })}
            </p>
          ) : null;
        })()}
        {album.description && (
          <p className="text-stone-400 text-sm max-w-2xl leading-relaxed">{album.description}</p>
        )}
        {album.is_free && (
          <span className="inline-block mt-3 text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-full">
            {t('Үнэгүй татах')}
          </span>
        )}
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {freeMode && !album.free_activated && isOwner && (
          <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex flex-wrap items-center gap-3 justify-between">
            <p className="text-emerald-200 text-sm">🎁 Энэ цомог идэвхжээгүй тул зочдод харагдахгүй байна (зөвхөн танд харагдаж байна).</p>
            <button onClick={() => navigate(`/dashboard/albums/${album.id}/activate`)}
              className="bg-emerald-400 hover:bg-emerald-300 text-stone-950 font-semibold text-sm px-4 py-2 rounded-xl">Багц сонгож идэвхжүүлэх</button>
          </div>
        )}
        {faceEnabled && photos.length > 0 && (
          <div className="mb-5 flex items-center gap-3 flex-wrap">
            <button onClick={() => setFaceOpen(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-stone-950 font-bold px-5 py-3 rounded-xl shadow-lg">
              <ScanFace className="w-5 h-5" /> {t('Өөрийн зургийг хайх')}
            </button>
            {faceIds && (
              <button onClick={() => { setFaceIds(null); setFolderFilter('all'); }}
                className="text-stone-400 hover:text-white text-sm underline underline-offset-4">
                {t('Хайлтыг цуцлах')}
              </button>
            )}
          </div>
        )}
        {albumPhotographers.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-3 mb-1 -mx-1 px-1 items-center">
            <span className="text-stone-500 text-xs flex-shrink-0">{t('Зурагчин')}:</span>
            {[{ photographer_id: '', name: t('Бүгд'), photo_count: photos.length }, ...albumPhotographers].map(ph => (
              <button key={ph.photographer_id || 'all'} onClick={() => setPhFilter(ph.photographer_id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  phFilter === ph.photographer_id ? 'bg-white text-stone-950 border-white' : 'bg-white/5 border-white/10 text-stone-300 hover:text-white'}`}>
                <span className="whitespace-nowrap">{ph.name}</span>
                <span className={phFilter === ph.photographer_id ? 'text-stone-600' : 'text-stone-500'}>{ph.photo_count}</span>
              </button>
            ))}
          </div>
        )}
        {(folderTabs.length > 1 || faceIds) && (
          <div className="flex gap-2 overflow-x-auto pb-4 mb-2 -mx-1 px-1">
            {folderTabs.map(f => (
              <button key={f.key} onClick={() => setFolderFilter(f.key)}
                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  folderFilter === f.key
                    ? 'bg-amber-500 border-amber-500 text-stone-950'
                    : 'bg-white/5 border-white/10 text-stone-300 hover:text-white hover:border-white/30'}`}>
                <FolderOpen className="w-4 h-4" />
                <span className="whitespace-nowrap">{f.label}</span>
                <span className={`text-xs ${folderFilter === f.key ? 'text-stone-800' : 'text-stone-500'}`}>{f.count}</span>
              </button>
            ))}
          </div>
        )}
        {photos.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <ImageIcon className="w-8 h-8 text-stone-500" />
            </div>
            <p className="text-white font-medium text-lg mb-2">{t('Зураг байхгүй байна')}</p>
            <p className="text-stone-500 text-sm">{t('Зурагчид одоогоор зураг байршуулаагүй байна.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {(folderFilter === 'mine' && faceIds
              ? [...visiblePhotos].sort((a, b) => faceIds.indexOf(a.id) - faceIds.indexOf(b.id))
              : visiblePhotos).map(photo => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                album={album}
                focused={focusPhoto === photo.id}
                wmLayers={freeMode ? [] : wmLayers}
                freeDownload={photo.source !== 'ai_booth' && (freeActive || photoDownloadPrice(photo, album, aiPrice) === 0)}
                freeBusy={freeBusy === photo.id}
                onFreeDownload={() => freeDownload(photo.id)}
                printPicked={printPicks.some(p => p.photoId === photo.id)}
                onTogglePrintPick={() => togglePrintPick(photo.id, photo.watermarked_url)}
                allowPrint={allowPrint}
                aiPrice={aiPrice}
                inCart={cart.filter(c => c.photoId === photo.id)}
                printSelectorOpen={printSelectorPhoto === photo.id}
                onTogglePrintSelector={() =>
                  setPrintSelectorPhoto(prev => prev === photo.id ? null : photo.id)
                }
                onAddDownload={() => addToCart({
                  photoId: photo.id,
                  photographerId: photo.photographer_id,
                  previewUrl: photo.watermarked_url,
                  filename: photo.title || photo.id,
                  type: 'download',
                  price: photoDownloadPrice(photo, album, aiPrice),
                })}
                onOffer={!freeMode && album.accept_offers && photo.source !== 'ai_booth' && photoDownloadPrice(photo, album, aiPrice) > 0
                  ? () => setOfferPhoto(photo) : undefined}
                onAddPrint={(size, price) => {
                  addToCart({
                    photoId: photo.id,
                    photographerId: photo.photographer_id,
                    previewUrl: photo.watermarked_url,
                    filename: photo.title || photo.id,
                    type: 'print',
                    printSize: size,
                    price,
                  });
                  setPrintSelectorPhoto(null);
                }}
              />
            ))}
          </div>
        )}
        {freeMode && (
          <p className="text-center text-stone-600 text-xs mt-10">
            {t('Энэ цомгийг')} <a href="/" className="text-amber-500 hover:underline">Zuragchin.mn</a>{t('-ээр бүтээв')}
          </p>
        )}
      </main>

      {freeViewer && <SaveImageViewer {...freeViewer} onClose={() => setFreeViewer(null)} />}

      {freeActive && printPicks.length > 0 && !printReqOpen && (
        <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 z-40">
          <button onClick={() => setPrintReqOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-5 py-3 rounded-2xl shadow-2xl">
            <Printer className="w-5 h-5" /> {t('Угаалгах хүсэлт илгээх')} · {printPicks.length}
          </button>
        </div>
      )}
      {printReqOpen && album && (
        <PrintRequestModal albumId={album.id} picks={printPicks} onChange={setPrintPicks}
          onClose={() => setPrintReqOpen(false)} onSent={() => setPrintPicks([])} />
      )}

      {cartOpen && (
        <CartSidebar
          cart={cart} total={cartTotal}
          onRemove={removeFromCart}
          onClose={() => setCartOpen(false)}
          onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
        />
      )}

      {offerPhoto && album && (
        <PriceOfferModal
          photoId={offerPhoto.id}
          previewUrl={offerPhoto.watermarked_url}
          listPrice={photoDownloadPrice(offerPhoto, album, aiPrice)}
          onClose={() => setOfferPhoto(null)}
        />
      )}

      {faceOpen && album && (
        <FaceSearchModal
          albumId={album.id}
          onClose={() => setFaceOpen(false)}
          onResult={ids => { setFaceIds(ids); setFolderFilter('mine'); }}
        />
      )}

      {checkoutOpen && album && (
        <CheckoutModal
          cart={cart} album={album}
          onClose={() => setCheckoutOpen(false)}
          onInvoiceCreated={(invoiceId) => setPendingInvoice(album.id, invoiceId)}
          onSuccess={(invoiceId) => {
            setCheckoutOpen(false);
            setPendingInvoice(album.id, null);
            saveCart(album.id, []);
            setCart([]);
            navigate(`/receipt/${invoiceId}`);
          }}
        />
      )}
    </div>
  );
}

function PhotoCard({ photo, album, focused, wmLayers, allowPrint, aiPrice, inCart, printSelectorOpen, onTogglePrintSelector, onAddDownload, onAddPrint, freeDownload, freeBusy, onFreeDownload, printPicked, onTogglePrintPick, onOffer }: {
  focused?: boolean;
  onOffer?: () => void;
  printPicked?: boolean;
  onTogglePrintPick?: () => void;
  freeDownload?: boolean;
  freeBusy?: boolean;
  onFreeDownload?: () => void;
  photo: PhotoData;
  album: AlbumData;
  wmLayers: WatermarkLayer[];
  allowPrint: boolean;
  aiPrice: number;
  inCart: CartItem[];
  printSelectorOpen: boolean;
  onTogglePrintSelector: () => void;
  onAddDownload: () => void;
  onAddPrint: (size: string, price: number) => void;
}) {
  const { t } = useI18n();
  const downloadInCart = inCart.some(c => c.type === 'download');
  const hasPrintPrices = photo.print_prices && Object.keys(photo.print_prices).length > 0;
  const downloadPrice  = photoDownloadPrice(photo, album, aiPrice);

  return (
    <div id={`photo-${photo.id}`} className={`group bg-white/5 border rounded-2xl overflow-hidden transition-all duration-200 ${
      focused ? 'border-amber-400 ring-2 ring-amber-400/60 shadow-lg shadow-amber-500/20' : 'border-white/10 hover:border-white/20'}`}>
      <div className="relative aspect-square bg-stone-900 overflow-hidden select-none">
        <img
          src={photo.watermarked_url}
          alt={photo.name || photo.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          draggable={false}
          onContextMenu={e => e.preventDefault()}
        />
        {/* Булангийн layer-үүд */}
        {wmLayers.filter(l => l.type !== 'tiled-text').map(layer => {
          const opacityVal = typeof layer.opacity === 'number' ? (layer.opacity > 1 ? layer.opacity / 100 : layer.opacity) : 0.7;
          return (
            <div key={layer.id} className="absolute pointer-events-none" style={{ ...getPosStyle(layer.position), opacity: opacityVal, maxWidth: '45%' }}>
              {layer.type === 'text' && layer.text && (
                <span style={{ fontSize: `clamp(8px, ${(layer.fontSize ?? 20) * 0.22}vw, ${layer.fontSize ?? 20}px)`, color: layer.color || '#ffffff', textShadow: '0 1px 4px rgba(0,0,0,0.9)', fontWeight: 700, whiteSpace: 'nowrap', userSelect: 'none', display: 'block' }}>
                  {layer.text}
                </span>
              )}
              {layer.type === 'logo' && layer.logoUrl && (
                <img src={layer.logoUrl} alt="wm" draggable={false} style={{ width: `${(layer.logoSize ?? 20) * 2}px`, height: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))', userSelect: 'none', display: 'block' }} />
              )}
            </div>
          );
        })}
        {/* Битүү tiled-text layer-үүд */}
        {wmLayers.filter(l => l.type === 'tiled-text').map(layer => {
          const op = typeof layer.opacity === 'number' ? (layer.opacity > 1 ? layer.opacity / 100 : layer.opacity) : 0.3;
          const items = [];
          for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
            items.push(<span key={`${r}-${c}`} style={{ fontSize: `${Math.max(6, (layer.fontSize ?? 16) * 0.28)}px`, color: layer.color || '#ffffff', opacity: op, transform: 'rotate(-30deg)', display: 'block', padding: '3px 6px', whiteSpace: 'nowrap', fontWeight: 600, userSelect: 'none' }}>{layer.text}</span>);
          }
          return (
            <div key={layer.id} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', alignItems: 'center', justifyItems: 'center' }}>
              {items}
            </div>
          );
        })}
        {inCart.length > 0 && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center z-10">
            <span className="text-stone-950 text-xs font-bold">{inCart.length}</span>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        {photo.name && <p className="text-white text-sm font-medium truncate" title={photo.name}>{photo.name}</p>}
        {freeDownload ? (
          <button onClick={onFreeDownload} disabled={freeBusy}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-stone-950 transition-colors">
            <span className="flex items-center gap-2">
              {freeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {t('Татах')}
            </span>
            <span className="text-xs">{t('Үнэгүй')}</span>
          </button>
        ) : (
        <button onClick={onAddDownload} disabled={downloadInCart}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
            downloadInCart
              ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
              : 'bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/20 text-white hover:text-amber-400'
          }`}>
          <span className="flex items-center gap-2">
            <Download className="w-3.5 h-3.5" />
            {downloadInCart ? t('Нэмэгдсэн ✓') : t('Татах')}
          </span>
          <span className="text-xs font-semibold">
            {downloadPrice === 0 ? t('Үнэгүй') : `₮${downloadPrice.toLocaleString()}`}
          </span>
        </button>
        )}
        {onOffer && !downloadInCart && (
          <button onClick={onOffer}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-stone-400 hover:text-amber-300 hover:bg-white/5 transition-colors">
            <HandCoins className="w-3.5 h-3.5" /> {t('Үнийн санал илгээх')}
          </button>
        )}
        {freeDownload && onTogglePrintPick && (
          <button onClick={onTogglePrintPick}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
              printPicked ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-stone-300 hover:text-white'}`}>
            <Printer className="w-3.5 h-3.5" /> {printPicked ? t('Угаалгахаар сонгосон ✓') : t('Угаалгуулах')}
          </button>
        )}

        {allowPrint && hasPrintPrices && (
          <div>
            <button onClick={onTogglePrintSelector}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors">
              <span className="flex items-center gap-2"><Printer className="w-3.5 h-3.5" />{t('Угаалгах')}</span>
              {printSelectorOpen
                ? <ChevronUp className="w-3.5 h-3.5 text-stone-500" />
                : <ChevronDown className="w-3.5 h-3.5 text-stone-500" />}
            </button>
            {printSelectorOpen && (
              <div className="mt-2 bg-stone-900 border border-white/10 rounded-xl overflow-hidden">
                {Object.entries(photo.print_prices).map(([size, price]) => {
                  const alreadyInCart = inCart.some(c => c.type === 'print' && c.printSize === size);
                  return (
                    <button key={size}
                      onClick={() => !alreadyInCart && onAddPrint(size, price as number)}
                      disabled={alreadyInCart}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors border-b border-white/5 last:border-0 ${
                        alreadyInCart
                          ? 'text-green-400 bg-green-500/5 cursor-default'
                          : 'text-stone-300 hover:bg-white/5 hover:text-white'
                      }`}>
                      <span>{PRINT_SIZE_LABELS[size] ?? size}</span>
                      <span className="font-semibold">
                        {alreadyInCart ? '✓' : `₮${(price as number).toLocaleString()}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CartSidebar({ cart, total, onRemove, onClose, onCheckout }: {
  cart: CartItem[]; total: number;
  onRemove: (id: string) => void;
  onClose: () => void;
  onCheckout: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="fixed inset-0 bg-stone-950/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-stone-900 border-l border-white/10 z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <h2 className="text-white font-semibold text-lg flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-amber-400" />{t('Сагс')} ({cart.length})
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-10 h-10 text-stone-600 mx-auto mb-3" />
              <p className="text-stone-500 text-sm">{t('Сагс хоосон байна')}</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                <img src={item.previewUrl} alt={item.filename} className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{item.filename}</p>
                  <p className="text-stone-400 text-xs">
                    {item.type === 'download' ? t('Татах') : `${t('Угаалгах')} — ${PRINT_SIZE_LABELS[item.printSize!] ?? item.printSize}`}
                  </p>
                  <p className="text-amber-400 text-sm font-semibold">
                    {item.price === 0 ? t('Үнэгүй') : `₮${item.price.toLocaleString()}`}
                  </p>
                </div>
                <button onClick={() => onRemove(item.id)} className="text-stone-600 hover:text-red-400 transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
        {cart.length > 0 && (
          <div className="px-6 py-5 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-400">{t('Нийт дүн')}</span>
              <span className="text-white font-semibold text-lg">₮{total.toLocaleString()}</span>
            </div>
            <button onClick={onCheckout}
              className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3.5 rounded-xl transition-colors text-base">
              {t('QPay-ээр төлөх')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** Цомгийн size_prices ([{size, price, enabled?}]) → {"10x15": 10000, ...}. digital-ийг оруулахгүй. */
function albumPrintPrices(sizePrices: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(sizePrices)) return out;
  for (const sp of sizePrices as { size?: string; price?: number; enabled?: boolean }[]) {
    const size = String(sp?.size ?? '');
    const price = Number(sp?.price ?? 0);
    if (sp?.enabled === false) continue;
    if (size && size !== 'digital' && price > 0) out[size] = price;
  }
  return out;
}
