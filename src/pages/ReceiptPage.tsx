import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Camera, CheckCircle2, Download, Printer, ArrowLeft,
  Loader2, AlertCircle, Phone, Mail, Facebook, Instagram,
  Calendar, Hash,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const ANON_KEY    = import.meta.env.VITE_SUPABASE_ANON_KEY;

const fnHeaders = {
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};

const PRINT_SIZE_LABELS: Record<string, string> = {
  '10x15': '10×15 cm',
  '13x18': '13×18 cm',
  '20x30': '20×30 cm',
  'A4':    'A4 (21×29.7)',
  '21x30': '21×30 cm',
};

interface PurchaseRow {
  id: string;
  photo_id: string;
  type: 'download' | 'print';
  print_size: string;
  gross_amount: number;
  payment_status: string;
  photographer_id: string;
  buyer_name: string;
  buyer_phone: string;
  album_id: string;
  created_at: string;
  photo_uploads: {
    preview_url: string;
    filename: string;
  } | null;
}

interface SignedUrlItem {
  purchaseId: string;
  signedUrl: string;
  filename: string;
  type: string;
}

interface PhotographerContact {
  name: string;
  contact_info: Record<string, string>;
}

export default function ReceiptPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<SignedUrlItem[]>([]);
  const [photographers, setPhotographers] = useState<Record<string, PhotographerContact>>({});
  const [albumShareLink, setAlbumShareLink] = useState('');

  useEffect(() => {
    if (invoiceId) load(invoiceId);
  }, [invoiceId]);

  async function load(id: string) {
    setLoading(true);
    setError('');

    try {
      // Fetch purchases from DB
      const { data, error: dbErr } = await supabase
        .from('purchases')
        .select(`
          id, photo_id, type, print_size, gross_amount, payment_status,
          photographer_id, buyer_name, buyer_phone, album_id, created_at,
          photo_uploads ( preview_url, filename )
        `)
        .eq('qpay_invoice_id', id);

      if (dbErr) throw new Error(dbErr.message);
      if (!data || data.length === 0) throw new Error('Order not found');

      const rows = data as unknown as PurchaseRow[];
      setPurchases(rows);

      // Fetch album share link
      if (rows[0]?.album_id) {
        const { data: albumData } = await supabase
          .from('albums')
          .select('share_link')
          .eq('id', rows[0].album_id)
          .maybeSingle();
        setAlbumShareLink(albumData?.share_link ?? '');
      }

      // Fetch photographer contacts for print orders
      const printPhotographerIds = [...new Set(
        rows.filter(r => r.type === 'print').map(r => r.photographer_id),
      )];
      if (printPhotographerIds.length > 0) {
        const { data: pData } = await supabase
          .from('users')
          .select('id, name, contact_info')
          .in('id', printPhotographerIds);
        const map: Record<string, PhotographerContact> = {};
        for (const p of pData ?? []) map[p.id] = { name: p.name, contact_info: p.contact_info ?? {} };
        setPhotographers(map);
      }

      // Fetch signed download URLs for paid download purchases
      const hasPaidDownloads = rows.some(r => r.type === 'download' && r.payment_status === 'paid');
      if (hasPaidDownloads) {
        const res = await fetch(`${QPAY_FN_URL}/signed-urls`, {
          method: 'POST',
          headers: fnHeaders,
          body: JSON.stringify({ invoiceId: id }),
        });
        if (res.ok) {
          const { signedUrls: urls } = await res.json();
          setSignedUrls(urls ?? []);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load receipt');
    } finally {
      setLoading(false);
    }
  }

  const isPaid = purchases.every(p => p.payment_status === 'paid');
  const buyerName = purchases[0]?.buyer_name ?? '';
  const orderDate = purchases[0]?.created_at
    ? new Date(purchases[0].created_at).toLocaleDateString('mn-MN', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '';
  const totalPaid = purchases.reduce((s, p) => s + Number(p.gross_amount), 0);

  const downloadPurchases = purchases.filter(p => p.type === 'download');
  const printPurchases = purchases.filter(p => p.type === 'print');

  const contactIcons: Record<string, React.ReactNode> = {
    phone:     <Phone className="w-4 h-4" />,
    email:     <Mail className="w-4 h-4" />,
    facebook:  <Facebook className="w-4 h-4" />,
    instagram: <Instagram className="w-4 h-4" />,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-white font-semibold text-lg mb-2">Баримт олдсонгүй</p>
          <p className="text-stone-400 text-sm mb-5">{error}</p>
          <button onClick={() => navigate(-1)} className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
            Буцах
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-stone-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {albumShareLink && (
              <button
                onClick={() => {
                  const link = albumShareLink.replace(/^\/album\//, '');
                  navigate(`/album/${link}`);
                }}
                className="text-stone-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
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
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        {/* Status banner */}
        <div className={`rounded-2xl p-6 flex items-start gap-4 ${isPaid ? 'bg-green-500/10 border border-green-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${isPaid ? 'bg-green-500/15' : 'bg-amber-500/15'}`}>
            {isPaid
              ? <CheckCircle2 className="w-6 h-6 text-green-400" />
              : <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
            }
          </div>
          <div>
            <p className={`font-semibold text-lg ${isPaid ? 'text-green-400' : 'text-amber-400'}`}>
              {isPaid ? 'Төлбөр амжилттай хийгдлээ!' : 'Төлбөр хүлээгдэж байна'}
            </p>
            <p className="text-stone-400 text-sm mt-0.5">
              {isPaid ? `Баярлалаа, ${buyerName}!` : 'Төлбөр баталгаажсаны дараа баримт харагдана.'}
            </p>
          </div>
        </div>

        {/* Order meta */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-stone-400 text-sm">
            <Hash className="w-4 h-4 text-amber-400" />
            <span className="text-stone-500">Нэхэмжлэл:</span>
            <span className="text-white font-mono text-xs break-all">{invoiceId}</span>
          </div>
          {orderDate && (
            <div className="flex items-center gap-2 text-sm text-stone-400">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>{orderDate}</span>
            </div>
          )}
          <div className="border-t border-white/10 pt-3 flex justify-between text-sm">
            <span className="text-stone-400">Нийт төлсөн дүн</span>
            <span className="text-amber-400 font-bold text-base">₮{totalPaid.toLocaleString()}</span>
          </div>
        </div>

        {/* Download section */}
        {downloadPurchases.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
              <Download className="w-4 h-4 text-amber-400" />
              <h3 className="text-white font-semibold">Татан авах зурагнууд</h3>
              <span className="ml-auto text-stone-500 text-xs">{downloadPurchases.length} зураг</span>
            </div>
            <div className="divide-y divide-white/5">
              {downloadPurchases.map(p => {
                const urlItem = signedUrls.find(u => u.purchaseId === p.id);
                return (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                    {p.photo_uploads?.preview_url && (
                      <img
                        src={p.photo_uploads.preview_url}
                        alt={p.photo_uploads.filename}
                        className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{p.photo_uploads?.filename ?? 'Photo'}</p>
                      <p className="text-stone-500 text-xs">₮{Number(p.gross_amount).toLocaleString()}</p>
                    </div>
                    {isPaid && urlItem?.signedUrl ? (
                      <a
                        href={urlItem.signedUrl}
                        download={urlItem.filename}
                        className="flex items-center gap-1.5 text-xs font-semibold text-stone-950 bg-amber-500 hover:bg-amber-400 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Татах
                      </a>
                    ) : (
                      <span className="text-xs text-stone-500 flex-shrink-0">
                        {isPaid ? 'Холбоос байхгүй' : 'Хүлээгдэж байна'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 bg-stone-950/30 border-t border-white/5">
              <p className="text-stone-500 text-xs">Татах холбоосууд 24 цагийн дотор хүчинтэй.</p>
            </div>
          </div>
        )}

        {/* Print section */}
        {printPurchases.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
              <Printer className="w-4 h-4 text-amber-400" />
              <h3 className="text-white font-semibold">Хэвлэх захиалга</h3>
              <span className="ml-auto text-stone-500 text-xs">{printPurchases.length} бараа</span>
            </div>
            <div className="divide-y divide-white/5">
              {printPurchases.map(p => {
                const pg = photographers[p.photographer_id];
                return (
                  <div key={p.id} className="px-5 py-4 space-y-3">
                    <div className="flex items-center gap-4">
                      {p.photo_uploads?.preview_url && (
                        <img
                          src={p.photo_uploads.preview_url}
                          alt={p.photo_uploads.filename}
                          className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{p.photo_uploads?.filename ?? 'Photo'}</p>
                        <p className="text-stone-400 text-xs">
                          {PRINT_SIZE_LABELS[p.print_size] ?? p.print_size} — ₮{Number(p.gross_amount).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {pg && (
                      <div className="bg-stone-950/40 rounded-xl p-3 space-y-1.5">
                        <p className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-2">
                          Фотографчтой холбоо барих
                        </p>
                        <p className="text-white text-sm font-medium">{pg.name}</p>
                        {Object.entries(pg.contact_info).map(([key, val]) => val ? (
                          <div key={key} className="flex items-center gap-2 text-stone-300 text-sm">
                            <span className="text-stone-500">{contactIcons[key] ?? <Phone className="w-4 h-4" />}</span>
                            <span className="capitalize text-stone-500 w-16 text-xs">{key}</span>
                            <span>{val}</span>
                          </div>
                        ) : null)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 bg-stone-950/30 border-t border-white/5">
              <p className="text-stone-500 text-xs">Хэвлэх захиалгын хувьд фотографчтай шууд холбоо барина уу.</p>
            </div>
          </div>
        )}

        {/* Back to album */}
        {albumShareLink && (
          <button
            onClick={() => {
              const link = albumShareLink.replace(/^\/album\//, '');
              navigate(`/album/${link}`);
            }}
            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-3 rounded-xl transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Цомог руу буцах
          </button>
        )}
      </main>
    </div>
  );
}
