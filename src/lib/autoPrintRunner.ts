import { supabase } from './supabase';
import { readAutoPrintAlbums } from './autoPrintAlbums';

/**
 * Автомат принт — сайтын АЛЬ Ч хуудсанд ажиллана (админ табыг солих, самбар руу ороход зогсохгүй).
 * Энэ төхөөрөмж дээр «Асаах» дарсан үед 12 сек тутам авто принт асаалттай цомгийн шинэ төлөгдсөн
 * угаах захиалгыг шалгаж, дарааллаар нь хэвлэнэ.
 */
const DEVICE_KEY = 'zm_autoprint_device';
const OLD_KEYS = ['zm_autoprint_admin', 'zm_autoprint_organizer', 'zm_autoprint_photographer'];
const POLL_MS = 12000;
const FRESH_MS = 15 * 60 * 1000;

export type Source = 'admin' | 'owner';
export interface AutoPrintState {
  on: boolean;
  busy: string | null;
  queued: number;
  albums: number | null;
  log: { t: string; text: string; ok: boolean }[];
}

let state: AutoPrintState = { on: readOn(), busy: null, queued: 0, albums: null, log: [] };
const listeners = new Set<(s: AutoPrintState) => void>();
let source: Source | null = null;
let timer = 0;
let seen: Set<string> | null = null;
let startedAt = 0;
const queue: { id: string; label: string }[] = [];
let running = false;

function readOn(): boolean {
  try {
    if (localStorage.getItem(DEVICE_KEY) === '1') return true;
    // Өмнөх хувилбарын тохиргоо
    return OLD_KEYS.some(k => localStorage.getItem(k) === '1');
  } catch { return false; }
}

function set(p: Partial<AutoPrintState>) {
  state = { ...state, ...p };
  listeners.forEach(l => l(state));
}

function addLog(text: string, ok = true) {
  const t = new Date().toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  set({ log: [{ t, text, ok }, ...state.log].slice(0, 8) });
}

export function getAutoPrintState() { return state; }
export function subscribeAutoPrint(l: (s: AutoPrintState) => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Нэвтэрсэн хэрэглэгчийн эрх — админ бол бүх цомог, эс бөгөөс өөрийн цомог/зураг */
export function setAutoPrintSource(next: Source | null) {
  source = next;
  restart();
}

export function setAutoPrintOn(on: boolean) {
  try {
    localStorage.setItem(DEVICE_KEY, on ? '1' : '0');
    OLD_KEYS.forEach(k => localStorage.removeItem(k));
  } catch { /* */ }
  set({ on });
  if (!on) { queue.length = 0; set({ queued: 0 }); addLog('Унтраалаа.'); }
  restart();
}

function restart() {
  window.clearInterval(timer);
  timer = 0;
  seen = null;
  if (!state.on || !source) return;
  startedAt = Date.now();
  void tick();
  timer = window.setInterval(() => { void tick(); }, POLL_MS);
}

async function fetchPending(): Promise<{ id: string; label: string; createdAt: string }[]> {
  const albums = await readAutoPrintAlbums();
  set({ albums: albums.size });
  if (!albums.size) return [];
  if (source === 'admin') {
    const { data, error } = await supabase.from('purchases')
      .select('id,buyer_name,buyer_phone,print_size,created_at,photo_uploads(filename)')
      .eq('type', 'print').eq('payment_status', 'paid').eq('print_status', 'pending')
      .in('album_id', [...albums])
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return ((data ?? []) as unknown as { id: string; buyer_name: string | null; buyer_phone: string | null; print_size: string | null; created_at: string; photo_uploads: { filename: string } | null }[])
      .map(p => ({ id: p.id, createdAt: p.created_at, label: `${p.photo_uploads?.filename ?? 'зураг'} · ${(p.print_size ?? '').replace('x', '×')} · ${p.buyer_name || p.buyer_phone || ''}` }));
  }
  const { data, error } = await supabase.rpc('my_sales');
  if (error) throw error;
  return ((data ?? []) as { id: string; type: string; print_status: string; album_id: string; is_my_album: boolean; is_my_photo: boolean; filename: string | null; print_size: string; buyer_name: string; buyer_phone: string; created_at: string }[])
    .filter(r => r.type === 'print' && r.print_status === 'pending' && albums.has(r.album_id) && (r.is_my_album || r.is_my_photo))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(r => ({ id: r.id, createdAt: r.created_at, label: `${r.filename ?? 'зураг'} · ${r.print_size.replace('x', '×')} · ${r.buyer_name || r.buyer_phone || ''}` }));
}

async function tick() {
  if (!state.on || !source) return;
  let items: { id: string; label: string; createdAt: string }[];
  try { items = await fetchPending(); } catch (e) {
    addLog(`Захиалга шалгаж чадсангүй: ${e instanceof Error ? e.message : String(e)}`, false);
    return;
  }
  if (!seen) {
    seen = new Set(items.map(i => i.id));
    addLog(items.length
      ? `Асаалттай. Өмнөх ${items.length} хэвлээгүй захиалгыг «Принт» товчоор хэвлэнэ. Шинэ захиалга хүлээж байна…`
      : 'Асаалттай. Шинэ захиалга хүлээж байна…');
    return;
  }
  const unseen = items.filter(i => !seen!.has(i.id));
  unseen.forEach(i => seen!.add(i.id));
  const fresh = unseen.filter(i => Date.parse(i.createdAt) > startedAt - FRESH_MS).reverse();
  if (!fresh.length) return;
  queue.push(...fresh);
  set({ queued: queue.length });
  void drain();
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length && state.on) {
      const item = queue.shift()!;
      set({ queued: queue.length, busy: item.label });
      try {
        // Хэвлэх код (зураг, лого боловсруулах) том тул зөвхөн хэрэгтэй үед ачаална
        const { printPurchaseSilently } = await import('./printPhoto');
        await printPurchaseSilently(item.id);
        addLog(`Хэвлэлээ: ${item.label}`);
        window.dispatchEvent(new CustomEvent('zm-auto-printed', { detail: { id: item.id } }));
      } catch (e) {
        addLog(`Алдаа (${item.label}): ${e instanceof Error ? e.message : 'хэвлэж чадсангүй'} — «Принт» товчоор дахин хэвлэнэ үү`, false);
      }
    }
  } finally {
    running = false;
    set({ busy: null, queued: 0 });
  }
}
