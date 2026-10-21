import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Star, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const PORTFOLIO_MAX = 5;
const MAX_EDGE = 2000;

/** Зурагт «© Нэр · zuragchin.mn» тамгыг шингээнэ (тамгагүй хувилбар хадгалагдахгүй) */
async function stampImage(file: File, name: string): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('Зураг уншиж чадсангүй')); i.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);

    const text = `© ${name.trim() || 'Зурагчин'} · zuragchin.mn`;
    const base = Math.min(w, h);
    let size = Math.max(16, Math.round(base * 0.045));
    ctx.font = `700 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    // Хэт урт нэр зургаас хэтрэхгүй
    while (ctx.measureText(text).width > w * 0.8 && size > 12) {
      size -= 1; ctx.font = `700 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    }
    const tw = ctx.measureText(text).width;
    const padX = size * 0.7, padY = size * 0.45, margin = Math.round(base * 0.03);
    const bw = tw + padX * 2, bh = size + padY * 2;
    const x = w - bw - margin, y = h - bh - margin;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const r = bh / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + bw - r, y); ctx.arc(x + bw - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + r, y + bh); ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + padX, y + bh / 2 + size * 0.04);

    return await new Promise<Blob>((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('Хөрвүүлж чадсангүй'))), 'image/jpeg', 0.88));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Зурагчны профайл: өөрийн авсан шилдэг 5 зураг. Байршуулах бүрт шууд хадгална. */
export default function PortfolioEditor({ userId, profileId, urls, onChange, name }: {
  userId: string;
  /** Тамганд бичигдэх зурагчны нэр */
  name: string;
  /** photographer_profiles.id — профайл хадгалагдаагүй бол null */
  profileId: string | null;
  urls: string[];
  onChange: (urls: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function persist(next: string[]) {
    if (!profileId) { setError('Эхлээд доорх «Хадгалах» товчоор профайлаа хадгална уу.'); return false; }
    const { error: err } = await supabase.from('photographer_profiles').update({ portfolio_urls: next }).eq('id', profileId);
    if (err) {
      setError(/portfolio_urls/.test(err.message) ? 'SQL (update-79) ажиллуулаагүй байна.' : 'Хадгалж чадсангүй: ' + err.message);
      return false;
    }
    onChange(next);
    return true;
  }

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    const room = PORTFOLIO_MAX - urls.length;
    const list = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, room);
    if (!list.length) return;
    setBusy(true);
    const added: string[] = [];
    for (const file of list) {
      try {
        // 2000px хүртэл жижигрүүлж «© Нэр · zuragchin.mn» тамга шингээнэ — эх файл хадгалагдахгүй
        const blob = await stampImage(file, name);
        const path = `${userId}/portfolio/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from('covers').upload(path, blob, { contentType: 'image/jpeg' });
        if (upErr) throw new Error(upErr.message);
        added.push(supabase.storage.from('covers').getPublicUrl(path).data.publicUrl);
      } catch (e) {
        setError('Зураг байршуулж чадсангүй: ' + (e instanceof Error ? e.message : ''));
      }
    }
    if (added.length) await persist([...urls, ...added]);
    setBusy(false);
  }

  async function remove(url: string) {
    if (!window.confirm('Энэ зургийг портфолиогоос хасах уу?')) return;
    const ok = await persist(urls.filter(u => u !== url));
    const marker = '/covers/';
    if (ok && url.includes(marker)) {
      await supabase.storage.from('covers').remove([url.slice(url.indexOf(marker) + marker.length).split('?')[0]]).catch(() => null);
    }
  }

  async function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= urls.length) return;
    const next = [...urls];
    [next[i], next[j]] = [next[j], next[i]];
    await persist(next);
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-white font-semibold flex items-center gap-2"><Star className="w-4 h-4 text-amber-400" /> Миний бүтээлүүд</h3>
          <p className="text-stone-500 text-xs mt-1">
            Өөрийн авсан шилдэг {PORTFOLIO_MAX} хүртэл зургаа оруулна уу. Профайл хуудсанд тань том харагдаж, захиалагчид таны ур чадварыг харна.
            Эхний зураг хамгийн том гарна. Зураг бүрд «© {name || 'Таны нэр'} · zuragchin.mn» тамга автоматаар суулгана.
          </p>
        </div>
        <span className="text-stone-400 text-sm flex-shrink-0">{urls.length}/{PORTFOLIO_MAX}</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {urls.map((u, i) => (
          <div key={u} className="relative aspect-square rounded-xl overflow-hidden bg-stone-900 border border-white/10 group">
            <img src={u} alt={`Бүтээл ${i + 1}`} className="w-full h-full object-cover" />
            {i === 0 && <span className="absolute top-1.5 left-1.5 bg-amber-500 text-stone-950 text-[10px] font-bold px-1.5 py-0.5 rounded">Нүүр</span>}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-1 bg-gradient-to-t from-black/80 to-transparent">
              <button onClick={() => move(i, -1)} disabled={i === 0 || busy} aria-label="Зүүн тийш" className="p-1.5 text-white disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => remove(u)} disabled={busy} aria-label="Хасах" className="p-1.5 text-white hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              <button onClick={() => move(i, 1)} disabled={i === urls.length - 1 || busy} aria-label="Баруун тийш" className="p-1.5 text-white disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {urls.length < PORTFOLIO_MAX && (
          <button onClick={() => input.current?.click()} disabled={busy}
            className="aspect-square rounded-xl border-2 border-dashed border-white/15 hover:border-amber-500/50 text-stone-400 hover:text-amber-300 flex flex-col items-center justify-center gap-1.5 text-xs transition-colors">
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
            {busy ? 'Байршуулж байна…' : 'Зураг нэмэх'}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
        onChange={e => { add(e.target.files); e.target.value = ''; }} />
      {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
    </div>
  );
}
