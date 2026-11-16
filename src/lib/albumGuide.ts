import type { PhotoAdjust, PrintCrop } from './photoAdjust';
import { useEffect, useState } from 'react';

/** Цомгийн худалдан авалтын чат нээлттэй үед сайтын «Туслах» товчийг нууна. */
let guideActive = false;
const guideListeners = new Set<(active: boolean) => void>();

export function setAlbumGuideActive(active: boolean) {
  if (guideActive === active) return;
  guideActive = active;
  guideListeners.forEach(fn => fn(active));
}

export function useAlbumGuideActive() {
  const [active, setActive] = useState(guideActive);
  useEffect(() => {
    setActive(guideActive);
    guideListeners.add(setActive);
    return () => { guideListeners.delete(setActive); };
  }, []);
  return active;
}

/** Монгол гар утас: 8 орон, эсвэл 976-аар эхэлсэн. */
export function normalizeMnPhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (/^\d{8}$/.test(d)) return d;
  if (/^976\d{8}$/.test(d)) return d.slice(3);
  return null;
}

export type GuideStep = 'welcome' | 'greet' | 'topics' | 'browse' | 'choices' | 'pay' | 'done';

export interface GuideInvoice {
  invoiceId: string;
  qrImage: string;
  qrText: string;
  urls: { name: string; description?: string; link: string; logo?: string }[];
  grossTotal: number;
}

export interface GuideChoice {
  photoId: string;
  download: boolean;
  print: boolean;
  printSize?: string;
  /** Төлөхөөс өмнө хийсэн засвар (тайралт, гэрэл/өнгө) — татах ба угаалгах тус тусдаа */
  editDl?: PhotoAdjust & PrintCrop;
  editPr?: PhotoAdjust & PrintCrop;
}

export interface GuideCartLine {
  photoId: string;
  photographerId: string;
  previewUrl: string;
  filename: string;
  type: 'download' | 'print';
  printSize?: string;
  price: number;
}

export interface GuideMsg { role: 'user' | 'bot'; text: string }

export interface GuideSession {
  token: string;
  name: string;
  phone: string;
  step: GuideStep;
  folderId: string | null;
  selected: string[];
  choices: GuideChoice[];
  messages: GuideMsg[];
  declined?: boolean;
  /** Дахин орсон зочин. Нэр, утас аль хэдийн мэдэгдсэн. */
  known?: boolean;
  /** Энэ төхөөрөмж дээр төлсөн нэхэмжлэхүүд. Утасны дугаараар хайхгүй. */
  paidInvoices?: string[];
  owned?: OwnedPhoto[];
  /** QPay нэхэмжлэх. Чат доторх төлбөр дахин ачаалахад үргэлжилнэ. */
  invoice?: GuideInvoice | null;
}

export interface OwnedPhoto {
  photoId: string;
  invoiceId: string;
  type: 'download' | 'print';
  filename: string;
  expiresAt?: string | null;
}

const keyOf = (albumId: string) => `zm_album_guide_${albumId}`;

export function emptyGuide(): GuideSession {
  return {
    token: crypto.randomUUID(),
    name: '',
    phone: '',
    step: 'welcome',
    folderId: null,
    selected: [],
    choices: [],
    messages: [],
  };
}

export function loadGuide(albumId: string): GuideSession {
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(albumId)) || 'null');
    if (!raw || typeof raw !== 'object') return emptyGuide();
    const s = raw as Partial<GuideSession>;
    return {
      ...emptyGuide(),
      ...s,
      token: typeof s.token === 'string' && s.token ? s.token : crypto.randomUUID(),
      selected: Array.isArray(s.selected) ? s.selected.filter(x => typeof x === 'string') : [],
      choices: Array.isArray(s.choices) ? s.choices : [],
      messages: Array.isArray(s.messages) ? s.messages.slice(-30) : [],
      invoice: readGuideInvoice(s.invoice),
      paidInvoices: readIdList(s.paidInvoices),
      owned: readOwned(s.owned),
      known: s.known === true,
      step: (['welcome', 'greet', 'topics', 'browse', 'choices', 'pay', 'done'] as const).includes(s.step as GuideStep)
        ? s.step as GuideStep : 'welcome',
    };
  } catch {
    return emptyGuide();
  }
}

export function saveGuide(albumId: string, session: GuideSession) {
  try { localStorage.setItem(keyOf(albumId), JSON.stringify(session)); } catch { /* хувийн цонх */ }
}

export function returningWelcome(name: string, albumName: string): string {
  return `Сайн байна уу, ${name}! «${albumName}» цомогт орсон байна. Цомог үзэх үү?`;
}

const MID_FLOW = new Set<GuideStep>(['topics', 'browse', 'choices', 'pay']);

/** Нэр нь хадгалагдсан зочин дахин нээхэд мэндчилгээ. Захиалга дундуурх алхмыг хэвээр үлдээнэ. */
export function prepareGuideEntry(session: GuideSession, albumName: string): GuideSession {
  if (session.name.trim().length < 2) return session;
  if (MID_FLOW.has(session.step)) return session;
  return {
    ...session,
    known: true,
    declined: false,
    step: 'greet',
    messages: [{ role: 'bot', text: returningWelcome(session.name.trim(), albumName) }],
  };
}

export function downloadExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t < now;
}

/** Нэг зураг нэг мөр. Татах, угаалгах нь тусдаа үлдэнэ. */
export function groupOwned(owned: OwnedPhoto[]): { photoId: string; filename: string; download?: OwnedPhoto; print?: OwnedPhoto }[] {
  const map = new Map<string, { photoId: string; filename: string; download?: OwnedPhoto; print?: OwnedPhoto }>();
  for (const item of owned) {
    if (!item.photoId) continue;
    const row = map.get(item.photoId) ?? { photoId: item.photoId, filename: item.filename };
    if (item.type === 'download') row.download = item;
    if (item.type === 'print') row.print = item;
    if (item.filename) row.filename = item.filename;
    map.set(item.photoId, row);
  }
  return [...map.values()];
}

export function rememberPurchase(
  session: GuideSession,
  invoiceId: string,
  items: { photoId: string; type: 'download' | 'print'; filename: string }[],
): GuideSession {
  const paidInvoices = [...new Set([...(session.paidInvoices ?? []), invoiceId].filter(Boolean))];
  const owned = [...(session.owned ?? [])];
  for (const item of items) {
    if (!item.photoId) continue;
    const dup = owned.some(o => o.photoId === item.photoId && o.invoiceId === invoiceId && o.type === item.type);
    if (!dup) owned.push({ photoId: item.photoId, invoiceId, type: item.type, filename: item.filename });
  }
  return {
    ...session,
    paidInvoices,
    owned,
    known: true,
    step: 'welcome',
    selected: [],
    choices: [],
    messages: [],
    invoice: null,
    folderId: null,
  };
}

function readIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

function readOwned(raw: unknown): OwnedPhoto[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnedPhoto[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Partial<OwnedPhoto>;
    if (typeof o.photoId !== 'string' || typeof o.invoiceId !== 'string') continue;
    if (o.type !== 'download' && o.type !== 'print') continue;
    out.push({
      photoId: o.photoId,
      invoiceId: o.invoiceId,
      type: o.type,
      filename: typeof o.filename === 'string' ? o.filename : '',
      expiresAt: typeof o.expiresAt === 'string' ? o.expiresAt : null,
    });
  }
  return out;
}

export function guidePaySummary(name: string, photoCount: number, downloads: number, prints: number, totalLabel: string): string {
  return `${name}, та ${photoCount} зураг сонгосон байна (татах ${downloads}, угаалгах ${prints}). Нийт ${totalLabel} төлнө.`;
}

export function readGuideInvoice(raw: unknown): GuideInvoice | null {
  if (!raw || typeof raw !== 'object') return null;
  const i = raw as Partial<GuideInvoice>;
  if (typeof i.invoiceId !== 'string' || !i.invoiceId) return null;
  const urls = (Array.isArray(i.urls) ? i.urls as unknown[] : []).filter((u): u is GuideInvoice['urls'][number] => {
    if (!u || typeof u !== 'object') return false;
    const row = u as { name?: unknown; link?: unknown };
    return typeof row.name === 'string' && typeof row.link === 'string';
  });
  return {
    invoiceId: i.invoiceId,
    qrImage: typeof i.qrImage === 'string' ? i.qrImage : '',
    qrText: typeof i.qrText === 'string' ? i.qrText : '',
    urls,
    grossTotal: Number(i.grossTotal) || 0,
  };
}

export function clearGuide(albumId: string) {
  try { localStorage.removeItem(keyOf(albumId)); } catch { /* */ }
}

/** Сагснаас нэг зургийг хасна. Сонголтоос ч гарна. Хоосон болвол зургийн тор руу буцна. */
export function dropGuideCartPhoto(session: GuideSession, photoId: string): GuideSession {
  if (!session.choices.some(c => c.photoId === photoId) && !session.selected.includes(photoId)) return session;
  const choices = session.choices.filter(c => c.photoId !== photoId);
  const selected = session.selected.filter(id => id !== photoId);
  if (session.step === 'choices' && choices.length === 0) {
    return {
      ...session,
      choices,
      selected,
      step: 'browse',
      messages: [...session.messages, { role: 'bot', text: 'Сагс хоосон боллоо. Зургаа дахин сонгоно уу.' }],
    };
  }
  return { ...session, choices, selected };
}

export type GuideAction = 'yes' | 'no' | 'folder' | null;

/** Дүрэмт хариу. Танихгүй бол null — тэгвэл help-bot руу өгнө. */
export function ruleReply(text: string, folders: { id: string; name: string }[]): { action: GuideAction; folderId?: string; reply: string } | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  if (/^(тийм|за|үзье|узье|ок|ok|yes|зөв|авъя|авья|үзэх|узэх)(?:\s|$|[!.?])/.test(q)) {
    return { action: 'yes', reply: 'За. Зургуудаа харцгаая.' };
  }
  if (/^(үгүй|угуй|боли|байхгүй|no)(?:\s|$|[!.?])/.test(q)) {
    return { action: 'no', reply: 'За. Цомгийг энгийнээр нээлээ.' };
  }
  const hit = folders.find(f => f.name.trim().toLowerCase() === q || q.includes(f.name.trim().toLowerCase()));
  if (hit && hit.name.trim().length >= 2) {
    return { action: 'folder', folderId: hit.id, reply: `«${hit.name}» сэдвийн зургууд.` };
  }
  return null;
}

/** Сайтын help-bot байвал чөлөөт асуултад ашиглана. Амжилтгүй бол null. */
export async function askHelpBot(text: string, path: string): Promise<string | null> {
  const base = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}/functions/v1/help-bot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        session_id: 'guide',
        lang: 'mn',
        path,
        messages: [{ role: 'user', text }],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => ({}));
    return typeof j.answer === 'string' && j.answer.trim() ? j.answer.trim() : null;
  } catch {
    return null;
  }
}

/** Админд харагдах lead. Хүснэгт байхгүй бол чимээгүй алгасна. */
export async function syncGuideLead(albumId: string, session: GuideSession) {
  if (!session.name || !session.phone) return;
  try {
    const { publicDb } = await import('./supabase');
    await publicDb.rpc('upsert_album_guide_lead', {
      p_album_id: albumId,
      p_token: session.token,
      p_name: session.name.slice(0, 80),
      p_phone: session.phone,
      p_step: session.step,
      p_folder_id: session.folderId,
      p_selected: session.selected,
      p_choices: session.choices,
    });
  } catch { /* migration хараахан хэрэглээгүй */ }
}

/** Зөвхөн энэ lead_token-д бүртгэлтэй нэхэмжлэхийн төлсөн зураг. Утасаар хайхгүй. RPC байхгүй бол null. */
export async function fetchLeadPurchases(albumId: string, token: string): Promise<OwnedPhoto[] | null> {
  if (!albumId || !token) return null;
  try {
    const { publicDb } = await import('./supabase');
    const { data, error } = await publicDb.rpc('guide_lead_purchases', { p_album_id: albumId, p_token: token });
    if (error || !Array.isArray(data)) return null;
    return readOwned(data.map((row: Record<string, unknown>) => ({
      photoId: row.photo_id,
      invoiceId: row.qpay_invoice_id,
      type: row.type,
      filename: row.filename,
      expiresAt: row.download_expires_at,
    })));
  } catch {
    return null;
  }
}

export function mergeOwned(local: OwnedPhoto[], remote: OwnedPhoto[]): OwnedPhoto[] {
  const out = [...local];
  for (const item of remote) {
    const i = out.findIndex(o => o.photoId === item.photoId && o.invoiceId === item.invoiceId && o.type === item.type);
    if (i < 0) out.push(item);
    else if (item.expiresAt) out[i] = { ...out[i], expiresAt: item.expiresAt, filename: item.filename || out[i].filename };
  }
  return out;
}

export async function markGuidePaid(albumId: string, token: string, invoiceId: string) {
  try {
    const { publicDb } = await import('./supabase');
    await publicDb.rpc('mark_album_guide_paid', {
      p_album_id: albumId,
      p_token: token,
      p_invoice: invoiceId,
    });
  } catch { /* */ }
}
