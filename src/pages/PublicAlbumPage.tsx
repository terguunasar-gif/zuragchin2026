import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera, Download, Printer, ShoppingCart, X,
  Calendar, User, Image as ImageIcon, AlertCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import CheckoutModal from './checkout/CheckoutModal';

export interface AlbumData {
  id: string;
  name: string;
  event_date: string;
  description: string;
  is_free: boolean;
  download_price: number;
  owner_id: string;
  organizer_name: string;
}

export interface PhotoData {
  id: string;
  watermarked_url: string;
  title: string;
  photographer_id: string;
  print_prices: Record<string, number>;
}

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

const PRINT_SIZE_LABELS: Record<string, string> = {
  '10x15': '10×15 см',
  '13x18': '13×18 см',
  '20x30': '20×30 см',
  'A4':    'A4 (21×29.7)',
  '21x30': '21×30 см',
};

export default function PublicAlbumPage() {
  const { shareLink } = useParams<{ shareLink: string }>();
  const navigate = useNavigate();

  const [album, setAlbum] = useState<AlbumData | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [printSelectorPhoto, setPrintSelectorPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (shareLink) loadAlbum(shareLink);
  }, [shareLink]);

  async function loadAlbum(link: string) {
    setLoading(true);

    const { data: albumData } = await supabase
      .from('albums')
      .select('id, name, event_date, description, is_free, download_price, owner_id, status')
      .or(`share_link.eq./album/${link},share_link.eq.${link},id.eq.${link}`)
      .eq('status', 'active')
      .maybeSingle();

    if (!albumData) { setNotFound(true); setLoading(false); return; }

    // Organizer name
    const { data: ownerData } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', albumData.owner_id)
      .maybeSingle();

    setAlbum({ ...albumData, organizer_name: ownerData?.name ?? 'Зохион байгуулагч' });

    // Photos
    const { data: photoData } = await supabase
      .from('photos')
      .select('id, watermarked_url, title, photographer_id, print_prices')
      .eq('album_id', albumData.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    setPhotos(photoData ?? []);
    setLoading(false);
  }

  const addToCart = useCallback((item: Omit<CartItem, 'id'>) => {
    const dup = cart.find(c =>
      c.photoId === item.photoId &&
      c.type === item.type &&
      c.printSize === item.printSize,
    );
    if (dup) return;
    setCart(prev => [...prev, { ...item, id: crypto.randomUUID() }]);
  }, [cart]);

  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.id !== id));
  const cartTotal = cart.reduce((s, i) => s + i.price, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !album) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-stone-500" />
          </div>
          <p className="text-white font-semibold text-xl mb-2">Цомог олдсонгүй</p>
          <p className="text-stone-400 text-sm">Холбоос буруу эсвэл цомог идэвхгүй болсон байж болно.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 z-30 bg-stone-950/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Camera className="w-5 h-5 text-stone-950" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold truncate leading-tight">{album.name}</p>
              <p className="text-stone-500 text-xs truncate">{album.organizer_name}</p>
            </div>
          </div>

          <button
            onClick={() => setCartOpen(o => !o)}
            className="relative flex items-center gap-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-xl transition-colors flex-shrink-0"
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline text-sm">Сагс</span>
            {cart.length > 0 && (
              <span className="w-5 h-5 bg-stone-950 text-amber-400 text-xs font-bold rounded-full flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Album info */}
      <div className="max-w-7xl mx-auto px-6 py-8 border-b border-white/5">
        <h1 className="text-white text-3xl font-bold mb-3">{album.name}</h1>
        <div className="flex flex-wrap gap-5 text-sm text-stone-400 mb-3">
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            {new Date(album.event_date).toLocaleDateString('mn-MN', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          <span className="flex items-center gap-2">
            <User className="w-4 h-4 text-amber-400" />
            {album.organizer_name}
          </span>
          <span className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-amber-400" />
            {photos.length} зураг
          </span>
        </div>
        {album.description && (
          <p className="text-stone-400 text-sm max-w-2xl leading-relaxed">{album.description}</p>
        )}
        {album.is_free && (
          <span className="inline-block mt-3 text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-full">
            Үнэгүй татах
          </span>
        )}
      </div>

      {/* Photo grid */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {photos.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <ImageIcon className="w-8 h-8 text-stone-500" />
            </div>
            <p className="text-white font-medium text-lg mb-2">Зураг байхгүй байна</p>
            <p className="text-stone-500 text-sm">Зурагчид одоогоор зураг байршуулаагүй байна.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map(photo => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                album={album}
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
                  price: album.is_free ? 0 : album.download_price,
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

      {/* Cart sidebar */}
      {cartOpen && (
        <CartSidebar
          cart={cart}
          total={cartTotal}
          onRemove={removeFromCart}
          onClose={() => setCartOpen(false)}
          onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
        />
      )}

      {/* Checkout modal */}
      {checkoutOpen && album && (
        <CheckoutModal
          cart={cart}
          album={album}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={(invoiceId) => {
            setCheckoutOpen(false);
            setCart([]);
            navigate(`/receipt/${invoiceId}`);
          }}
        />
      )}
    </div>
  );
}

function PhotoCard({
  photo, album, inCart, printSelectorOpen,
  onTogglePrintSelector, onAddDownload, onAddPrint,
}: {
  photo: PhotoData;
  album: AlbumData;
  inCart: CartItem[];
  printSelectorOpen: boolean;
  onTogglePrintSelector: () => void;
  onAddDownload: () => void;
  onAddPrint: (size: string, price: number) => void;
}) {
  const downloadInCart = inCart.some(c => c.type === 'download');
  const hasPrintPrices = photo.print_prices && Object.keys(photo.print_prices).length > 0;
  const downloadPrice = album.is_free ? 0 : album.download_price;

  return (
    <div className="group bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl overflow-hidden transition-all duration-200">
      <div className="relative aspect-square bg-stone-900 overflow-hidden">
        <img
          src={photo.watermarked_url}
          alt={photo.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        {inCart.length > 0 && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
            <span className="text-stone-950 text-xs font-bold">{inCart.length}</span>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        {/* Татах */}
        <button
          onClick={onAddDownload}
          disabled={downloadInCart}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
            downloadInCart
              ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
              : 'bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/20 text-white hover:text-amber-400'
          }`}
        >
          <span className="flex items-center gap-2">
            <Download className="w-3.5 h-3.5" />
            {downloadInCart ? 'Нэмэгдсэн ✓' : 'Татах'}
          </span>
          <span className="text-xs font-semibold">
            {downloadPrice === 0 ? 'Үнэгүй' : `₮${downloadPrice.toLocaleString()}`}
          </span>
        </button>

        {/* Угаалгах */}
        {hasPrintPrices && (
          <div>
            <button
              onClick={onTogglePrintSelector}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors"
            >
              <span className="flex items-center gap-2">
                <Printer className="w-3.5 h-3.5" />
                Угаалгах
              </span>
              {printSelectorOpen
                ? <ChevronUp className="w-3.5 h-3.5 text-stone-500" />
                : <ChevronDown className="w-3.5 h-3.5 text-stone-500" />
              }
            </button>

            {printSelectorOpen && (
              <div className="mt-2 bg-stone-900 border border-white/10 rounded-xl overflow-hidden">
                {Object.entries(photo.print_prices).map(([size, price]) => {
                  const alreadyInCart = inCart.some(c => c.type === 'print' && c.printSize === size);
                  return (
                    <button
                      key={size}
                      onClick={() => !alreadyInCart && onAddPrint(size, price)}
                      disabled={alreadyInCart}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors border-b border-white/5 last:border-0 ${
                        alreadyInCart
                          ? 'text-green-400 bg-green-500/5 cursor-default'
                          : 'text-stone-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
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

function CartSidebar({
  cart, total, onRemove, onClose, onCheckout,
}: {
  cart: CartItem[];
  total: number;
  onRemove: (id: string) => void;
  onClose: () => void;
  onCheckout: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-stone-950/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-stone-900 border-l border-white/10 z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <h2 className="text-white font-semibold text-lg flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-amber-400" />
            Сагс ({cart.length})
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-10 h-10 text-stone-600 mx-auto mb-3" />
              <p className="text-stone-500 text-sm">Сагс хоосон байна</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                <img
                  src={item.previewUrl}
                  alt={item.filename}
                  className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{item.filename}</p>
                  <p className="text-stone-400 text-xs">
                    {item.type === 'download'
                      ? 'Татах'
                      : `Угаалгах — ${PRINT_SIZE_LABELS[item.printSize!] ?? item.printSize}`}
                  </p>
                  <p className="text-amber-400 text-sm font-semibold">
                    {item.price === 0 ? 'Үнэгүй' : `₮${item.price.toLocaleString()}`}
                  </p>
                </div>
                <button
                  onClick={() => onRemove(item.id)}
                  className="text-stone-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="px-6 py-5 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-400">Нийт дүн</span>
              <span className="text-white font-semibold text-lg">₮{total.toLocaleString()}</span>
            </div>
            <button
              onClick={onCheckout}
              className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3.5 rounded-xl transition-colors text-base"
            >
              QPay-ээр төлөх
            </button>
          </div>
        )}
      </div>
    </>
  );
}
