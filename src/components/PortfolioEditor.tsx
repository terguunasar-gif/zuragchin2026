import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Star, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyWatermark } from '../lib/watermark';

export const PORTFOLIO_MAX = 5;

/** Зурагчны профайл: өөрийн авсан шилдэг 5 зураг. Байршуулах бүрт шууд хадгална. */
export default function PortfolioEditor({ userId, profileId, urls, onChange }: {
  userId: string;
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
        // Вэбэд хурдан ачаалагдах хэмжээнд (2000px) шахна — эх файлыг хадгалахгүй
        const blob = await applyWatermark(file, { type: 'none', value: '', position: 'bottom-right', maxSize: 2000, quality: 0.88 });
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
            Эхний зураг хамгийн том гарна.
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
