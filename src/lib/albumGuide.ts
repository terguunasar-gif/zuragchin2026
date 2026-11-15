/** Монгол гар утас: 8 орон, эсвэл 976-аар эхэлсэн. */
export function normalizeMnPhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (/^\d{8}$/.test(d)) return d;
  if (/^976\d{8}$/.test(d)) return d.slice(3);
  return null;
}

export type GuideStep = 'welcome' | 'greet' | 'topics' | 'browse' | 'choices' | 'done';

export interface GuideChoice {
  photoId: string;
  download: boolean;
  print: boolean;
  printSize?: string;
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
      step: (['welcome', 'greet', 'topics', 'browse', 'choices', 'done'] as const).includes(s.step as GuideStep)
        ? s.step as GuideStep : 'welcome',
    };
  } catch {
    return emptyGuide();
  }
}

export function saveGuide(albumId: string, session: GuideSession) {
  try { localStorage.setItem(keyOf(albumId), JSON.stringify(session)); } catch { /* хувийн цонх */ }
}

export function clearGuide(albumId: string) {
  try { localStorage.removeItem(keyOf(albumId)); } catch { /* */ }
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
