import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Images, Loader2, MessageCircle, QrCode, ScanLine, Search, Send, X } from 'lucide-react';
import type { AlbumData, PhotoData } from '../pages/PublicAlbumPage';
import { isAndroid, saveFilesToGallery, socialInAppName } from '../lib/browserEnv';
import { supabase } from '../lib/supabase';
import BankLinks, { type BankLink } from './BankLinks';
import {
  askHelpBot, downloadExpired, dropGuideCartPhoto, fetchLeadPurchases, groupOwned, guidePaySummary, loadGuide, markGuidePaid, mergeOwned, normalizeMnPhone, prepareGuideEntry, rememberPurchase, ruleReply, saveGuide, setAlbumGuideActive, syncGuideLead,
  type GuideCartLine, type GuideChoice, type GuideInvoice, type GuideMsg, type GuideSession, type GuideStep, type OwnedPhoto,
} from '../lib/albumGuide';
import { cachedUndownloaded, everyDownloaded, idsWithServerDownloads, readDownloadedIds, undownloadedByInvoice, writeDownloadedIds } from '../lib/receiptDownloads';
import { formatPrintDay, printOrdersOpen } from '../lib/printDeadline';
import PrintEditor from './PrintEditor';
import BrandMark from './BrandMark';
import EditedThumb from './EditedThumb';
const QrScanModal = lazy(() => import('./QrScanModal'));
import { readLater, writeLater } from '../lib/savedLater';
import { photoNumberMap, parsePhotoNumber } from '../lib/photoNumbers';
import { listVisitedAlbums } from '../lib/visitedAlbums';
import { applyBaseEdit, hasEdit, preparePrintBlob, type PhotoAdjust, type PrintCrop } from '../lib/photoAdjust';
import { applyBrandToPurchase } from '../lib/watermark';
import { flushPendingEdits, savePendingEdits } from '../lib/pendingEdits';
import { addPurchaseHistory, listPurchaseHistory, loadCart } from '../lib/purchaseHistory';

const PRINT_LABEL: Record<string, string> = {
  '10x15': '10×15 см', '13x18': '13×18 см', '15x21': '15×21 см',
  '20x30': '20×30 см', '30x40': '30×40 см', 'A4': 'A4', '21x30': '21×30 см',
};

function dlPrice(photo: PhotoData, album: AlbumData, aiPrice: number): number {
  if (photo.source === 'ai_booth') return aiPrice;
  if (album.is_free) return 0;
  if (photo.download_price !== null && photo.download_price !== undefined) return Number(photo.download_price);
  return Number(album.download_price ?? 0);
}

function printOptions(photo: PhotoData): [string, number][] {
  return Object.entries(photo.print_prices || {}).filter(([, p]) => Number(p) > 0) as [string, number][];
}

function money(n: number) {
  return `₮${Math.round(n).toLocaleString('mn-MN')}`;
}

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const QPAY_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

function closeLightbox(setViewerId: (id: string | null) => void) {
  const state = history.state as { albumGuideLightbox?: boolean } | null;
  if (state?.albumGuideLightbox) history.back();
  else setViewerId(null);
}

export default function AlbumPurchaseGuide({
  album, photos, folders, aiPrice, paidInvoice, onInvoiceCreated, onPaid, onClose, onDropCartPhoto,
}: {
  album: AlbumData;
  photos: PhotoData[];
  folders: { id: string; name: string }[];
  aiPrice: number;
  paidInvoice: string | null;
  onInvoiceCreated?: (invoiceId: string) => void;
  onPaid: (invoiceId: string) => void;
  onClose: () => void;
  /** «Энгийн харагдац»-ын сагснаас зургийг хасах (хөтөчөөс «Хасах» дарахад) */
  onDropCartPhoto?: (photoId: string) => void;
}) {
  const [session, setSession] = useState<GuideSession>(() => prepareGuideEntry(loadGuide(album.id), album.name));
  const [draft, setDraft] = useState('');
  const [name, setName] = useState(() => loadGuide(album.id).name);
  const [phone, setPhone] = useState(() => loadGuide(album.id).phone);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  // Олон зураг татах явц — утас гацаагүйг харуулна
  const [dlProg, setDlProg] = useState<{ done: number; total: number; saving?: boolean } | null>(null);
  const [dlNote, setDlNote] = useState('');
  const [dlGot, setDlGot] = useState<Set<string>>(() => new Set(paidInvoice ? readDownloadedIds(paidInvoice) : []));
  const [licenseOk, setLicenseOk] = useState(false);
  const [pastId, setPastId] = useState<string | null>(null);
  const [pastNote, setPastNote] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState('');
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onPaidRef = useRef(onPaid);
  const onInvoiceRef = useRef(onInvoiceCreated);
  onPaidRef.current = onPaid;
  onInvoiceRef.current = onInvoiceCreated;
  type PaidFile = { purchaseId: string; photoId?: string; signedUrl: string; filename: string; expired?: boolean; expiresAt?: string | null; downloadCount?: number; brand?: string; adjust?: PhotoAdjust & PrintCrop; baseAdjust?: PhotoAdjust & PrintCrop };
  const [dlFiles, setDlFiles] = useState<PaidFile[]>([]);
  const [dlSel, setDlSel] = useState<Set<string> | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  // Төлөхөөс өмнөх засвар: аль зургийн аль төрлийг засаж байгаа
  const [editTarget, setEditTarget] = useState<{ photoId: string; kind: 'dl' | 'pr' } | null>(null);
  const [editToast, setEditToast] = useState(false);
  const [later, setLater] = useState<string[]>(() => readLater(album.id));
  const [allowEdit, setAllowEdit] = useState(true);
  // Төлсөн ч татаж амжаагүй зургууд — «Татах» хэсэгт буцааж хүргэх сануулга
  const [undl, setUndl] = useState<{ invoice: string; count: number }[]>([]);
  const DEBUG = typeof window !== 'undefined' && /[?&]dbg=1/.test(window.location.search);
  const [dbg, setDbg] = useState('');
  useEffect(() => {
    if (session.step === 'done' || session.step === 'pay') return;
    // Төлсөн нэхэмжлэхүүдийг бүх эх сурвалжаас: хөтчийн төлөв, эзэмшсэн зургууд, энэ цомгийн худалдан авалтын түүх
    const invoices = [...new Set([
      ...(session.paidInvoices ?? []),
      ...(session.owned ?? []).filter(o => o.type === 'download').map(o => o.invoiceId),
      ...listPurchaseHistory().filter(h => h.albumId === album.id).map(h => h.invoiceId),
      ...(paidInvoice ? [paidInvoice] : []),
    ].filter(Boolean))].slice(-8);
    if (DEBUG) setDbg(`step=${session.step} paid=${(session.paidInvoices ?? []).length} owned=${(session.owned ?? []).length} hist=${listPurchaseHistory().filter(h => h.albumId === album.id).length} inv=${invoices.map(i => i.slice(0, 6)).join(',')}`);
    if (!invoices.length) { setUndl([]); return; }
    let cancel = false;
    // Кэшээс шууд харуулаад серверээс (нэг хурдан хүсэлтээр) шинэчилнэ; алдаа гарвал кэш хэвээр үлдэнэ
    setUndl(prev => (prev.length ? prev : cachedUndownloaded(invoices)));
    undownloadedByInvoice(invoices).then(r => {
      if (cancel) return;
      setUndl(r);
      if (DEBUG) setDbg(d => `${d} → ${r.map(x => `${x.invoice.slice(0, 6)}:${x.count}`).join(',') || '0'}`);
    }).catch(e => { if (DEBUG) setDbg(d => `${d} → ERR ${String(e)}`); });
    return () => { cancel = true; };
  }, [session.step, album.id, session.paidInvoices?.length, session.owned?.length, paidInvoice]); // eslint-disable-line react-hooks/exhaustive-deps
  const undlTotal = undl.reduce((n, u) => n + u.count, 0);
  // Нэг захиалга бол шууд баримт руу, олон бол «Төлсөн» жагсаалт руу
  const undlHref = undl.length === 1 ? `/receipt/${undl[0].invoice}` : '/my-purchases';
  useEffect(() => {
    supabase.from('albums').select('allow_buyer_edit').eq('id', album.id).maybeSingle()
      .then(({ data, error }) => { if (!error && data && (data as { allow_buyer_edit?: boolean }).allow_buyer_edit === false) setAllowEdit(false); });
  }, [album.id]);
  // Зургийн тор: 1 (том, доош гүйлгэнэ) / 2 / 3 багана — сонголт төхөөрөмж дээр хадгалагдана
  const [cols, setColsState] = useState<1 | 2 | 3>(() => {
    try { const v = Number(localStorage.getItem('zm_guide_cols')); return v === 1 || v === 3 ? v : 2; } catch { return 2; }
  });
  const setCols = (v: 1 | 2 | 3) => { setColsState(v); try { localStorage.setItem('zm_guide_cols', String(v)); } catch { /* */ } };
  const listRef = useRef<HTMLDivElement>(null);
  const choicesRef = useRef(session.choices);
  const viewerIdRef = useRef(viewerId);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  choicesRef.current = session.choices;
  viewerIdRef.current = viewerId;
  const paidOnce = useRef(false);
  const inApp = typeof navigator !== 'undefined' && !!socialInAppName(navigator.userAgent || '');

  const named = useMemo(() => folders.filter(f => photos.some(p => p.folder_id === f.id)), [folders, photos]);

  function commit(next: GuideSession, persist = true) {
    setSession(next);
    if (persist && next.step !== 'done') saveGuide(album.id, next);
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [session.messages, session.step, chatOpen]);

  useEffect(() => { setChatOpen(false); }, [session.step]);

  const viewerOpen = viewerId !== null;
  useEffect(() => {
    if (!viewerOpen) return;
    const marker = { ...(history.state || {}), albumGuideLightbox: true };
    if (!(history.state as { albumGuideLightbox?: boolean } | null)?.albumGuideLightbox) {
      history.pushState(marker, '');
    }
    const move = (dir: number) => {
      const choices = choicesRef.current;
      const i = choices.findIndex(c => c.photoId === viewerIdRef.current);
      if (i < 0 || choices.length < 2) return;
      setViewerId(choices[(i + dir + choices.length) % choices.length].photoId);
    };
    const onPop = (e: PopStateEvent) => {
      e.stopImmediatePropagation();
      setViewerId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox(setViewerId); }
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
    };
    window.addEventListener('popstate', onPop, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [viewerOpen]);

  useEffect(() => {
    if (!viewerId || session.choices.some(c => c.photoId === viewerId)) return;
    closeLightbox(setViewerId);
  }, [viewerId, session.choices]);

  useLayoutEffect(() => {
    setAlbumGuideActive(true);
    return () => setAlbumGuideActive(false);
  }, []);

  useEffect(() => {
    const id = session.step === 'pay' ? session.invoice?.invoiceId : undefined;
    if (!id) return;
    let stopped = false;
    let n = 0;
    const timer = setInterval(async () => {
      if (stopped) return;
      n += 1;
      if (n > 60) { clearInterval(timer); return; }
      try {
        const res = await fetch(`${QPAY_FN_URL}/check-payment/${id}`, {
          headers: { Authorization: `Bearer ${QPAY_ANON}`, apikey: QPAY_ANON },
        });
        const data = await res.json().catch(() => ({}));
        if (data.isPaid && !stopped) {
          stopped = true;
          clearInterval(timer);
          onPaidRef.current(id);
        }
      } catch { /* дараагийн шалгалт */ }
    }, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [session.step, session.invoice?.invoiceId]);

  useEffect(() => {
    if (session.step === 'done' || !session.phone) return;
    const t = setTimeout(() => { syncGuideLead(album.id, session); }, 700);
    return () => clearTimeout(t);
  }, [album.id, session]);

  useEffect(() => {
    if (!paidInvoice || paidOnce.current) return;
    paidOnce.current = true;
    const session = sessionRef.current;
    const n = session.choices.filter(c => c.download).length;
    const m = session.choices.filter(c => c.print).length;
    const messages: GuideMsg[] = [
      ...session.messages,
      { role: 'bot', text: `Таны татах зургууд: ${n}` },
      { role: 'bot', text: `Таны угаалгах зургууд: ${m}` },
      ...(n > 0 ? [{ role: 'bot' as const, text: `Таны татах зураг ${n} ширхэг байна. Татах уу?` }] : []),
    ];
    const bought = session.choices.flatMap(c => {
      const photo = photos.find(p => p.id === c.photoId);
      const filename = photo?.title || photo?.name || c.photoId;
      const rows: { photoId: string; type: 'download' | 'print'; filename: string }[] = [];
      if (c.download) rows.push({ photoId: c.photoId, type: 'download', filename });
      if (c.print) rows.push({ photoId: c.photoId, type: 'print', filename });
      return rows;
    });
    const slim = rememberPurchase(session, paidInvoice, bought);
    saveGuide(album.id, slim);
    const paidIds = new Set(bought.map(b => b.photoId));
    const unpaid = session.choices.filter(c => !paidIds.has(c.photoId)).map(c => c.photoId);
    setLater(writeLater(album.id, [...readLater(album.id).filter(id => !paidIds.has(id)), ...unpaid]));
    setSession(s => ({ ...s, step: 'done', messages, paidInvoices: slim.paidInvoices, owned: slim.owned }));
    markGuidePaid(album.id, session.token, paidInvoice);
    // «Төлсөн» түүхэнд шууд бичнэ — баримт нээгээгүй ч нүүр хуудас «Татаагүй N зураг»-ийг олно
    try {
      const total = session.choices.reduce((sum, c) => {
        const ph = photos.find(p => p.id === c.photoId);
        return sum + (c.download && ph ? dlPrice(ph, album, aiPrice) : 0);
      }, 0);
      addPurchaseHistory({
        invoiceId: paidInvoice, albumId: album.id, albumName: album.name,
        albumLink: window.location.pathname.replace(/^\/album\//, '').split('/')[0] || album.id,
        total, downloads: n, prints: m, buyerName: session.name, paidAt: new Date().toISOString(),
      });
    } catch { /* */ }
  }, [paidInvoice, album.id, photos]);

  useEffect(() => {
    if (!session.known || !session.token) return;
    let cancel = false;
    fetchLeadPurchases(album.id, session.token).then(rows => {
      if (cancel || !rows?.length) return;
      setSession(s => {
        const next = { ...s, owned: mergeOwned(s.owned ?? [], rows) };
        saveGuide(album.id, next);
        return next;
      });
    });
    return () => { cancel = true; };
  }, [album.id, session.known, session.token]);

  function go(step: GuideStep, extra: Partial<GuideSession> = {}, bot?: string) {
    const messages = bot ? [...session.messages, { role: 'bot' as const, text: bot }] : session.messages;
    commit({ ...session, ...extra, step, messages });
  }

  function welcome() {
    const nm = name.trim();
    const ph = normalizeMnPhone(phone);
    if (nm.length < 2) { setFormErr('Нэрээ оруулна уу'); return; }
    if (!ph) { setFormErr('8 оронтой утасны дугаар оруулна уу'); return; }
    setFormErr('');
    // Нүүрнээс «Таны сонгосон зураг» дарж ирсэн бол нэр оруулсны дараа шууд төлбөрийн жагсаалт руу
    if (session.choices.length > 0) {
      commit({ ...session, name: nm, phone: ph, step: 'choices', messages: [{ role: 'bot', text: `Сайн байна уу, ${nm}! ${SELECTED_MSG}` }] });
      return;
    }
    const greet = `Сайн байна уу, ${nm}! Та «${album.name}» цомогт нэвтэрлээ. Зураг үзэх үү?`;
    commit({ ...session, name: nm, phone: ph, step: 'greet', messages: [{ role: 'bot', text: greet }] });
  }

  // «Тийм» → сэдэв асуулгүй шууд бүх зураг (сэдвүүд зургийн дээд мөрөнд товчоор харагдана)
  const SELECTED_MSG = 'Таны сонгосон зургууд. Татах/угаалгах сонголтоо шалгаад QPay-ээр төлнө үү.';
  const BROWSE_ALL_MSG = 'Бүх зургийг харууллаа. Дээрх сэдвээр шүүж болно. Хүссэн зургаа тэмдэглээд «Сонгож дууслаа» дарна уу.';
  function acceptYes() {
    go('browse', { folderId: null }, BROWSE_ALL_MSG);
  }

  function openFolder(id: string | null, label: string) {
    go('browse', { folderId: id }, `«${label}» зургууд. Сонгоод үргэлжлүүлнэ үү.`);
  }

  async function onFreeText(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setDraft('');
    const ruled = ruleReply(q, named);
    const messages: GuideMsg[] = [...session.messages, { role: 'user', text: q }];
    if (ruled?.action === 'no') {
      commit({ ...session, messages: [...messages, { role: 'bot', text: ruled.reply }], declined: true });
      onClose();
      return;
    }
    if (ruled?.action === 'yes') {
      commit({ ...session, messages: [...messages, { role: 'bot', text: BROWSE_ALL_MSG }], step: 'browse', folderId: null });
      return;
    }
    if (ruled?.action === 'folder' && ruled.folderId) {
      commit({ ...session, messages: [...messages, { role: 'bot', text: ruled.reply }], step: 'browse', folderId: ruled.folderId });
      return;
    }
    setBusy(true);
    commit({ ...session, messages });
    const ai = await askHelpBot(q, window.location.pathname);
    const reply = ai || 'Та «Тийм» гэж дарвал зураг гарна. Зургийг тэмдэглээд «Сонгож дууслаа» дарна уу.';
    setSession(s => {
      const next = { ...s, messages: [...s.messages, { role: 'bot' as const, text: reply }] };
      saveGuide(album.id, next);
      return next;
    });
    setBusy(false);
  }

  function togglePhoto(id: string) {
    const selected = session.selected.includes(id)
      ? session.selected.filter(x => x !== id)
      : [...session.selected, id];
    commit({ ...session, selected });
  }

  const visible = session.folderId
    ? photos.filter(p => p.folder_id === session.folderId)
    : photos;
  // Зургийн дугаар (№) — томоор үзүүлэх дэлгэцийнхтэй ижил (хавтас бүрт 1-ээс)
  const numMap = useMemo(() => photoNumberMap(photos, session.folderId ?? 'all'), [photos, session.folderId]);
  const [numQ, setNumQ] = useState('');
  const [numErr, setNumErr] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  function findByNumber() {
    const n = parsePhotoNumber(numQ);
    if (!n) return;
    let id: string | null = null;
    for (const [k, v] of numMap) if (v === n) { id = k; break; }
    if (!id) { setNumErr(`№${n} зураг энэ хэсэгт олдсонгүй`); return; }
    setNumErr('');
    setFlashId(id);
    const target = id;
    setTimeout(() => document.getElementById(`g-photo-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    setTimeout(() => setFlashId(f => (f === target ? null : f)), 4000);
  }
  const selectedPhotos = photos.filter(p => session.selected.includes(p.id));
  const running = selectedPhotos.reduce((s, p) => s + dlPrice(p, album, aiPrice), 0);

  function finishSelect() {
    if (!session.selected.length) return;
    const choices: GuideChoice[] = session.selected.map(id => {
      const prev = session.choices.find(c => c.photoId === id);
      const photo = photos.find(p => p.id === id);
      const opts = photo ? printOptions(photo) : [];
      // Анхдагч нь «Татах» — угаалгахыг хэрэглэгч өөрөө нэмнэ («Түр хадгалах» биш)
      return prev ?? { photoId: id, download: true, print: false, printSize: opts[0]?.[0] };
    });
    go('choices', { choices }, 'Сонгосон зураг бүрээ татах уу, угаалгах уу, эсвэл хоёуланг нь уу?');
  }

  /** Түр хадгалсан зургуудыг сонголт руу (татах сонгогдсон) — QPay төлөхөд бэлэн */
  function openLater() {
    const ids = readLater(album.id).filter(id => photos.some(p => p.id === id));
    if (!ids.length) return;
    const all = [...new Set([...session.selected, ...ids])];
    const choices: GuideChoice[] = all.map(id => {
      const prev = session.choices.find(c => c.photoId === id);
      const photo = photos.find(p => p.id === id);
      const opts = photo ? printOptions(photo) : [];
      if (ids.includes(id)) return { ...(prev ?? { photoId: id, print: false, printSize: opts[0]?.[0] }), photoId: id, download: true };
      return prev ?? { photoId: id, download: true, print: false, printSize: opts[0]?.[0] };
    });
    go('choices', { selected: all, choices }, 'Таны түр хадгалсан зургууд. Татах сонголтоо шалгаад QPay-ээр төлнө үү.');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  // Нүүр хуудсаас «Түр хадгалсан» дарж ирсэн бол (?later=1) шууд төлбөрийн хэсэг рүү
  const laterOnce = useRef(false);
  useEffect(() => {
    if (laterOnce.current || !photos.length) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get('later') !== '1') return;
    laterOnce.current = true;
    u.searchParams.delete('later');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    openLater();
  }, [photos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Нүүрнээс «Таны сонгосон зураг» дарж ирсэн бол (?pay=1): хөтчийн сонголт болон
   * «Энгийн харагдац»-ын сагсыг нэгтгээд шууд төлбөрийн жагсаалт руу.
   */
  const payOnce = useRef(false);
  useEffect(() => {
    if (payOnce.current || !photos.length) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get('pay') !== '1') return;
    payOnce.current = true;
    u.searchParams.delete('pay');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    openSelected();
  }, [photos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function openSelected() {
    // QR үүссэн төлбөр хүлээж байгаа бол тэр хэвээр (шууд QR харагдана)
    if (session.step === 'pay' && session.invoice) return;
    const has = (id: string) => photos.some(p => p.id === id);
    const cartItems = loadCart<{ photoId: string; type: 'download' | 'print'; printSize?: string }>(album.id).filter(c => c && has(c.photoId));
    const ids = [...new Set([...session.selected, ...session.choices.map(c => c.photoId), ...cartItems.map(c => c.photoId)])].filter(has);
    if (!ids.length) return;
    const choices: GuideChoice[] = ids.map(id => {
      const prev = session.choices.find(c => c.photoId === id);
      if (prev) return prev;
      const photo = photos.find(p => p.id === id);
      const opts = photo ? printOptions(photo) : [];
      const items = cartItems.filter(c => c.photoId === id);
      if (items.length) {
        const pr = items.find(i => i.type === 'print');
        return { photoId: id, download: items.some(i => i.type === 'download') || !(pr && printsOpen), print: !!pr && printsOpen, printSize: pr?.printSize || opts[0]?.[0] };
      }
      return { photoId: id, download: true, print: false, printSize: opts[0]?.[0] };
    });
    if (session.name.trim().length < 2) {
      // Нэр, утас хэрэгтэй — оруулсны дараа шууд төлбөрийн жагсаалт (welcome())
      commit({ ...session, selected: ids, choices, invoice: null, step: 'welcome', declined: false });
      return;
    }
    go('choices', { selected: ids, choices, invoice: null, declined: false }, SELECTED_MSG);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  // Том дэлгэцийн зургийн QR-ийг дараалан уншуулж сонгосон жагсаалтад нэмнэ
  const [scanOpen, setScanOpen] = useState(false);
  const scanAdd = useCallback((text: string): { ok: boolean; message: string } => {
    let id: string | null = null;
    try { id = new URL(text).searchParams.get('add'); } catch { /* URL биш */ }
    if (!id) return { ok: false, message: 'Том дэлгэц дээрх зургийн QR биш байна' };
    const photo = photos.find(p => p.id === id);
    if (!photo) return { ok: false, message: 'Энэ зураг энэ цомогт алга' };
    const cur = sessionRef.current;
    if (cur.choices.some(c => c.photoId === id)) return { ok: true, message: 'Энэ зураг аль хэдийн сонгогдсон' };
    const opts = printOptions(photo);
    const next = {
      ...cur,
      selected: [...new Set([...cur.selected, id])],
      choices: [...cur.choices, { photoId: id, download: true, print: false, printSize: opts[0]?.[0] }],
      invoice: null,
    };
    sessionRef.current = next;
    commit(next);
    return { ok: true, message: `Нэмэгдлээ ✓ · нийт ${next.choices.length} зураг` };
  }, [photos]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Төлөхөөс өмнө цомог руу буцаж нэмж/дахин сонгох — өмнөх сонголт, тохиргоо хадгалагдана */
  function backToAlbum() {
    go('browse', { folderId: session.folderId ?? null },
      'Цомгийн зургууд. Өмнө сонгосон зургууд хадгалагдсан — нэмж сонгоод «Сонгож дууслаа» дарна уу.');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  /**
   * Төлбөрийн алхамаас буцах — сонголт хэвээр үлдэнэ.
   * QR үүссэн бол тэр нэхэмжлэхийг орхино (дахин «QPay-ээр төлөх» дарахад шинэ дүнгээр үүснэ).
   */
  function backFromPay(target: 'choices' | 'album') {
    if (session.invoice && !window.confirm('Энэ QR код хүчингүй болно. Зураг нэмж/хассаны дараа шинэ QR үүснэ. Буцах уу?')) return;
    if (target === 'album') {
      go('browse', { folderId: session.folderId ?? null, invoice: null },
        'Цомгийн зургууд. Өмнө сонгосон зургууд хадгалагдсан — нэмж сонгоод «Сонгож дууслаа» дарна уу.');
    } else {
      go('choices', { invoice: null }, 'Сонгосон зургууд. Нэмэх, хасах, татах/угаалгах сонголтоо засаад дахин төлнө үү.');
    }
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  function setChoice(id: string, patch: Partial<GuideChoice>) {
    const choices = session.choices.map(c => c.photoId === id ? { ...c, ...patch } : c);
    commit({ ...session, choices });
  }

  function removeChoice(photoId: string) {
    if (later.includes(photoId)) setLater(writeLater(album.id, later.filter(x => x !== photoId)));
    onDropCartPhoto?.(photoId);
    commit(dropGuideCartPhoto(session, photoId));
  }

  function stepViewer(dir: number) {
    const i = session.choices.findIndex(c => c.photoId === viewerId);
    if (i < 0 || session.choices.length < 2) return;
    setViewerId(session.choices[(i + dir + session.choices.length) % session.choices.length].photoId);
  }

  const printsOpen = printOrdersOpen(album.print_deadline);
  const lines: GuideCartLine[] = [];
  for (const c of session.choices) {
    const p = photos.find(x => x.id === c.photoId);
    if (!p) continue;
    if (c.download) {
      const price = dlPrice(p, album, aiPrice);
      if (price > 0) lines.push({
        photoId: p.id, photographerId: p.photographer_id, previewUrl: p.watermarked_url,
        filename: p.title || p.id, type: 'download', price,
      });
    }
    if (printsOpen && c.print && c.printSize) {
      const price = Number(p.print_prices?.[c.printSize] ?? 0);
      if (price > 0) lines.push({
        photoId: p.id, photographerId: p.photographer_id, previewUrl: p.watermarked_url,
        filename: p.title || p.id, type: 'print', printSize: c.printSize, price,
      });
    }
  }
  const total = lines.reduce((s, l) => s + l.price, 0);
  const paying = (c: GuideChoice) => c.download || (printsOpen && c.print);
  const ready = session.choices.some(paying);
  const laterCount = session.choices.filter(c => !paying(c)).length;

  async function redownload(item: OwnedPhoto) {
    setPastNote('');
    setDlBusy(true);
    try {
      const files = await loadPaidFiles(item.invoiceId);
      const hit = files.find(f => (f.photoId && f.photoId === item.photoId) || f.filename === item.filename);
      const expired = !hit || hit.expired || !hit.signedUrl || downloadExpired(hit.expiresAt);
      if (expired) {
        setSession(s => ({
          ...s,
          owned: (s.owned ?? []).map(o => o.photoId === item.photoId && o.invoiceId === item.invoiceId && o.type === 'download'
            ? { ...o, expiresAt: hit?.expiresAt || '1970-01-01T00:00:00.000Z' }
            : o),
        }));
        setPastNote('Татах хугацаа дууссан.');
        return;
      }
      const blob = await (await fetch(hit.signedUrl)).blob();
      const name = /\.(jpe?g|png|webp)$/i.test(hit.filename) ? hit.filename : `${hit.filename}.jpg`;
      const how = await saveFilesToGallery([new File([blob], name, { type: blob.type || 'image/jpeg' })]);
      if (how === 'cancelled') { setPastNote('Хадгалаагүй.'); return; }
      setDlGot(new Set(writeDownloadedIds(item.invoiceId, [hit.purchaseId])));
      setPastNote(how === 'shared' ? 'Нээгдсэн цонхноос «Хадгалах»-ыг дарна уу.' : 'Зураг татагдлаа.');
    } catch {
      setPastNote('Дахин татаж чадсангүй.');
    } finally {
      setDlBusy(false);
    }
  }

  function reprint(photoId: string) {
    const photo = photos.find(p => p.id === photoId);
    const opts = photo ? printOptions(photo) : [];
    if (!opts.length) { setPastNote('Энэ зурагт угаалгах үнэ байхгүй.'); return; }
    const choices: GuideChoice[] = [{ photoId, download: false, print: true, printSize: opts[0][0] }];
    commit({
      ...session,
      selected: [photoId],
      choices,
      step: 'pay',
      invoice: null,
      messages: [...session.messages, { role: 'bot', text: guidePaySummary(session.name, 1, 0, 1, money(opts[0][1])) }],
    });
  }

  function beginPay() {
    if (!ready || total <= 0) return;
    const downloads = session.choices.filter(c => c.download).length;
    const prints = session.choices.filter(c => printsOpen && c.print).length;
    // Сонгоогүй үлдсэнийг түр хадгална
    const keep = session.choices.filter(c => !paying(c)).map(c => c.photoId);
    if (keep.length) setLater(writeLater(album.id, [...later, ...keep]));
    go('pay', { invoice: null }, guidePaySummary(session.name, session.choices.filter(paying).length, downloads, prints, money(total)));
  }

  async function startPay() {
    if (!licenseOk || payBusy) return;
    setPayBusy(true);
    setPayErr('');
    try {
      const { data: { session: auth } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const res = await fetch(`${QPAY_FN_URL}/create-invoice`, {
        method: 'POST',
        headers: auth?.access_token
          ? { 'Content-Type': 'application/json', apikey: QPAY_ANON, Authorization: `Bearer ${auth.access_token}` }
          : { 'Content-Type': 'application/json', Authorization: `Bearer ${QPAY_ANON}` },
        body: JSON.stringify({
          cartItems: lines.map(c => ({
            photoId: c.photoId,
            photographerId: c.photographerId,
            type: c.type,
            printSize: c.printSize,
            price: c.price,
          })),
          buyerName: session.name,
          buyerPhone: session.phone,
          buyerEmail: '',
          albumId: album.id,
          licenseAccepted: lines.some(l => l.type === 'download') ? true : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Төлбөр эхлүүлж чадсангүй');
      const invoice: GuideInvoice = {
        invoiceId: String(data.invoiceId),
        qrImage: typeof data.qrImage === 'string' ? data.qrImage : '',
        qrText: typeof data.qrText === 'string' ? data.qrText : '',
        urls: Array.isArray(data.urls) ? data.urls as BankLink[] : [],
        grossTotal: Number(data.grossTotal) || total,
      };
      commit({ ...session, invoice });
      savePendingEdits(invoice.invoiceId, session.choices.flatMap(c => [
        ...(c.download && hasEdit(c.editDl) ? [{ photoId: c.photoId, type: 'download' as const, adjust: c.editDl! }] : []),
        ...(c.print && hasEdit(c.editPr) ? [{ photoId: c.photoId, type: 'print' as const, adjust: c.editPr! }] : []),
      ]));
      onInvoiceRef.current?.(invoice.invoiceId);
    } catch (err) {
      setPayErr(err instanceof Error ? err.message : 'Төлбөр эхлүүлж чадсангүй');
    } finally {
      setPayBusy(false);
    }
  }
  const viewerIdx = session.choices.findIndex(c => c.photoId === viewerId);
  const viewerPhoto = viewerIdx >= 0 ? photos.find(p => p.id === viewerId) : undefined;

  function onViewerTouchStart(e: React.TouchEvent) {
    if ((e.target as HTMLElement).closest('button')) { swipe.current = null; return; }
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onViewerTouchEnd(e: React.TouchEvent) {
    if (!swipe.current) return;
    const dx = e.changedTouches[0].clientX - swipe.current.x;
    const dy = e.changedTouches[0].clientY - swipe.current.y;
    swipe.current = null;
    if (Math.abs(dx) < 48 && Math.abs(dy) < 48) return;
    if (Math.abs(dy) >= Math.abs(dx) || session.choices.length < 2) {
      closeLightbox(setViewerId);
      return;
    }
    stepViewer(dx < 0 ? 1 : -1);
  }

  function noteGuideDownloaded(ids: string[]) {
    if (!paidInvoice || !ids.length) return;
    setDlGot(new Set(writeDownloadedIds(paidInvoice, ids)));
  }

  const loadPaidFiles = useCallback(async (invoice: string): Promise<PaidFile[]> => {
    // Төлөхөөс өмнө хийсэн засваруудыг эхлээд хадгална (дараа нь signed-urls-д adjust ирнэ)
    await flushPendingEdits(invoice).catch(() => ({}));
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay/signed-urls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ invoiceId: invoice }),
    });
    const body = await res.json().catch(() => ({}));
    const urls = (body.signedUrls ?? []) as { purchaseId?: string; signedUrl?: string; filename?: string; type?: string; expired?: boolean; downloadCount?: number }[];
    const files: PaidFile[] = [];
    for (const u of urls) {
      if (u.type !== 'download' || !u.purchaseId) continue;
      files.push({
        purchaseId: u.purchaseId,
        photoId: typeof (u as { photoId?: string }).photoId === 'string' ? (u as { photoId?: string }).photoId : undefined,
        signedUrl: u.signedUrl || '',
        filename: u.filename || 'zurag.jpg',
        expired: !!u.expired,
        expiresAt: (u as { expiresAt?: string | null }).expiresAt ?? null,
        downloadCount: u.downloadCount,
        brand: (u as { brand?: string }).brand ?? '',
        adjust: (u as { adjust?: PhotoAdjust & PrintCrop }).adjust,
        baseAdjust: (u as { baseAdjust?: PhotoAdjust & PrintCrop }).baseAdjust,
      });
    }
    const counted = idsWithServerDownloads(files.map(f => ({ id: f.purchaseId, downloadCount: f.downloadCount })));
    if (counted.length) setDlGot(new Set(writeDownloadedIds(invoice, counted)));
    return files;
  }, []);

  useEffect(() => {
    if (session.step !== 'done' || !paidInvoice) return;
    let cancel = false;
    loadPaidFiles(paidInvoice).then(files => { if (!cancel) setDlFiles(files); }).catch(() => {});
    return () => { cancel = true; };
  }, [session.step, paidInvoice, loadPaidFiles]);

  async function downloadPaid(only?: PaidFile[]) {
    if (!paidInvoice || dlBusy) return;
    setDlBusy(true);
    setDlNote('');
    try {
      const known = (dlFiles.length ? dlFiles : await loadPaidFiles(paidInvoice)).filter(f => f.signedUrl && !f.expired);
      if (!dlFiles.length) setDlFiles(known);
      const targets = (only && only.length ? only : (everyDownloaded(known.map(f => f.purchaseId), dlGot) ? known : known.filter(f => !dlGot.has(f.purchaseId))));
      const list = (targets.length ? targets : known).filter(f => f.signedUrl && !f.expired);
      const files: File[] = [];
      const savedIds: string[] = [];
      setDlProg({ done: 0, total: list.length });
      let n = 0;
      for (const u of list) {
        n += 1;
        setDlProg({ done: n, total: list.length });
        try {
          let blob = await (await fetch(u.signedUrl)).blob();
          // цомгийн эзний засвар → худалдан авагчийн засвар (байвал) → цомгийн лого
          blob = await applyBaseEdit(blob, u.baseAdjust);
          if (hasEdit(u.adjust)) blob = await preparePrintBlob(blob, 'original', u.adjust!);
          blob = await applyBrandToPurchase(blob, u.brand || '', u.filename);
          const name = /\.(jpe?g|png|webp)$/i.test(u.filename) ? u.filename : `${u.filename}.jpg`;
          const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
          files.push(file);
          savedIds.push(u.purchaseId);
        } catch { /* дараагийн зураг */ }
      }
      if (!files.length) { setDlNote('Татах холбоос хараахан бэлэн биш. Хэдэн секундийн дараа дахин дарна уу.'); return; }
      setDlProg({ done: files.length, total: list.length, saving: true });
      const savedHow = await saveFilesToGallery(files);
      if (savedHow === 'cancelled') { setDlNote('Хадгалаагүй. «Галерей руу хадгалах»-ыг дахин дарна уу.'); return; }
      noteGuideDownloaded(savedIds);
      setDlNote(savedHow === 'shared'
        ? 'Нээгдсэн цонхноос «Save Image / Хадгалах»-ыг дарж галерей руу хийнэ үү.'
        : (isAndroid
          ? 'Зургууд татагдлаа. Утасны Галерей эсвэл Downloads хавтсаас харна уу.'
          : 'Таталт эхэллээ.'));
    } catch {
      setDlNote('Татаж чадсангүй. Баримтын хуудаснаас дахин оролдоно уу.');
    } finally {
      setDlBusy(false);
      setDlProg(null);
    }
  }

  const others = named.filter(f => f.id !== session.folderId);
  const shownMessages = chatOpen ? session.messages : session.messages.slice(-1);

  return (
    <div className={`fixed inset-x-0 bottom-0 z-[45] bg-stone-950 text-white flex flex-col ${inApp ? 'top-24' : 'top-0'}`}>
      {/* Нэг мөр: лого (нүүр хуудас руу) · цомог сонгогч · харагдац. Чат баруун доод буланд. */}
      <header className="px-3 py-2.5 border-b border-white/10 flex items-center gap-2.5 shrink-0">
        <a href="/" aria-label="Zuragchin.mn нүүр хуудас" className="shrink-0">
          <BrandMark className="w-9 h-9" />
        </a>
        <div className="min-w-0 flex-1">
          <AlbumSwitcher albumId={album.id} albumName={album.name} />
        </div>
        {session.step === 'browse' && (
            <div className="shrink-0 flex bg-white/10 rounded-lg p-0.5" role="group" aria-label="Харагдац">
              {([1, 2, 3] as const).map(n => (
                <button key={n} type="button" onClick={() => setCols(n)} aria-label={`${n} багана`}
                  className={`w-8 h-7 rounded-md flex items-center justify-center ${cols === n ? 'bg-amber-500 text-stone-950' : 'text-stone-300'}`}>
                  <span className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
                    {Array.from({ length: n === 1 ? 1 : n * 2 }).map((_, i) => (
                        <span key={i} className={`block rounded-[1px] bg-current ${n === 1 ? 'w-3 h-3.5' : n === 2 ? 'w-1.5 h-1.5' : 'w-1 h-1'}`} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
        )}
      </header>

      {session.step === 'browse' && named.length > 0 && (
        <div className="flex items-center px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto flex-1 min-w-0 [scrollbar-width:none]">
          {named.length > 0 && <button type="button" onClick={() => openFolder(null, 'Бүх зураг')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${session.folderId === null ? 'bg-amber-500 text-stone-950' : 'bg-white/10 text-white'}`}>
            Бүгд
          </button>}
          {named.map(f => (
            <button key={f.id} type="button" onClick={() => openFolder(f.id, f.name)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${session.folderId === f.id ? 'bg-amber-500 text-stone-950' : 'bg-white/10 text-white'}`}>
              {f.name}
            </button>
          ))}
        </div>
        </div>
      )}

      {shownMessages.length > 0 && (
        <div ref={listRef} className={`px-4 py-2 space-y-2 shrink-0 ${chatOpen ? 'overflow-y-auto max-h-[34dvh]' : ''}`}>
          {shownMessages.map((m, i) => (
            <div key={i} className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-snug ${
              m.role === 'bot' ? 'bg-white/10' : 'bg-amber-500 text-stone-950 ml-auto'
            }`}>{m.text}</div>
          ))}
          {busy && <div className="text-stone-500 text-xs flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> ...</div>}
          {chatOpen && (
            <button type="button" onClick={() => { commit({ ...session, declined: true }); onClose(); }}
              className="text-stone-400 text-xs underline">Энгийн харагдац руу шилжих</button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3">
        {session.step === 'welcome' && (
          <form onSubmit={e => { e.preventDefault(); welcome(); }} className="space-y-3 max-w-md mx-auto pt-2">
            <p className="text-stone-300 text-sm">Нэр, утасаа үлдээгээд зургаа үзээрэй. Төлбөр дуустал энэ төхөөрөмж дээр хадгалагдана.</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Нэр" autoComplete="name"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-amber-500" />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Утасны дугаар" inputMode="numeric" autoComplete="tel"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-amber-500" />
            {formErr && <p className="text-red-300 text-sm">{formErr}</p>}
            <button type="submit" className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl py-3.5">Зураг үзэх</button>
            <button type="button" onClick={() => { commit({ ...session, declined: true }); onClose(); }}
              className="w-full text-stone-400 text-sm underline py-1">Нэр оруулахгүйгээр энгийн харагдацаар үзэх</button>
          </form>
        )}

        {session.step === 'greet' && (
          <div className="max-w-md mx-auto space-y-3">
            <div className="flex gap-2">
              <button type="button" onClick={acceptYes} className="flex-1 bg-amber-500 text-stone-950 font-bold rounded-xl py-3">Тийм</button>
              <button type="button" onClick={() => { commit({ ...session, declined: true }); onClose(); }} className="flex-1 bg-white/10 rounded-xl py-3">Үгүй</button>
            </div>
            {session.known && groupOwned(session.owned ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-stone-200">Таны өмнө авсан {groupOwned(session.owned ?? []).length} зураг энд байна</p>
                <div className="grid grid-cols-3 gap-2">
                  {groupOwned(session.owned ?? []).map(row => {
                    const photo = photos.find(p => p.id === row.photoId);
                    const expired = !!row.download && downloadExpired(row.download.expiresAt);
                    return (
                      <button key={row.photoId} type="button" onClick={() => { setPastId(row.photoId); setPastNote(''); }}
                        className={`relative aspect-square overflow-hidden rounded-xl bg-stone-900 ${pastId === row.photoId ? 'ring-2 ring-amber-400' : ''}`}>
                        {photo?.watermarked_url && <img src={photo.watermarked_url} alt="" className="h-full w-full object-cover" />}
                        {expired && <span className="absolute inset-x-0 bottom-0 bg-black/70 text-[10px] py-0.5">Хугацаа дууссан</span>}
                      </button>
                    );
                  })}
                </div>
                {pastId && (() => {
                  const row = groupOwned(session.owned ?? []).find(r => r.photoId === pastId);
                  if (!row) return null;
                  const expired = !!row.download && downloadExpired(row.download.expiresAt);
                  return (
                    <div className="flex flex-wrap gap-2">
                      {row.download && (expired
                        ? <p className="text-sm text-red-300">Татах хугацаа дууссан.</p>
                        : <button type="button" disabled={dlBusy} onClick={() => redownload(row.download!)}
                            className="rounded-xl bg-emerald-500/15 border border-emerald-400/50 text-emerald-200 font-semibold px-3 py-2 text-sm">Дахин татах</button>)}
                      {printsOpen
                        ? <button type="button" onClick={() => reprint(row.photoId)}
                            className="rounded-xl bg-amber-500 text-stone-950 font-semibold px-3 py-2 text-sm">Угаалгах</button>
                        : <p className="text-sm text-stone-400">Угаалгах хугацаа дууссан</p>}
                    </div>
                  );
                })()}
                {pastNote && <p className="text-sm text-stone-300">{pastNote}</p>}
              </div>
            )}
          </div>
        )}

        {session.step === 'topics' && (
          <div className="flex flex-wrap gap-2 max-w-lg mx-auto">
            {named.map(f => (
              <button key={f.id} type="button" onClick={() => openFolder(f.id, f.name)}
                className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-full px-4 py-2 text-sm">{f.name}</button>
            ))}
            <button type="button" onClick={() => openFolder(null, 'Бүх зураг')}
              className="bg-amber-500/20 border border-amber-500/40 rounded-full px-4 py-2 text-sm">Бүгдийг</button>
          </div>
        )}

        {session.step === 'browse' && (
          <>
            <form onSubmit={e => { e.preventDefault(); findByNumber(); }} className="flex items-center gap-2 mb-3 max-w-md">
              <div className="flex-1 flex items-center rounded-xl border border-white/10 bg-white/5 focus-within:border-amber-500/60">
                <span className="pl-3 text-stone-400 text-sm font-semibold">№</span>
                <input value={numQ} onChange={e => { setNumQ(e.target.value.replace(/\D/g, '').slice(0, 5)); setNumErr(''); }}
                  inputMode="numeric" enterKeyHint="search" placeholder="Дэлгэц дээрх дугаараар хайх"
                  className="flex-1 min-w-0 bg-transparent px-2 py-2.5 text-sm text-white placeholder-stone-500 outline-none" />
              </div>
              <button type="submit" className="shrink-0 flex items-center gap-1.5 bg-amber-500 text-stone-950 font-semibold rounded-xl px-3 py-2.5 text-sm">
                <Search className="w-4 h-4" /> Хайх
              </button>
            </form>
            {numErr && <p className="text-red-300 text-xs -mt-1 mb-3">{numErr}</p>}
            <div className={`grid ${cols === 1 ? 'grid-cols-1 gap-3 max-w-xl mx-auto' : cols === 3 ? 'grid-cols-3 gap-1.5' : 'grid-cols-2 sm:grid-cols-3 gap-2'}`}>
              {visible.map(p => {
                const on = session.selected.includes(p.id);
                return (
                  <button key={p.id} id={`g-photo-${p.id}`} type="button" onClick={() => togglePhoto(p.id)}
                    className={`relative ${cols === 1 ? 'flex justify-center bg-black' : 'aspect-[3/4] bg-stone-900'} rounded-xl overflow-hidden text-left ${flashId === p.id ? 'ring-4 ring-sky-400' : on ? 'ring-2 ring-amber-400' : ''}`}>
                    {cols === 1
                      ? <img src={p.watermarked_url} alt="" loading="lazy" className="pointer-events-none block mx-auto w-auto max-w-full h-auto max-h-[calc(100dvh-270px)] min-h-[200px] object-contain" />
                      : <img src={p.watermarked_url} alt="" loading="lazy" className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover" />}
                    <span className={`pointer-events-none absolute top-2 left-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border-2 shadow-md ${on ? 'border-amber-300 bg-amber-500 text-stone-950' : 'border-white bg-black/80 text-white'}`}>
                      {on ? <Check className="w-4 h-4" strokeWidth={3} /> : <span className="block h-3.5 w-3.5 rounded-sm border border-white/80" />}
                    </span>
                    {numMap.get(p.id) && (
                      <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 bg-black/75 rounded px-1.5 text-[11px] font-bold">№{numMap.get(p.id)}</span>
                    )}
                    <span className="absolute bottom-1.5 right-1.5 bg-black/70 rounded px-1.5 text-[11px]">{money(dlPrice(p, album, aiPrice))}</span>
                  </button>
                );
              })}
            </div>
            {others.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold mb-2">Бусад сэдэвтэй зургууд</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {others.map(f => (
                    <button key={f.id} type="button" onClick={() => openFolder(f.id, f.name)}
                      className="shrink-0 bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-sm">{f.name}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {session.step === 'choices' && (
          <div className="space-y-3 max-w-lg mx-auto">
            {album.print_deadline && (
              <p className={`text-sm ${printsOpen ? 'text-amber-200' : 'text-stone-400'}`}>
                {printsOpen ? `Угаалгах захиалга ${formatPrintDay(album.print_deadline)} хүртэл` : 'Угаалгах хугацаа дууссан'}
              </p>
            )}
            {session.choices.map(c => {
              const p = photos.find(x => x.id === c.photoId);
              if (!p) return null;
              const prints = printOptions(p);
              const dlp = dlPrice(p, album, aiPrice);
              return (
                <div key={c.photoId} className="flex gap-3 bg-white/5 border border-white/10 rounded-2xl p-2">
                  <button type="button" onClick={() => setViewerId(c.photoId)} aria-label="Томоор харах"
                    className="w-16 h-20 shrink-0 rounded-lg overflow-hidden bg-stone-900 flex items-center justify-center">
                    <EditedThumb url={p.watermarked_url}
                      size={c.download ? 'original' : (c.printSize || prints[0]?.[0] || '10x15')}
                      edit={c.download ? c.editDl : c.editPr}
                      className={hasEdit(c.download ? c.editDl : c.editPr) ? 'max-h-full max-w-full object-contain' : 'h-full w-full object-cover'} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm truncate">{p.name || p.title}</p>
                      <button type="button" onClick={() => removeChoice(c.photoId)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold text-white"
                        aria-label="Хасах">
                        <X className="w-3.5 h-3.5" /> Хасах
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <button type="button" onClick={() => setChoice(c.photoId, { download: !c.download })}
                        className={`text-xs rounded-full px-3 py-1.5 border ${c.download ? 'bg-amber-500 text-stone-950 border-amber-500' : paying(c) ? 'border-white/15' : 'border-sky-400/60 text-sky-200 bg-sky-500/10'}`}>
                        {c.download || paying(c) ? <>Татах · {money(dlp)}</> : <span className="inline-flex items-center gap-1"><Bookmark className="w-3.5 h-3.5" /> Түр хадгалах</span>}
                      </button>
                      {!printsOpen && prints.length > 0 && <p className="text-xs text-stone-500 mt-2">Угаалгах хугацаа дууссан</p>}
                      {printsOpen && prints.length > 0 && (
                        <button type="button" onClick={() => setChoice(c.photoId, { print: !c.print, printSize: c.printSize || prints[0][0] })}
                          className={`text-xs rounded-full px-3 py-1.5 border ${c.print ? 'bg-amber-500 text-stone-950 border-amber-500' : 'border-white/15'}`}>
                          Угаалгах · {money(Number(p.print_prices[c.printSize || prints[0][0]] || prints[0][1]))}
                        </button>
                      )}
                    </div>
                    {allowEdit && (c.download || (c.print && printsOpen)) && (
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                        {c.download && (
                          <button type="button" onClick={() => setEditTarget({ photoId: c.photoId, kind: 'dl' })}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-amber-200">
                            ✂ {c.print ? 'Татахыг засах' : 'Засах'}{hasEdit(c.editDl) ? ' ✓' : ''}
                          </button>
                        )}
                        {c.print && printsOpen && (
                          <button type="button" onClick={() => setEditTarget({ photoId: c.photoId, kind: 'pr' })}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-amber-200">
                            ✂ Угаах хэлбэрийг засах{hasEdit(c.editPr) ? ' ✓' : ''}
                          </button>
                        )}
                      </div>
                    )}
                    {c.print && prints.length > 1 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {prints.map(([size, price]) => (
                          <button key={size} type="button" onClick={() => setChoice(c.photoId, { printSize: size, print: true })}
                            className={`text-[11px] rounded-lg px-2 py-1 ${c.printSize === size ? 'bg-white text-stone-950' : 'bg-white/10'}`}>
                            {PRINT_LABEL[size] || size} {money(price)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={() => setScanOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 rounded-xl py-3 text-sm font-semibold">
              <ScanLine className="w-4 h-4" /> Дэлгэцээс дараагийн зургийн QR уншуулах
            </button>
            <button type="button" onClick={backToAlbum}
              className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/15 rounded-xl py-3 text-sm font-semibold">
              <Images className="w-4 h-4 text-amber-400" /> Цомог руу буцаж зураг нэмэх
            </button>
            <p className="text-right font-bold">Нийт {money(total)}</p>
            {laterCount > 0 && (
              <p className="text-xs text-sky-200 flex items-center gap-1.5"><Bookmark className="w-3.5 h-3.5" /> {laterCount} зураг түр хадгалагдана — дараа нь цомгоос «Түр хадгалсан» дээр дарж авна.</p>
            )}
            <button id="zm-guide-pay" type="button" disabled={!ready || total <= 0} onClick={beginPay}
              className="w-full bg-amber-500 disabled:opacity-40 text-stone-950 font-bold rounded-xl py-3.5">
              {total > 0 ? `QPay-ээр төлөх · ${money(total)}` : 'Татах зургаа сонгоно уу'}
            </button>
          </div>
        )}

        {session.step === 'pay' && (
          <div className="max-w-md mx-auto space-y-3">
            {!session.invoice ? (
              <>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={licenseOk} onChange={e => setLicenseOk(e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-amber-500" />
                    <span className="text-sm leading-snug text-stone-200">
                      Зургаа төлбөр хийснээс хойш 14 хоногт багтаан утасныхаа галерей руу татаж авна. Хувийн хэрэглээнд зориулсан.
                    </span>
                  </label>
                  <a href="/terms" target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-amber-300 underline">Нөхцөл</a>
                </div>
                {payErr && <p className="text-red-300 text-sm">{payErr}</p>}
                <button type="button" disabled={!licenseOk || payBusy} onClick={startPay}
                  className="w-full bg-amber-500 disabled:opacity-40 text-stone-950 font-bold rounded-xl py-3.5 flex items-center justify-center gap-2">
                  {payBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Төлбөр үргэлжлүүлэх
                </button>
              </>
            ) : (
              <div className="text-center space-y-3">
                <p className="text-amber-300 text-sm">Төлбөр хүлээж байна…</p>
                <div className="bg-white rounded-2xl p-3 inline-block">
                  {session.invoice.qrImage ? (
                    <img src={`data:image/png;base64,${session.invoice.qrImage}`} alt="QPay QR" width={200} height={200} className="block" />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center"><QrCode className="w-12 h-12 text-stone-400" /></div>
                  )}
                </div>
                <p className="text-stone-300 text-sm">QPay-ээр {money(session.invoice.grossTotal)} төлнө үү</p>
                {session.invoice.urls.length > 0 && <BankLinks urls={session.invoice.urls} />}
              </div>
            )}
            {/* Төлөхөөс өмнө буцаж зураг нэмэх / хасах */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onClick={() => backFromPay('choices')}
                className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/15 rounded-xl py-3 text-sm font-semibold">
                <ChevronLeft className="w-4 h-4" /> Сонгосон зураг
              </button>
              <button type="button" onClick={() => backFromPay('album')}
                className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/15 rounded-xl py-3 text-sm font-semibold">
                <Images className="w-4 h-4 text-amber-400" /> Зураг нэмэх
              </button>
            </div>
          </div>
        )}

        {session.step === 'done' && (
          <div className="max-w-md mx-auto space-y-3">
            {session.choices.some(c => c.download) && (() => {
              const live = dlFiles.filter(f => f.signedUrl && !f.expired);
              const allGot = everyDownloaded(live.map(f => f.purchaseId), dlGot);
              const label = allGot ? (live.length === 1 ? 'Татсан ✓' : 'Бүгдийг татсан ✓') : 'Галерей руу хадгалах';
              return (
                <>
                  {live.length > 0 && (() => {
                    // Анхдагч сонголт: татаагүй бүх зураг (бүгд татсан бол бүгд — дахин татахад)
                    const notGot = live.filter(f => !dlGot.has(f.purchaseId)).map(f => f.purchaseId);
                    const sel = dlSel ?? new Set(notGot.length ? notGot : live.map(f => f.purchaseId));
                    const chosen = live.filter(f => sel.has(f.purchaseId));
                    const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setDlSel(n); };
                    const allOn = live.every(f => sel.has(f.purchaseId));
                    return (
                      <>
                        {live.length > 1 && (
                          <button type="button" onClick={() => setDlSel(allOn ? new Set() : new Set(live.map(f => f.purchaseId)))}
                            className="flex items-center gap-2 text-sm text-stone-300">
                            <span className={`flex h-5 w-5 items-center justify-center rounded border-2 ${allOn ? 'border-amber-400 bg-amber-500 text-stone-950' : 'border-white/60'}`}>
                              {allOn && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                            </span>
                            {allOn ? 'Бүгдийг болиулах' : 'Бүгдийг сонгох'}
                          </button>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {live.map(f => {
                            const on = sel.has(f.purchaseId);
                            const got = dlGot.has(f.purchaseId);
                            const ph = photos.find(p => p.id === f.photoId);
                            return (
                              <button key={f.purchaseId} type="button" onClick={() => toggle(f.purchaseId)}
                                className={`relative aspect-[3/4] rounded-xl overflow-hidden bg-stone-900 text-left ${on ? 'ring-2 ring-amber-400' : 'opacity-70'}`}>
                                {ph?.watermarked_url && (() => {
                                  const ed = f.adjust ?? session.choices.find(c => c.photoId === f.photoId)?.editDl;
                                  return hasEdit(ed)
                                    ? <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><EditedThumb url={ph.watermarked_url} size="original" edit={ed} className="max-h-full max-w-full object-contain" /></div>
                                    : <img src={ph.watermarked_url} alt="" className="absolute inset-0 h-full w-full object-cover pointer-events-none" />;
                                })()}
                                <span className={`absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-md border-2 shadow-md ${on ? 'border-amber-300 bg-amber-500 text-stone-950' : 'border-white bg-black/80'}`}>
                                  {on && <Check className="w-4 h-4" strokeWidth={3} />}
                                </span>
                                {got && <span className="absolute top-2 right-2 rounded-md bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-stone-950">Татсан ✓</span>}
                                <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-[11px] truncate">{f.filename}</span>
                              </button>
                            );
                          })}
                        </div>
                        <button type="button" onClick={() => downloadPaid(chosen)} disabled={dlBusy || chosen.length === 0}
                          className={`w-full font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 ${
                            allGot && chosen.every(f => dlGot.has(f.purchaseId))
                              ? 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-300 py-3.5'
                              : 'bg-amber-500 text-stone-950 text-base py-4'
                          }`}>
                          {dlBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          {dlProg ? (dlProg.saving ? `Галерей руу хадгалж байна… ${dlProg.done} зураг` : `Татаж байна… ${dlProg.done} / ${dlProg.total}`)
                            : chosen.length === 0 ? 'Татах зургаа сонгоно уу'
                            : chosen.every(f => dlGot.has(f.purchaseId)) ? `Дахин татах · ${chosen.length} зураг`
                            : `${chosen.length} зураг галерей руу татах`}
                        </button>
                        {dlProg && (
                          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden" aria-hidden>
                            <div className="h-full bg-amber-400 transition-all duration-300"
                              style={{ width: `${Math.round(((dlProg.saving ? dlProg.total : Math.max(0, dlProg.done - 1)) / Math.max(1, dlProg.total)) * 100)}%` }} />
                          </div>
                        )}
                        {allGot && !dlProg && <p className="text-center text-emerald-300 text-sm">{label}</p>}
                      </>
                    );
                  })()}
                  {live.length === 0 && (
                    <button type="button" onClick={() => downloadPaid()} disabled={dlBusy}
                      className="w-full font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 bg-amber-500 text-stone-950 text-base py-4">
                      {dlBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {dlProg ? (dlProg.saving ? `Галерей руу хадгалж байна… ${dlProg.done} зураг` : `Татаж байна… ${dlProg.done} / ${dlProg.total}`) : 'Галерей руу хадгалах'}
                    </button>
                  )}
                </>
              );
            })()}
            {dlNote && <p className="text-sm text-stone-300">{dlNote}</p>}
            {paidInvoice && (
              <a href={`/receipt/${paidInvoice}`} className="block text-center text-amber-300 text-sm underline">Баримт үзэх</a>
            )}
            <button type="button"
              onClick={() => {
                go('browse', { folderId: null, selected: [], choices: [], invoice: null },
                  'Цомгийн зургууд. Дахин авах зургаа тэмдэглээд «Сонгож дууслаа» дарна уу.');
                setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
              }}
              className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/15 rounded-xl py-3 text-sm font-semibold">
              <Images className="w-4 h-4 text-amber-400" /> Цомог руу буцах
            </button>
          </div>
        )}
      </div>

      {session.step !== 'welcome' && session.step !== 'done' && session.step !== 'browse' && session.step !== 'choices' && session.step !== 'pay' && (
        <form onSubmit={e => { e.preventDefault(); onFreeText(draft); }} className="shrink-0 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex gap-2 border-t border-white/10">
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Бичих..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none" />
          <button type="submit" className="bg-white/10 rounded-xl px-3" aria-label="Илгээх"><Send className="w-4 h-4" /></button>
        </form>
      )}

      {viewerPhoto && (
        <div
          className="fixed inset-0 z-[80] bg-black text-white flex flex-col touch-none"
          onTouchStart={onViewerTouchStart}
          onTouchEnd={onViewerTouchEnd}
          role="dialog"
          aria-modal="true"
          aria-label="Зургийн урьдчилсан харагдац"
        >
          <div className="flex items-center justify-between px-2 py-2 shrink-0">
            <button type="button" onClick={() => closeLightbox(setViewerId)} aria-label="Буцах" className="p-2 text-white">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <p className="text-sm text-stone-300">{viewerIdx + 1} / {session.choices.length}</p>
            <button type="button" onClick={() => closeLightbox(setViewerId)} aria-label="Хаах" className="p-2 text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="relative flex-1 min-h-0 flex items-center justify-center px-12">
            {session.choices.length > 1 && (
              <>
                <button type="button" onClick={() => stepViewer(-1)} aria-label="Өмнөх"
                  className="absolute left-2 p-3 rounded-full bg-white/10 text-white">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button type="button" onClick={() => stepViewer(1)} aria-label="Дараах"
                  className="absolute right-2 p-3 rounded-full bg-white/10 text-white">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
            <img
              src={viewerPhoto.watermarked_url}
              alt={viewerPhoto.name || viewerPhoto.title || ''}
              draggable={false}
              onContextMenu={e => e.preventDefault()}
              className="max-h-full max-w-full object-contain select-none"
            />
          </div>
          <p className="shrink-0 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-stone-300 truncate">
            {viewerPhoto.name || viewerPhoto.title}
          </p>
        </div>
      )}

      {DEBUG && dbg && <p className="shrink-0 px-3 py-1 text-[10px] text-amber-300 break-all">{dbg}</p>}
      {/* Чат — баруун доод буланд (бүх яриа, «Энгийн харагдац» руу шилжих) */}
      {session.messages.length > 0 && session.step !== 'welcome' && <button type="button" onClick={() => setChatOpen(o => !o)} aria-pressed={chatOpen} aria-label="Чат"
        className={`absolute right-4 z-10 w-12 h-12 rounded-full flex items-center justify-center shadow-[0_8px_30px_rgba(245,158,11,.35)] ${
          session.step === 'browse' ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom))]'
        } ${chatOpen ? 'bg-white text-stone-950' : 'bg-amber-500 text-stone-950'}`}>
        {chatOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>}
      {session.step === 'browse' && (
        <div className="shrink-0 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 flex items-center gap-2 bg-stone-950">
          {(() => {
            const laterIds = later.filter(id => photos.some(p => p.id === id));
            const pill = 'shrink-0 flex flex-col items-center justify-center rounded-xl px-2.5 py-1.5 leading-tight text-[11px] font-semibold border';
            return (<>
              {undlTotal > 0 && (
                <a href={undlHref} className={`${pill} border-emerald-400/70 text-emerald-300 bg-emerald-500/10`}>
                  <span>Татаагүй</span><span>зураг {undlTotal}</span>
                </a>
              )}
              {laterIds.length > 0 && (
                <button type="button" onClick={openLater} className={`${pill} border-sky-400/70 text-sky-200 bg-sky-500/10`}>
                  <span>Түр хадгалсан</span><span>зураг {laterIds.length}</span>
                </button>
              )}
              <p className="text-xs text-stone-400 flex-1 min-w-0 text-right leading-tight">
                {session.selected.length > 0 ? <>{session.selected.length} зураг<br />{money(running)}</> : null}
              </p>
            </>);
          })()}
          <button type="button" onClick={finishSelect} disabled={!session.selected.length}
            className="bg-amber-500 disabled:opacity-40 text-stone-950 font-bold rounded-xl px-4 py-3 text-sm">
            Сонгож дууслаа
          </button>
        </div>
      )}
      {editToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-emerald-500 text-stone-950 text-sm font-semibold px-4 py-2 rounded-full shadow-lg pointer-events-none">
          Засвар хадгалагдлаа ✓
        </div>
      )}
      {editTarget && (() => {
        const c = session.choices.find(x => x.photoId === editTarget.photoId);
        const p = photos.find(x => x.id === editTarget.photoId);
        if (!c || !p) return null;
        const isPr = editTarget.kind === 'pr';
        return (
          <div className="fixed inset-0 z-[60]">
            <PrintEditor
              purchaseId={`pre-${p.id}`}
              title={p.name || p.title}
              heading={isPr ? 'Угаах хэлбэрийг засах' : 'Зургаа засах'}
              brand={album.watermark_value || ''}
              formats={printOptions(p).map(([k]) => k)}
              note="Тамга зурагтайгаа хөдөлнө — төлсний дараах файлд тамга байхгүй. Цомгийн лого хүрээн дээр тогтмол харагдаж буй байрлалдаа гарна."
              source={{
                load: async () => ({
                  url: p.watermarked_url,
                  size: isPr ? (c.printSize || printOptions(p)[0]?.[0] || '10x15') : 'original',
                  adjust: (isPr ? c.editPr : c.editDl) ?? {},
                }),
                save: async a => { setChoice(c.photoId, isPr ? { editPr: a } : { editDl: a }); },
              }}
              onClose={() => setEditTarget(null)}
              onSaved={() => { setEditTarget(null); setEditToast(true); setTimeout(() => setEditToast(false), 2200); setTimeout(() => document.getElementById('zm-guide-pay')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }}
            />
          </div>
        );
      })()}
      <Suspense fallback={null}>{scanOpen && (
        <QrScanModal
          title="Зургийн QR уншуулах"
          hint="Том дэлгэц дээрх зургийн хажууд байгаа QR-ийг уншуулахад тэр зураг сонгосон жагсаалтад нэмэгдэнэ. Дараагийн зургийн QR-ийг шууд үргэлжлүүлэн уншуулна."
          onCode={scanAdd}
          onClose={() => setScanOpen(false)}
          footer={
            <button type="button" onClick={() => setScanOpen(false)}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl">
              <Check className="w-4 h-4" /> Сонгож дууслаа · {session.choices.length} зураг — татах/угаалгах сонгох
            </button>
          }
        />
      )}</Suspense>
    </div>
  );
}

/** Хөтчийн толгой: одоогийн цомгийн нэр — дарахад бусад цомгууд (үзсэн, төлсөн) болон код/нүүр рүү шилжих сонголт */
function AlbumSwitcher({ albumId, albumName }: { albumId: string; albumName: string }) {
  const [open, setOpen] = useState(false);
  const others = useMemo(() => {
    const seen = new Set([albumId]);
    const out: { id: string; name: string; link: string; cover?: string }[] = [];
    for (const a of listVisitedAlbums()) {
      if (seen.has(a.id)) continue;
      seen.add(a.id); out.push(a);
    }
    for (const h of listPurchaseHistory()) {
      if (!h.albumId || seen.has(h.albumId) || !h.albumLink) continue;
      seen.add(h.albumId); out.push({ id: h.albumId, name: h.albumName || 'Цомог', link: h.albumLink });
    }
    return out;
  }, [albumId, open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full min-w-0 flex items-center gap-2 text-left rounded-xl px-2.5 py-1.5 -ml-1 bg-emerald-500/10 border border-emerald-400/40">
        <span className="min-w-0 flex-1">
          <span className="block text-emerald-300 text-[10px] font-semibold leading-tight">{others.length ? 'Таны үзсэн цомог' : 'Цомог'}</span>
          <span className="block font-bold text-sm truncate">{albumName}</span>
        </span>
        <span className="shrink-0 flex items-center gap-0.5 text-xs text-emerald-200">
          {others.length > 0 && <>+{others.length}</>} <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <>
          <button type="button" aria-label="Хаах" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 w-[min(20rem,calc(100vw-1.5rem))] top-full mt-1 z-20 bg-stone-900 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5 shadow-2xl max-h-[65vh] overflow-y-auto">
            {others.length > 0 && <p className="px-3 pt-2.5 pb-1.5 text-[11px] text-stone-500">Бусад цомог</p>}
            {others.map(a => (
              <a key={a.id} href={`/album/${a.link}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5">
                {a.cover
                  ? <img src={a.cover} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  : <span className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Images className="w-4 h-4 text-stone-400" /></span>}
                <span className="text-stone-200 text-sm truncate flex-1">{a.name}</span>
                <ChevronRight className="w-4 h-4 text-stone-500" />
              </a>
            ))}
            {!others.length && <p className="px-3 py-2.5 text-xs text-stone-400">Энэ утсаар өөр цомог үзээгүй байна. Кодоор эсвэл QR-аар өөр цомог нээж болно.</p>}
            <a href="/c" className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-sm text-amber-300">
              <span className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 font-bold">#</span>
              <span className="flex-1">Цомгийн код оруулах</span>
            </a>
            <a href="/" className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-sm text-stone-200">
              <span className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><QrCode className="w-4 h-4 text-stone-300" /></span>
              <span className="flex-1">Нүүр хуудас · QR уншуулах</span>
            </a>
          </div>
        </>
      )}
    </div>
  );
}
