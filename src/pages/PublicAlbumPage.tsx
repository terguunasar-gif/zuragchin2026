import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera, Download, Printer, ShoppingCart, X,
  Calendar, User, Image as ImageIcon, AlertCircle,
  ChevronDown, ChevronUp, ChevronLeft, Receipt, FolderOpen, ScanFace,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import CheckoutModal from './checkout/CheckoutModal';
const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
import { loadCart, saveCart, getPendingInvoice, setPendingInvoice, listPurchaseHistory } from '../lib/purchaseHistory';
import { useI18n } from '../lib/i18n';
import { LanguagePickerModal, LanguageSwitcher } from '../components/LanguagePicker';
import FaceSearchModal from '../components/FaceSearchModal';
import InAppBrowserBanner from '../components/InAppBrowserBanner';
import AutoOpenInBrowser from '../components/AutoOpenInBrowser';
import AlbumExpiredView from '../components/AlbumExpiredView';
import { albumFaceSearchEnabled } from '../lib/faceSearch';

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
}

export interface PhotoData {
  id: string;
  watermarked_url: string;
  title: string;
  photographer_id: string;
  print_prices: Record<string, number>;
  folder_id?: string | null;
  source?: string | null;
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
  // Царайгаар хайх
  const [faceEnabled, setFaceEnabled] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);
  const [faceIds, setFaceIds] = useState<string[] | null>(null);
  const [aiPrice, setAiPrice] = useState<number>(AI_ALBUM_PRICE_DEFAULT);
  const [expired, setExpired] = useState<{ id: string; name: string; expiresAt: string; purged: boolean } | null>(null);

  const [cartReady, setCartReady] = useState(false);
  const [paidCount] = useState(() => { try { return listPurchaseHistory().length; } catch { return 0; } });

  useEffect(() => { if (shareLink) loadAlbum(shareLink); }, [shareLink]);

  // Сагсыг браузерт хадгална — өөр хуудас руу ороод буцаж ирэхэд хэвээр байна.
  useEffect(() => {
    if (album && cartReady) saveCart(album.id, cart);
  }, [album, cart, cartReady]);

  async function restoreCart(albumId: string, current: PhotoData[], downloadPrice: number, aiPrice: number) {
    // Хадгалсан сагсны үнийг одоогийн үнээр шинэчилнэ (үнэ өөрчлөгдсөн байж болно)
    const byId = new Map(current.map(p => [p.id, p]));
    const saved = loadCart<CartItem>(albumId).flatMap(c => {
      const photo = byId.get(c.photoId);
      if (!photo) return [];
      if (c.type === 'download') return [{ ...c, price: photo.source === 'ai_booth' ? aiPrice : downloadPrice }];
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
    const withExpiry = await supabase.from('albums').select(BASE_COLS + ', expires_at, files_purged_at').or(byLink).maybeSingle();
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

    const { data: ownerData } = await supabase
      .from('profiles').select('*')
      .eq('id', albumData.owner_id).maybeSingle();

    setAlbum({
      ...albumData,
      name: albumData.title || albumData.name,
      organizer_name: ownerData?.full_name ?? ownerData?.name ?? ownerData?.display_name ?? '',
    });

    // Хавтасны багана байхгүй (SQL ажиллуулаагүй) үед хуучин хэлбэрээр уншина
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let photoData: any[] | null = null;
    const first = await supabase
      .from('photo_uploads')
      .select('id, preview_url, filename, photographer_id, print_prices, folder_id, source')
      .eq('album_id', albumData.id)
      .order('created_at', { ascending: true });
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

    // Зурагт тусдаа угаалгах үнэ тохируулаагүй бол цомгийн «Үнэ тариф»-ыг ашиглана.
    const albumPrint = albumPrintPrices((albumData as any).size_prices);
    const mapped: PhotoData[] = (photoData ?? []).map((p: any) => {
      const own = p.print_prices && typeof p.print_prices === 'object' ? p.print_prices : {};
      return {
        id: p.id,
        watermarked_url: p.preview_url,
        title: p.filename ?? p.id,
        photographer_id: p.photographer_id,
        print_prices: Object.keys(own).length > 0 ? own : albumPrint,
        folder_id: p.folder_id ?? null,
        source: p.source ?? null,
      };
    });
    setPhotos(mapped);
    // AI бүүтийн зургийн цомог дахь үнийг сайтын админ тогтооно
    const { data: aiSetting } = await supabase.from('platform_settings').select('value').eq('key', 'ai_album_price').maybeSingle();
    const aiVal = Number((aiSetting as { value?: unknown } | null)?.value);
    const aiP = Number.isFinite(aiVal) && aiVal >= 0 ? aiVal : AI_ALBUM_PRICE_DEFAULT;
    setAiPrice(aiP);
    await restoreCart(albumData.id, mapped, albumData.is_free ? 0 : Number(albumData.download_price ?? 0), aiP);
    setLoading(false);
  }

  const addToCart = useCallback((item: Omit<CartItem, 'id'>) => {
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
  const visiblePhotos = photos.filter(p =>
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
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-white transition-colors flex-shrink-0"
              title={t('Буцах')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Camera className="w-5 h-5 text-stone-950" />
            </div>
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
                wmLayers={wmLayers}
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
                  price: photo.source === 'ai_booth' ? aiPrice : (album.is_free ? 0 : album.download_price),
                })}
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
      </main>

      {cartOpen && (
        <CartSidebar
          cart={cart} total={cartTotal}
          onRemove={removeFromCart}
          onClose={() => setCartOpen(false)}
          onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
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

function PhotoCard({ photo, album, wmLayers, allowPrint, aiPrice, inCart, printSelectorOpen, onTogglePrintSelector, onAddDownload, onAddPrint }: {
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
  const downloadPrice  = photo.source === 'ai_booth' ? aiPrice : (album.is_free ? 0 : album.download_price);

  return (
    <div className="group bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl overflow-hidden transition-all duration-200">
      <div className="relative aspect-square bg-stone-900 overflow-hidden select-none">
        <img
          src={photo.watermarked_url}
          alt={photo.title}
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
