import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, MessageCircle, QrCode, Send, X } from 'lucide-react';
import type { AlbumData, PhotoData } from '../pages/PublicAlbumPage';
import { isAndroid, saveFilesToGallery, socialInAppName } from '../lib/browserEnv';
import { supabase } from '../lib/supabase';
import BankLinks, { type BankLink } from './BankLinks';
import {
  askHelpBot, downloadExpired, dropGuideCartPhoto, fetchLeadPurchases, groupOwned, guidePaySummary, loadGuide, markGuidePaid, mergeOwned, normalizeMnPhone, prepareGuideEntry, rememberPurchase, ruleReply, saveGuide, setAlbumGuideActive, syncGuideLead,
  type GuideCartLine, type GuideChoice, type GuideInvoice, type GuideMsg, type GuideSession, type GuideStep, type OwnedPhoto,
} from '../lib/albumGuide';
import { everyDownloaded, idsWithServerDownloads, readDownloadedIds, writeDownloadedIds } from '../lib/receiptDownloads';
import { formatPrintDay, printOrdersOpen } from '../lib/printDeadline';

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
  album, photos, folders, aiPrice, paidInvoice, onInvoiceCreated, onPaid, onClose,
}: {
  album: AlbumData;
  photos: PhotoData[];
  folders: { id: string; name: string }[];
  aiPrice: number;
  paidInvoice: string | null;
  onInvoiceCreated?: (invoiceId: string) => void;
  onPaid: (invoiceId: string) => void;
  onClose: () => void;
}) {
  const [session, setSession] = useState<GuideSession>(() => prepareGuideEntry(loadGuide(album.id), album.name));
  const [draft, setDraft] = useState('');
  const [name, setName] = useState(() => loadGuide(album.id).name);
  const [phone, setPhone] = useState(() => loadGuide(album.id).phone);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
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
  type PaidFile = { purchaseId: string; photoId?: string; signedUrl: string; filename: string; expired?: boolean; expiresAt?: string | null; downloadCount?: number };
  const [dlFiles, setDlFiles] = useState<PaidFile[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
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
    setSession(s => ({ ...s, step: 'done', messages, paidInvoices: slim.paidInvoices, owned: slim.owned }));
    markGuidePaid(album.id, session.token, paidInvoice);
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
    const greet = `Сайн байна уу, ${nm}! Та «${album.name}» цомогт нэвтэрлээ. Зураг үзэх үү?`;
    commit({ ...session, name: nm, phone: ph, step: 'greet', messages: [{ role: 'bot', text: greet }] });
  }

  function acceptYes() {
    if (named.length > 0) {
      const list = named.map(f => f.name).join(', ');
      go('topics', {}, `Энэ цомогт ийм сэдвүүдээр ангилсан зураг байна: ${list}. Алийг нь сонирхож байна?`);
    } else {
      go('browse', { folderId: null }, 'Бүх зургийг харууллаа. Хүссэн зургаа тэмдэглээд «Сонгож дууслаа» дарна уу.');
    }
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
      if (named.length > 0) {
        const list = named.map(f => f.name).join(', ');
        commit({ ...session, messages: [...messages, { role: 'bot', text: `Энэ цомогт ийм сэдвүүдээр ангилсан зураг байна: ${list}. Алийг нь сонирхож байна?` }], step: 'topics' });
      } else {
        commit({ ...session, messages: [...messages, { role: 'bot', text: 'Бүх зургийг харууллаа. Хүссэн зургаа тэмдэглээд «Сонгож дууслаа» дарна уу.' }], step: 'browse', folderId: null });
      }
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
  const selectedPhotos = photos.filter(p => session.selected.includes(p.id));
  const running = selectedPhotos.reduce((s, p) => s + dlPrice(p, album, aiPrice), 0);

  function finishSelect() {
    if (!session.selected.length) return;
    const choices: GuideChoice[] = session.selected.map(id => {
      const prev = session.choices.find(c => c.photoId === id);
      const photo = photos.find(p => p.id === id);
      const opts = photo ? printOptions(photo) : [];
      return prev ?? { photoId: id, download: false, print: false, printSize: opts[0]?.[0] };
    });
    go('choices', { choices }, 'Сонгосон зураг бүрээ татах уу, угаалгах уу, эсвэл хоёуланг нь уу?');
  }

  function setChoice(id: string, patch: Partial<GuideChoice>) {
    const choices = session.choices.map(c => c.photoId === id ? { ...c, ...patch } : c);
    commit({ ...session, choices });
  }

  function removeChoice(photoId: string) {
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
  const ready = session.choices.length > 0 && session.choices.every(c => c.download || (printsOpen && c.print));

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
    const prints = session.choices.filter(c => c.print).length;
    go('pay', { invoice: null }, guidePaySummary(session.name, session.choices.length, downloads, prints, money(total)));
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
      for (const u of list) {
        try {
          const blob = await (await fetch(u.signedUrl)).blob();
          const name = /\.(jpe?g|png|webp)$/i.test(u.filename) ? u.filename : `${u.filename}.jpg`;
          const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
          files.push(file);
          savedIds.push(u.purchaseId);
        } catch { /* дараагийн зураг */ }
      }
      if (!files.length) { setDlNote('Татах холбоос хараахан бэлэн биш. Хэдэн секундийн дараа дахин дарна уу.'); return; }
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
    }
  }

  const others = named.filter(f => f.id !== session.folderId);
  const shownMessages = chatOpen ? session.messages : session.messages.slice(-1);

  return (
    <div className={`fixed inset-x-0 bottom-0 z-[45] bg-stone-950 text-white flex flex-col ${inApp ? 'top-24' : 'top-0'}`}>
      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold truncate">Zuragchin.mn-д тавтай морил</p>
          <p className="text-stone-400 text-xs truncate">{album.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {session.messages.length > 1 && (
            <button type="button" onClick={() => setChatOpen(o => !o)} aria-pressed={chatOpen} aria-label="Чат"
              className={`p-2 rounded-lg ${chatOpen ? 'bg-white/15 text-white' : 'bg-white/10 text-white'}`}>
              <MessageCircle className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={() => { commit({ ...session, declined: true }); onClose(); }} className="text-stone-400 text-xs underline">Энгийн харагдац</button>
        </div>
      </header>

      {session.step === 'browse' && named.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-white/10 shrink-0 [scrollbar-width:none]">
          <button type="button" onClick={() => openFolder(null, 'Бүх зураг')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${session.folderId === null ? 'bg-amber-500 text-stone-950' : 'bg-white/10 text-white'}`}>
            Бүгд
          </button>
          {named.map(f => (
            <button key={f.id} type="button" onClick={() => openFolder(f.id, f.name)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${session.folderId === f.id ? 'bg-amber-500 text-stone-950' : 'bg-white/10 text-white'}`}>
              {f.name}
            </button>
          ))}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {visible.map(p => {
                const on = session.selected.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => togglePhoto(p.id)}
                    className={`relative aspect-[3/4] rounded-xl overflow-hidden bg-stone-900 text-left ${on ? 'ring-2 ring-amber-400' : ''}`}>
                    <img src={p.watermarked_url} alt="" className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover" />
                    <span className={`pointer-events-none absolute top-2 left-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border-2 shadow-md ${on ? 'border-amber-300 bg-amber-500 text-stone-950' : 'border-white bg-black/80 text-white'}`}>
                      {on ? <Check className="w-4 h-4" strokeWidth={3} /> : <span className="block h-3.5 w-3.5 rounded-sm border border-white/80" />}
                    </span>
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
                    className="w-16 h-20 shrink-0 rounded-lg overflow-hidden bg-stone-900">
                    <img src={p.watermarked_url} alt="" draggable={false} onContextMenu={e => e.preventDefault()}
                      className="h-full w-full object-cover" />
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
                        className={`text-xs rounded-full px-3 py-1.5 border ${c.download ? 'bg-amber-500 text-stone-950 border-amber-500' : 'border-white/15'}`}>
                        Татах · {money(dlp)}
                      </button>
                      {!printsOpen && prints.length > 0 && <p className="text-xs text-stone-500 mt-2">Угаалгах хугацаа дууссан</p>}
                      {printsOpen && prints.length > 0 && (
                        <button type="button" onClick={() => setChoice(c.photoId, { print: !c.print, printSize: c.printSize || prints[0][0] })}
                          className={`text-xs rounded-full px-3 py-1.5 border ${c.print ? 'bg-amber-500 text-stone-950 border-amber-500' : 'border-white/15'}`}>
                          Угаалгах · {money(Number(p.print_prices[c.printSize || prints[0][0]] || prints[0][1]))}
                        </button>
                      )}
                    </div>
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
            <p className="text-right font-bold">Нийт {money(total)}</p>
            <button type="button" disabled={!ready || total <= 0} onClick={beginPay}
              className="w-full bg-amber-500 disabled:opacity-40 text-stone-950 font-bold rounded-xl py-3.5">
              {total > 0 ? `QPay-ээр төлөх · ${money(total)}` : 'Үнэ байхгүй'}
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
                  {dlFiles.length > 0 && (
                    <div className="space-y-2">
                      {live.map(f => {
                        const got = dlGot.has(f.purchaseId);
                        return (
                          <div key={f.purchaseId} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-2">
                            <p className="min-w-0 flex-1 truncate text-sm">{f.filename}</p>
                            <button type="button" disabled={dlBusy} onClick={() => downloadPaid([f])}
                              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                                got ? 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-300' : 'bg-amber-500 text-stone-950'
                              }`}>
                              {got ? 'Татсан ✓' : 'Татах'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button type="button" onClick={() => downloadPaid()} disabled={dlBusy}
                    className={`w-full font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 ${
                      allGot
                        ? 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-300 py-3.5'
                        : 'bg-amber-500 text-stone-950 text-base py-4'
                    }`}>
                    {dlBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {label}
                  </button>
                </>
              );
            })()}
            {dlNote && <p className="text-sm text-stone-300">{dlNote}</p>}
            {paidInvoice && (
              <a href={`/receipt/${paidInvoice}`} className="block text-center text-amber-300 text-sm underline">Баримт үзэх</a>
            )}
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

      {session.step === 'browse' && (
        <div className="shrink-0 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 flex items-center gap-3 bg-stone-950">
          <p className="text-sm flex-1">{session.selected.length} зураг · {money(running)}</p>
          <button type="button" onClick={finishSelect} disabled={!session.selected.length}
            className="bg-amber-500 disabled:opacity-40 text-stone-950 font-bold rounded-xl px-4 py-3 text-sm">
            Сонгож дууслаа
          </button>
        </div>
      )}
    </div>
  );
}
