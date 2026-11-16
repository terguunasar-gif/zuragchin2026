import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Download, Printer, ArrowLeft, Loader2, AlertCircle, Phone, Mail, Facebook, Instagram, Calendar, Hash, Clock, X, Share2, CheckSquare, Square, Images,
} from 'lucide-react';
import { publicDb, withTimeout } from '../lib/supabase';
import { addPurchaseHistory } from '../lib/purchaseHistory';
import { useI18n } from '../lib/i18n';
import { LanguageSwitcher } from '../components/LanguagePicker';
import { inAppBrowserName, isIOS, saveFilesToGallery, saveImageToDevice } from '../lib/browserEnv';
import { applyBrandToPurchase } from '../lib/watermark';
import { hasEdit, PhotoAdjust, PrintCrop, preparePrintBlob } from '../lib/photoAdjust';
import PrintEditor from '../components/PrintEditor';
import { flushPendingEdits } from '../lib/pendingEdits';
import { everyDownloaded, idsWithServerDownloads, readDownloadedIds, withoutDownloaded, writeDownloadedIds } from '../lib/receiptDownloads';

async function blobUrlToDataUrl(u: string): Promise<string> {
  const blob = await (await fetch(u)).blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
import BrandMark from '../components/BrandMark';

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
  print_status?: string;
  download_count?: number;
  photo_uploads: {
    preview_url: string;
    original_url: string;
    filename: string;
  } | null;
}

interface SignedUrlItem {
  purchaseId: string;
  signedUrl: string;
  filename: string;
  type: string;
  /** Татах хугацаа дуусах огноо (төлснөөс хойш 14 хоног) */
  expiresAt?: string | null;
  expired?: boolean;
  /** Цомгийн брэнд давхаргууд (лого/текст) — татсан зурагт шингээнэ */
  brand?: string;
  /** Сервер дээрх таталтын тоо. 0-ээс их бол энэ төхөөрөмж дээр татсан гэж үзнэ. */
  downloadCount?: number;
  /** Худалдан авагчийн хадгалсан засвар (тайралт, гэрэл/өнгө) */
  adjust?: PhotoAdjust & PrintCrop;
  /** Засах боломжтой эсэх (цомгийн тохиргоо, угаалгах төлөв/хугацаа) */
  canEdit?: boolean;
}

/** Үлдсэн хугацааг «5 хоног 3 цаг» хэлбэрээр */
function timeLeft(iso: string, t: (s: string, v?: Record<string, string | number>) => string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t('0 цаг');
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? t('{d} хоног {h} цаг', { d, h }) : t('{h} цаг', { h: Math.max(1, h) });
}

interface PhotographerContact {
  name: string;
  contact_info: Record<string, string>;
}

export default function ReceiptPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { t, locale } = useI18n();

  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [purchases, setPurchases]     = useState<PurchaseRow[]>([]);
  const [signedUrls, setSignedUrls]   = useState<SignedUrlItem[]>([]);
  const [photographers, setPhotographers] = useState<Record<string, PhotographerContact>>({});
  const [albumShareLink, setAlbumShareLink] = useState('');
  // Зурагчны профайлд холбоо барих мэдээлэл байхгүй үед цомгийн (зохион байгуулагчийн) мэдээллийг харуулна.
  const [albumContact, setAlbumContact] = useState<PhotographerContact | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloaded, setDownloaded] = useState<Set<string>>(() => new Set(invoiceId ? readDownloadedIds(invoiceId) : []));
  // Цомог хаагдах огноо — зургаа түүнээс өмнө татаж авахыг сануулна
  const [albumExpiresAt, setAlbumExpiresAt] = useState<string | null>(null);
  // Зургийг томоор харуулж «удаан дарж хадгалах» заавар өгөх цонх
  const [viewer, setViewer] = useState<{ url: string; name: string; hint: 'manual' | 'downloaded' | 'shared' } | null>(null);

  useEffect(() => { if (invoiceId) load(invoiceId); }, [invoiceId]);

  async function load(id: string) {
    setLoading(true);
    setError('');
    try {
      // purchases + photo_uploads (original_url нэмэгдсэн)
      // Нэхэмжлэхийн дугаараар зөвхөн энэ захиалгын мөрүүдийг авна (бусдын захиалга харагдахгүй)
      // Эхний оролдлого амжилтгүй (сүлжээ/session гацалт) бол нэг удаа дахин оролдоно
      let res = await withTimeout(publicDb.rpc('receipt_purchases', { p_invoice_id: id })).catch(() => null);
      if (!res || res.error) res = await withTimeout(publicDb.rpc('receipt_purchases', { p_invoice_id: id }));
      const { data, error: dbErr } = res;

      if (dbErr) throw new Error(dbErr.message);
      if (!data || data.length === 0) throw new Error(t('Захиалга олдсонгүй'));

      const rows: PurchaseRow[] = (data as any[]).map(r => ({
        ...r,
        download_count: Number(r.download_count ?? 0),
        photo_uploads: { preview_url: r.preview_url ?? '', original_url: r.original_url ?? '', filename: r.filename ?? '' },
      }));
      setPurchases(rows);
      const counted = idsWithServerDownloads(rows.map(r => ({ id: r.id, downloadCount: r.download_count })));
      if (counted.length) setDownloaded(new Set(writeDownloadedIds(id, counted)));

      // Album share link
      if (rows[0]?.album_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let albumData: any = null;
        const withExp = await withTimeout(publicDb.from('albums').select('share_link, name, title, contact_info, expires_at')
          .eq('id', rows[0].album_id).maybeSingle()).catch(() => ({ data: null, error: { message: 'timeout' } }));
        if (withExp.error) {
          ({ data: albumData } = await withTimeout(publicDb.from('albums').select('share_link, name, title, contact_info')
            .eq('id', rows[0].album_id).maybeSingle()).catch(() => ({ data: null })));
        } else {
          albumData = withExp.data;
          setAlbumExpiresAt(albumData?.expires_at ?? null);
        }
        setAlbumShareLink(albumData?.share_link ?? '');
        const ac = (albumData as any)?.contact_info;
        if (ac && typeof ac === 'object' && Object.values(ac).some(v => !!v)) {
          setAlbumContact({ name: (albumData as any)?.title || (albumData as any)?.name || t('Зохион байгуулагч'), contact_info: ac });
        }

        // Төлөгдсөн захиалгыг энэ төхөөрөмжийн «Миний худалдан авалт» түүхэнд нэмнэ.
        const paid = rows.filter(r => r.payment_status === 'paid');
        if (paid.length > 0) {
          addPurchaseHistory({
            invoiceId: id,
            albumId: rows[0].album_id,
            albumName: albumData?.title || albumData?.name || '',
            albumLink: (albumData?.share_link ?? '').replace(/^\/album\//, ''),
            total: paid.reduce((s, r) => s + Number(r.gross_amount || 0), 0),
            downloads: paid.filter(r => r.type === 'download').length,
            prints: paid.filter(r => r.type === 'print').length,
            buyerName: rows[0].buyer_name ?? '',
            paidAt: rows[0].created_at,
          });
        }
      }

      // Photographer contacts for print orders
      const printPhotographerIds = [...new Set(
        rows.filter(r => r.type === 'print').map(r => r.photographer_id),
      )];
      if (printPhotographerIds.length > 0) {
        const map: Record<string, PhotographerContact> = {};
        // 1) Зурагчны профайлын утас / Facebook / Instagram
        const { data: cData } = await withTimeout(publicDb.rpc('receipt_print_contacts', { p_invoice_id: id })).catch(() => ({ data: null }));
        for (const c of (cData ?? []) as { photographer_id: string; display_name: string; phone: string; facebook: string; instagram: string }[]) {
          map[c.photographer_id] = {
            name: c.display_name,
            contact_info: { phone: c.phone, facebook: c.facebook, instagram: c.instagram },
          };
        }
        // 2) Профайл хоосон бол хэрэглэгчийн хуучин contact_info
        const missing = printPhotographerIds.filter(pid =>
          !map[pid] || !Object.values(map[pid].contact_info).some(v => !!v));
        if (missing.length > 0) {
          const { data: pData } = await withTimeout(publicDb
            .from('users').select('id, name, contact_info')
            .in('id', missing)).catch(() => ({ data: null as { id: string; name: string; contact_info: Record<string, string> }[] | null }));
          for (const p of pData ?? []) {
            const ci = p.contact_info ?? {};
            if (Object.values(ci).some(v => !!v) || !map[p.id]) {
              map[p.id] = { name: map[p.id]?.name || p.name, contact_info: ci };
            }
          }
        }
        setPhotographers(map);
      }

      // Татах холбоосууд — хуудсыг хүлээлгэхгүй, араас нь ачаална (2 удаа оролдоно)
      // Угаалгах захиалгын засварын эрх/засвар ч эндээс ирдэг тул төлөгдсөн мөр байвал ачаална
      const hasPaid = rows.some(r => r.payment_status === 'paid');
      if (hasPaid) loadSignedUrls(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load receipt');
    } finally {
      setLoading(false);
    }
  }

  async function loadSignedUrls(id: string, attempt = 1): Promise<void> {
    try {
      // Сагсанд (төлөхөөс өмнө) хийсэн засварууд үлдсэн бол эхлээд хадгална
      if (attempt === 1) await flushPendingEdits(id).catch(() => ({}));
      const res = await withTimeout(fetch(`${QPAY_FN_URL}/signed-urls`, {
        method: 'POST', headers: fnHeaders, body: JSON.stringify({ invoiceId: id }),
      }), 15000);
      if (!res.ok) throw new Error(String(res.status));
      const { signedUrls: urls } = await res.json();
      const list = (urls ?? []) as SignedUrlItem[];
      setSignedUrls(list);
      const counted = idsWithServerDownloads(list.map(u => ({ id: u.purchaseId, downloadCount: u.downloadCount })));
      if (counted.length) setDownloaded(new Set(writeDownloadedIds(id, counted)));
    } catch {
      if (attempt < 3) setTimeout(() => loadSignedUrls(id, attempt + 1), 1500 * attempt);
    }
  }

  // ── Олноор нь татах ─────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string> | null>(null); // null = анхдагч (бүгд)
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [ready, setReady] = useState<{ id: string; file: File }[][]>([]); // iPhone: хадгалахад бэлэн багцууд
  const [bulkMsg, setBulkMsg] = useState('');

  // ── Худалдан авагчийн засвар ─────────────────────────────────────────
  const [editing, setEditing] = useState<PurchaseRow | null>(null);
  async function saveBuyerAdjust(purchaseId: string, adjust: PhotoAdjust & PrintCrop) {
    const res = await fetch(`${QPAY_FN_URL}/buyer-adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ invoiceId, purchaseId, adjust }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('Хадгалж чадсангүй'));
    setSignedUrls(list => list.map(u => (u.purchaseId === purchaseId ? { ...u, adjust: data.adjust ?? adjust } : u)));
  }
  /** Татах файлд: засвар (байвал) → цомгийн лого */
  function transformFor(u: SignedUrlItem, filename: string, original = false) {
    const adj = original ? null : u.adjust;
    if (!hasEdit(adj) && !u.brand) return undefined;
    return async (b: Blob) => {
      let out = hasEdit(adj) ? await preparePrintBlob(b, 'original', adj!) : b;
      if (u.brand) out = await applyBrandToPurchase(out, u.brand, filename);
      return out;
    };
  }

  async function fetchFile(p: PurchaseRow): Promise<File | null> {
    const u = signedUrls.find(x => x.purchaseId === p.id);
    if (!u?.signedUrl) return null;
    const raw = u.filename || p.photo_uploads?.filename || `zuragchin_${p.id.slice(0, 8)}`;
    const name = /\.(jpe?g|png|webp)$/i.test(raw) ? raw : `${raw}.jpg`;
    const res = await fetch(u.signedUrl);
    if (!res.ok) throw new Error('fetch');
    let blob = await res.blob();
    const tf = transformFor(u, raw);
    if (tf) blob = await tf(blob);
    return new File([blob], name, { type: blob.type || 'image/jpeg' });
  }

  function noteDownloaded(ids: string[]) {
    if (!invoiceId || !ids.length) return;
    const next = new Set(writeDownloadedIds(invoiceId, ids));
    setDownloaded(next);
    setSelected(prev => (prev ? new Set(withoutDownloaded(prev, ids)) : prev));
  }

  async function bulkDownload(list: PurchaseRow[]) {
    if (!list.length) return;
    setBulkMsg(''); setReady([]);
    setBulk({ done: 0, total: list.length });
    const saved: { id: string; file: File }[] = [];
    let failed = 0, i = 0;
    const worker = async () => {
      while (i < list.length) {
        const p = list[i++];
        try {
          const f = await fetchFile(p);
          if (f) saved.push({ id: p.id, file: f });
          else failed++;
        } catch { failed++; }
        setBulk(b => (b ? { ...b, done: b.done + 1 } : b));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBulk(null);
    if (!saved.length) {
      setBulkMsg(failed ? t('{n} зураг татагдсангүй — тус тусад нь дахин оролдоно уу.', { n: failed }) : '');
      return;
    }
    const savedHow = await saveFilesToGallery(saved.map(s => s.file));
    if (savedHow === 'cancelled') {
      setBulkMsg(t('Хадгалаагүй. Дахин дарна уу.'));
      return;
    }
    noteDownloaded(saved.map(s => s.id));
    const failNote = failed ? ' ' + t('{n} зураг татагдсангүй — тус тусад нь дахин оролдоно уу.', { n: failed }) : '';
    setBulkMsg((savedHow === 'shared'
      ? t('Нээгдсэн цонхноос «Save Images / Зураг хадгалах»-ыг сонгоно уу.')
      : t('{n} зураг татагдлаа. «Downloads / Татсан файлууд» хавтсаас харна уу.', { n: saved.length })) + failNote);
  }

  async function saveChunk(idx: number) {
    const chunk = ready[idx];
    if (!chunk) return;
    let saved = false;
    try {
      await navigator.share({ files: chunk.map(c => c.file) });
      saved = true;
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setBulkMsg(t('Хадгалж чадсангүй. Зураг тус бүрийн «Татах»-ыг дарна уу.'));
        return;
      }
    }
    if (saved) noteDownloaded(chunk.map(c => c.id));
    const rest = ready.filter((_, k) => k !== idx);
    setReady(rest);
    if (!rest.length) setBulkMsg(t('Нээгдсэн цонхноос «Save Images / Зураг хадгалах»-ыг сонгосон бол зургууд Photos-д орсон.'));
  }

  /** Зургийг утасны галерей / компьютерт хадгална */
  async function handleDownload(p: PurchaseRow, original = false, adjustOverride?: PhotoAdjust & PrintCrop) {
    const found    = signedUrls.find(u => u.purchaseId === p.id);
    const urlItem  = found && adjustOverride ? { ...found, adjust: adjustOverride } : found;
    const filename = urlItem?.filename || p.photo_uploads?.filename || `zuragchin_${p.id.slice(0, 8)}`;
    if (!urlItem?.signedUrl) return;
    setDownloading(prev => ({ ...prev, [p.id]: true }));
    try {
      const brand = urlItem.brand ?? '';
      const tf = transformFor(urlItem, filename, original);
      const { result, blobUrl } = await saveImageToDevice(urlItem.signedUrl, filename, tf);
      // Апп доторх хөтөч эсвэл Android дээр — зургийг томоор харуулж заавар өгнө
      if (result === 'downloaded' || result === 'shared') noteDownloaded([p.id]);
      if (result === 'manual' || result === 'downloaded') {
        // Апп доторх хөтөчид blob холбоосыг удаан дарж хадгалах боломжгүй тул жинхэнэ холбоос
        // (логотой бол data URL) харуулна
        let manualUrl = urlItem.signedUrl;
        if (result === 'manual' && (brand || tf) && blobUrl) manualUrl = await blobUrlToDataUrl(blobUrl).catch(() => urlItem.signedUrl);
        setViewer({ url: result === 'manual' ? manualUrl : (blobUrl || urlItem.signedUrl), name: filename, hint: result });
      }
    } catch {
      setViewer({ url: urlItem.signedUrl, name: filename, hint: 'manual' });
    } finally {
      setDownloading(prev => ({ ...prev, [p.id]: false }));
    }
  }

  const isPaid      = purchases.every(p => p.payment_status === 'paid');
  const buyerName   = purchases[0]?.buyer_name ?? '';
  const orderDate   = purchases[0]?.created_at
    ? new Date(purchases[0].created_at).toLocaleDateString(locale, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '';
  const totalPaid   = purchases.reduce((s, p) => s + Number(p.gross_amount), 0);
  const downloadPurchases = purchases.filter(p => p.type === 'download');
  const printPurchases    = purchases.filter(p => p.type === 'print');
  const downloadable = downloadPurchases.filter(p => isPaid && !!signedUrls.find(u => u.purchaseId === p.id)?.signedUrl);
  const pendingIds = withoutDownloaded(downloadable.map(p => p.id), downloaded);
  const sel = selected ?? new Set(pendingIds);
  const allGot = everyDownloaded(downloadable.map(p => p.id), downloaded);
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSelected(n); };
  const allOn = downloadable.length > 0 && downloadable.every(p => sel.has(p.id));
  const chosen = downloadable.filter(p => sel.has(p.id));
  // Татах эцсийн хугацаа: худалдан авалтын хугацаа (14 хоног), байхгүй бол цомгийн хугацаа
  const dlDeadlines = signedUrls.filter(u => u.type === 'download' && u.expiresAt && !u.expired).map(u => u.expiresAt as string).sort();
  const downloadDeadline = dlDeadlines[0] ?? null;
  const allDlExpired = signedUrls.some(u => u.type === 'download') && signedUrls.filter(u => u.type === 'download').every(u => u.expired);

  const contactIcons: Record<string, React.ReactNode> = {
    phone:     <Phone className="w-4 h-4" />,
    email:     <Mail className="w-4 h-4" />,
    facebook:  <Facebook className="w-4 h-4" />,
    instagram: <Instagram className="w-4 h-4" />,
  };

  if (loading) return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-red-400" />
        </div>
        <p className="text-white font-semibold text-lg mb-2">{t('Баримт олдсонгүй')}</p>
        <p className="text-stone-400 text-sm mb-5">{error}</p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => invoiceId && load(invoiceId)}
            className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
            {t('Дахин оролдох')}
          </button>
          <button onClick={() => navigate(-1)}
            className="bg-white/10 hover:bg-white/15 text-white px-5 py-2.5 rounded-xl transition-colors text-sm">
            {t('Буцах')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-stone-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                // Сайт дотроос (жишээ нь хяналтын самбараас) орсон бол өмнөх хуудас руу, шууд холбоосоор орсон бол цомог руу
                const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
                if (idx > 0) navigate(-1);
                else if (albumShareLink) navigate(`/album/${albumShareLink.replace(/^\/album\//, '')}`);
                else navigate('/');
              }}
              title="Буцах"
              className="text-stone-400 hover:text-white transition-colors">
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
          <LanguageSwitcher />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        {/* Status banner */}
        <div className={`rounded-2xl p-6 flex items-start gap-4 ${isPaid
          ? 'bg-green-500/10 border border-green-500/20'
          : 'bg-amber-500/10 border border-amber-500/20'}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
            isPaid ? 'bg-green-500/15' : 'bg-amber-500/15'}`}>
            {isPaid
              ? <CheckCircle2 className="w-6 h-6 text-green-400" />
              : <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />}
          </div>
          <div>
            <p className={`font-semibold text-lg ${isPaid ? 'text-green-400' : 'text-amber-400'}`}>
              {isPaid ? t('Төлбөр амжилттай хийгдлээ!') : t('Төлбөр хүлээгдэж байна')}
            </p>
            <p className="text-stone-400 text-sm mt-0.5">
              {isPaid
                ? t('Баярлалаа, {name}! Усан тэмдэггүй зургуудаа доороос татаарай.', { name: buyerName })
                : t('Төлбөр баталгаажсаны дараа баримт харагдана.')}
            </p>
          </div>
        </div>

        {/* Order meta */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-stone-400 text-sm">
            <Hash className="w-4 h-4 text-amber-400" />
            <span className="text-stone-500">{t('Нэхэмжлэл:')}</span>
            <span className="text-white font-mono text-xs break-all">{invoiceId}</span>
          </div>
          {orderDate && (
            <div className="flex items-center gap-2 text-sm text-stone-400">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>{orderDate}</span>
            </div>
          )}
          <div className="border-t border-white/10 pt-3 flex justify-between text-sm">
            <span className="text-stone-400">{t('Нийт төлсөн дүн')}</span>
            <span className="text-amber-400 font-bold text-base">₮{totalPaid.toLocaleString()}</span>
          </div>
        </div>


        {isPaid && downloadPurchases.length > 0 && downloadDeadline && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-2xl p-4 flex gap-3">
            <Clock className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-200 text-sm font-semibold">
                {t('{left}-ийн дараа зураг устгагдана', { left: timeLeft(downloadDeadline, t) })}
              </p>
              <p className="text-red-200/80 text-xs mt-1 leading-relaxed">
                {t('Одоо «Татах» дарж утас эсвэл компьютертоо хадгалаарай. {date}-с хойш файлыг дахин авах боломжгүй.', { date: fmtDay(downloadDeadline) })}
              </p>
              <p className="text-red-200/60 text-xs mt-1 leading-relaxed">
                {t('Хувийн хэрэглээнд зориулсан. Дахин худалдахыг хориглоно — файлд таны захиалгын дугаар суугдсан.')}
              </p>
            </div>
          </div>
        )}

        {isPaid && allDlExpired && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-stone-400 text-sm">
            {t('Татах хугацаа дууссан тул файлууд устгагдсан.')}
          </div>
        )}

        {isPaid && downloadPurchases.length > 0 && !downloadDeadline && !allDlExpired && albumExpiresAt && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex gap-3">
            <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-200 text-sm font-semibold">
                {t('Зургаа {date}-с өмнө утсандаа хадгалаарай', { date: fmtDay(albumExpiresAt) })}
              </p>
              <p className="text-amber-200/70 text-xs mt-1 leading-relaxed">
                {t('Цомгийн хугацаа дуусахад зургууд сайтаас устах тул «Татах» дарж утас эсвэл компьютертоо хадгалж аваарай.')}
              </p>
            </div>
          </div>
        )}

        {/* Download section */}
        {downloadPurchases.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
              <Download className="w-4 h-4 text-amber-400" />
              <h3 className="text-white font-semibold">{t('Татан авах зурагнууд')}</h3>
              <span className="ml-auto text-stone-500 text-xs">{t('{n} зураг', { n: downloadPurchases.length })}</span>
            </div>

            {isPaid && (
              <div className="px-5 py-3 bg-green-500/5 border-b border-green-500/10 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <p className="text-green-400 text-xs">
                  {t('Усан тэмдэггүй өндөр нарийвчлалтай зургуудыг татаж авах боломжтой болсон!')}
                </p>
              </div>
            )}

            {downloadable.length > 1 && !inAppBrowserName() && (
              <div className="px-5 py-4 border-b border-white/10 space-y-3 bg-amber-500/5">
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setSelected(allOn ? new Set() : new Set(downloadable.map(p => p.id)))}
                    className="flex items-center gap-2 text-sm text-stone-200">
                    {allOn ? <CheckSquare className="w-5 h-5 text-amber-400" /> : <Square className="w-5 h-5 text-stone-500" />}
                    {allOn ? t('Бүгдийг болиулах') : t('Бүгдийг сонгох')}
                  </button>
                  <span className="text-stone-400 text-xs">{t('{n} сонгосон', { n: chosen.length })}</span>
                </div>
                {ready.length === 0 && (
                  <button onClick={() => bulkDownload(allGot ? downloadable : chosen)} disabled={!!bulk || (!allGot && chosen.length === 0)}
                    className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl disabled:opacity-60 ${
                      allGot
                        ? 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                        : 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                    }`}>
                    {bulk ? <Loader2 className="w-5 h-5 animate-spin" /> : allGot ? <CheckCircle2 className="w-5 h-5" /> : <Images className="w-5 h-5" />}
                    {bulk
                      ? t('Бэлдэж байна… {d}/{n}', { d: bulk.done, n: bulk.total })
                      : allGot
                        ? t('Бүгдийг татсан ✓')
                        : t('Сонгосон {n} зургийг татах', { n: chosen.length })}
                  </button>
                )}
                {ready.map((chunk, k) => (
                  <button key={k} onClick={() => saveChunk(k)}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold py-3.5 rounded-xl">
                    <Download className="w-5 h-5" />
                    {ready.length > 1
                      ? t('Галерейд хадгалах — {n} зураг (багц {k})', { n: chunk.length, k: k + 1 })
                      : t('Галерейд хадгалах — {n} зураг', { n: chunk.length })}
                  </button>
                ))}
                {ready.length > 0 && (
                  <p className="text-stone-400 text-xs text-center">{t('Товч дараад нээгдсэн цонхноос «Save Images / Зураг хадгалах»-ыг сонгоно.')}</p>
                )}
                {bulkMsg && <p className="text-emerald-300 text-xs text-center">{bulkMsg}</p>}
              </div>
            )}

            <div className="divide-y divide-white/5">
              {downloadPurchases.map(p => {
                const urlItem     = signedUrls.find(u => u.purchaseId === p.id);
                const canDownload = isPaid && !!urlItem?.signedUrl;
                const isLoading   = downloading[p.id];
                const got         = downloaded.has(p.id);

                return (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                    {downloadable.length > 1 && canDownload && !inAppBrowserName() && (
                      <button onClick={() => toggle(p.id)} aria-label="Сонгох" className="-mr-2 flex-shrink-0">
                        {sel.has(p.id) ? <CheckSquare className="w-5 h-5 text-amber-400" /> : <Square className="w-5 h-5 text-stone-500" />}
                      </button>
                    )}
                    {/* Preview thumbnail (усан тэмдэгтэй) */}
                    <div className="relative flex-shrink-0">
                      {p.photo_uploads?.preview_url && (
                        <img
                          src={p.photo_uploads.preview_url}
                          alt={p.photo_uploads.filename}
                          className="w-14 h-14 object-cover rounded-lg"
                        />
                      )}
                      {isPaid && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                          <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{p.photo_uploads?.filename ?? 'Photo'}</p>
                      <p className="text-stone-500 text-xs">₮{Number(p.gross_amount).toLocaleString()}</p>
                      {isPaid && (
                        <p className="text-green-400 text-xs mt-0.5">{t('✓ Усан тэмдэггүй')}</p>
                      )}
                      {canDownload && (urlItem?.canEdit || hasEdit(urlItem?.adjust)) && (
                        <p className="flex items-center gap-2 mt-1 text-xs">
                          {urlItem?.canEdit && (
                            <button onClick={() => setEditing(p)} className="text-amber-300 hover:text-amber-200 font-semibold">✂ {t('Засах')}</button>
                          )}
                          {hasEdit(urlItem?.adjust) && (
                            <>
                              <span className="text-sky-300">{t('Засварласан')}</span>
                              <button onClick={() => handleDownload(p, true)} className="text-stone-400 hover:text-white underline">{t('Эх зургийг татах')}</button>
                            </>
                          )}
                        </p>
                      )}
                    </div>

                    {canDownload ? (
                      <button
                        onClick={() => handleDownload(p)}
                        disabled={isLoading}
                        className={`flex items-center gap-1.5 text-xs font-semibold disabled:opacity-60 px-3 py-2 rounded-lg transition-colors flex-shrink-0 ${
                          got
                            ? 'text-emerald-300 border border-emerald-400/60 bg-emerald-500/10 hover:bg-emerald-500/20'
                            : 'text-stone-950 bg-amber-500 hover:bg-amber-400'
                        }`}
                      >
                        {isLoading
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : got ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                        {isLoading ? t('Татаж байна…') : got ? t('Татсан ✓') : t('Татах')}
                      </button>
                    ) : (
                      <span className="text-xs text-stone-500 flex-shrink-0">
                        {urlItem?.expired ? t('Хугацаа дууссан') : isPaid ? t('Бэлдэж байна…') : t('Хүлээгдэж байна')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3 bg-stone-950/30 border-t border-white/5">
              <p className="text-stone-500 text-xs">
                {isPaid
                  ? t('Татсан зургууд усан тэмдэггүй бөгөөд өндөр нарийвчлалтай байна.')
                  : t('Төлбөр баталгаажсаны дараа татах боломжтой болно.')}
              </p>
            </div>
          </div>
        )}

        {/* Print section */}
        {printPurchases.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
              <Printer className="w-4 h-4 text-amber-400" />
              <h3 className="text-white font-semibold">{t('Хэвлэх захиалга')}</h3>
              <span className="ml-auto text-stone-500 text-xs">{t('{n} бараа', { n: printPurchases.length })}</span>
            </div>
            <div className="divide-y divide-white/5">
              {printPurchases.map(p => {
                const own = photographers[p.photographer_id];
                const ownHasContact = !!own && Object.values(own.contact_info ?? {}).some(v => !!v);
                const pg = ownHasContact ? own : (albumContact ?? own);
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
                        {(() => {
                          const u = signedUrls.find(x => x.purchaseId === p.id);
                          if (!u || (!u.canEdit && !hasEdit(u.adjust))) return null;
                          return (
                            <p className="flex items-center gap-2 mt-1 text-xs">
                              {u.canEdit && <button onClick={() => setEditing(p)} className="text-amber-300 hover:text-amber-200 font-semibold">✂ {t('Хэвлэх хэлбэрийг засах')}</button>}
                              {hasEdit(u.adjust) && <span className="text-sky-300">{t('Засварласан')}</span>}
                            </p>
                          );
                        })()}
                      </div>
                      {p.payment_status === 'paid' && (
                        <span className={`text-xs font-medium px-2 py-1 rounded-lg flex-shrink-0 ${
                          p.print_status === 'delivered' ? 'bg-emerald-500/15 text-emerald-400'
                          : p.print_status === 'printed' ? 'bg-sky-500/15 text-sky-400'
                          : 'bg-amber-500/15 text-amber-400'}`}>
                          {p.print_status === 'delivered' ? t('Хүлээлгэж өгсөн') : p.print_status === 'printed' ? t('Угаасан — авахад бэлэн') : t('Угаалгаж байна')}
                        </span>
                      )}
                    </div>
                    {pg && (
                      <div className="bg-stone-950/40 rounded-xl p-3 space-y-1.5">
                        <p className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-2">
                          {t('Зурагчинтай холбоо барих')}
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
              <p className="text-stone-500 text-xs">
                {t('Угаасан зургаа авахдаа дээрх хүнтэй холбогдож, энэ баримтыг (захиалгын дугаартай нь) үзүүлнэ үү.')}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={() => navigate('/my-purchases')}
          className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-3 rounded-xl transition-colors text-sm">
          <Hash className="w-4 h-4" />
          {t('Миний бүх худалдан авалт')}
        </button>

        {/* Back to album */}
        {albumShareLink && (
          <button
            onClick={() => navigate(`/album/${albumShareLink.replace(/^\/album\//, '')}`)}
            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-3 rounded-xl transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            {t('Цомог руу буцах')}
          </button>
        )}
      </main>
      {viewer && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-white text-sm font-medium truncate pr-4">{viewer.name}</p>
            <button onClick={() => setViewer(null)} className="text-white/80 hover:text-white p-2"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center px-2">
            <img src={viewer.url} alt={viewer.name} className="max-w-full max-h-full object-contain select-auto" style={{ WebkitTouchCallout: 'default' }} />
          </div>
          <div className="p-4 space-y-2 bg-stone-950/80">
            {viewer.hint === 'downloaded' ? (
              <p className="text-emerald-300 text-sm text-center">
                {t('Зураг татагдлаа. Утасны «Галерей» → «Downloads» хавтсаас харна уу.')}
              </p>
            ) : (
              <p className="text-amber-200 text-sm text-center font-medium">
                {isIOS
                  ? t('Зурган дээр удаан дараад «Зургийг хадгалах / Save to Photos»-ыг сонгоно уу.')
                  : t('Зурган дээр удаан дараад «Зураг татах / Download image»-ыг сонгоно уу.')}
              </p>
            )}
            {inAppBrowserName() && (
              <p className="text-stone-400 text-xs text-center">
                {t('Хадгалагдахгүй бол дээд талын ••• → «Chrome / Safari-д нээх»-ээр нээгээд дахин «Татах» дарна уу.')}
              </p>
            )}
            {typeof navigator !== 'undefined' && 'share' in navigator && !inAppBrowserName() && (
              <button onClick={async () => {
                try {
                  const blob = await (await fetch(viewer.url)).blob();
                  await navigator.share({ files: [new File([blob], viewer.name.endsWith('.jpg') ? viewer.name : viewer.name + '.jpg', { type: blob.type || 'image/jpeg' })] });
                } catch { /* цуцалсан */ }
              }}
                className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white text-sm py-2.5 rounded-xl">
                <Share2 className="w-4 h-4" /> {t('Хуваалцах / Галерейд хадгалах')}
              </button>
            )}
          </div>
        </div>
      )}

      {editing && (() => {
        const u = signedUrls.find(x => x.purchaseId === editing.id);
        const isPrintRow = editing.type === 'print';
        return (
          <PrintEditor
            purchaseId={editing.id}
            title={editing.photo_uploads?.filename}
            heading={isPrintRow ? t('Хэвлэх хэлбэрийг засах') : t('Зургаа засах')}
            brand={u?.brand}
            note={isPrintRow
              ? t('Зурагчин угаахдаа энэ засварыг ашиглана. Урьдчилан харахад усан тэмдэг харагдах ч хэвлэгдэхгүй.')
              : t('Татахад засварласан хувилбар гарна. Урьдчилан харахад усан тэмдэг харагдах ч татсан зурагт байхгүй.')}
            source={{
              load: async () => ({
                url: editing.photo_uploads?.preview_url ?? '',
                size: isPrintRow ? editing.print_size : 'original',
                adjust: u?.adjust ?? {},
              }),
              save: a => saveBuyerAdjust(editing.id, a),
            }}
            actionLabel={isPrintRow ? undefined : t('Хадгалаад татах')}
            onPrint={isPrintRow ? undefined : (a => {
              const row = editing;
              setSignedUrls(list => list.map(x => (x.purchaseId === row.id ? { ...x, adjust: a } : x)));
              setEditing(null);
              void handleDownload(row, false, a);
            })}
            onClose={() => setEditing(null)}
          />
        );
      })()}
    </div>
  );
}

function fmtDay(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
