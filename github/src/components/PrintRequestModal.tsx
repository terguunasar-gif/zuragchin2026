import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Minus, Phone, Plus, Printer, Trash2, X } from 'lucide-react';
import { publicDb } from '../lib/supabase';
import { useI18n } from '../lib/i18n';

export const PRINT_REQUEST_SIZES = ['10x15', '13x18', '15x21', '20x30', 'A4'] as const;

export interface PrintPick { photoId: string; previewUrl: string; size: string; qty: number }

/**
 * «Үнэгүй хуваалцах» цомог: зочин угаалгах зургаа сонгоод хүсэлт илгээнэ.
 * Сайт төлбөр авахгүй — зурагчин / зохион байгуулагч холбогдож тооцоогоо хийнэ.
 */
export default function PrintRequestModal({ albumId, picks, onChange, onClose, onSent }: {
  albumId: string;
  picks: PrintPick[];
  onChange: (picks: PrintPick[]) => void;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [contact, setContact] = useState<Record<string, string> | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    publicDb.from('albums').select('contact_info').eq('id', albumId).maybeSingle()
      .then(({ data }) => {
        const ci = (data as { contact_info?: Record<string, string> } | null)?.contact_info;
        if (ci && Object.values(ci).some(v => !!v)) setContact(ci);
      });
  }, [albumId]);

  const update = (i: number, patch: Partial<PrintPick>) => onChange(picks.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const keepVisible = (e: { currentTarget: HTMLElement }) => {
    const el = e.currentTarget;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
  };

  async function submit() {
    setError('');
    if (name.trim().length < 2) { setError(t('Нэрээ оруулна уу')); return; }
    if (!/^\d{8,12}$/.test(phone)) { setError(t('Утасны дугаараа оруулна уу (8+ тоо)')); return; }
    if (picks.length === 0) return;
    setBusy(true);
    const { error: err } = await publicDb.rpc('submit_print_request', {
      p_album_id: albumId,
      p_items: picks.map(p => ({ photo_id: p.photoId, size: p.size, qty: p.qty })),
      p_name: name.trim(), p_phone: phone, p_note: note.trim(),
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setSent(true);
    onSent();
  }

  const total = picks.reduce((s, p) => s + p.qty, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-stone-900 border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl max-h-[92dvh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-stone-900 z-10">
          <h2 className="text-white font-semibold flex items-center gap-2"><Printer className="w-5 h-5 text-amber-400" /> {t('Угаалгах хүсэлт')}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {sent ? (
          <div className="p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-white font-semibold text-lg">{t('Хүсэлт илгээгдлээ!')}</p>
            <p className="text-stone-400 text-sm mt-2">{t('Зурагчин эсвэл зохион байгуулагч тантай утсаар холбогдож, үнэ болон хүлээлгэн өгөх талаар тохиролцоно.')}</p>
            {contact && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 mt-4 text-sm text-left space-y-1">
                <p className="text-stone-400 text-xs">{t('Холбоо барих')}</p>
                {contact.phone && <a href={`tel:${contact.phone}`} className="text-sky-400 flex items-center gap-1.5"><Phone className="w-4 h-4" />{contact.phone}</a>}
                {contact.facebook && <a href={contact.facebook} target="_blank" rel="noreferrer" className="text-sky-400 block truncate">{contact.facebook}</a>}
              </div>
            )}
            <button onClick={onClose} className="mt-5 w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl">{t('Хаах')}</button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-stone-400 text-xs leading-relaxed bg-white/5 border border-white/10 rounded-xl p-3">
              {t('Энэ хүсэлтэд одоо төлбөр төлөхгүй. Зурагчин тантай холбогдож угаалгах үнэ, хүлээлгэн өгөхийг тохиролцоно.')}
            </p>

            <div className="space-y-2">
              {picks.map((p, i) => (
                <div key={p.photoId} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-2">
                  <img src={p.previewUrl} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                  <select value={p.size} onChange={e => update(i, { size: e.target.value })}
                    className="bg-stone-900 border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 outline-none">
                    {PRINT_REQUEST_SIZES.map(s => <option key={s} value={s}>{s.replace('x', '×')}</option>)}
                  </select>
                  <div className="flex items-center gap-1 ml-auto">
                    <button onClick={() => update(i, { qty: Math.max(1, p.qty - 1) })} className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="text-white text-sm w-6 text-center">{p.qty}</span>
                    <button onClick={() => update(i, { qty: Math.min(50, p.qty + 1) })} className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <button onClick={() => onChange(picks.filter((_, j) => j !== i))} className="text-stone-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <p className="text-stone-500 text-xs text-right">{t('Нийт {n} хувь', { n: total })}</p>
            </div>

            <div className="space-y-2">
              <input value={name} onChange={e => setName(e.target.value)} onFocus={keepVisible} placeholder={t('Таны нэр')}
                enterKeyHint="next" autoComplete="name" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); phoneRef.current?.focus(); } }}
                className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input ref={phoneRef} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 12))} onFocus={keepVisible}
                type="tel" inputMode="numeric" autoComplete="tel" placeholder={t('Утасны дугаар')}
                className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-4 py-2.5 text-sm outline-none" />
              <textarea value={note} onChange={e => setNote(e.target.value)} onFocus={keepVisible} rows={2} maxLength={500}
                placeholder={t('Нэмэлт тайлбар (заавал биш)')}
                className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 text-white rounded-xl px-4 py-2.5 text-sm outline-none resize-none" />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={submit} disabled={busy || picks.length === 0}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t('Хүсэлт илгээх')}
            </button>
            <div className="h-[30vh] sm:hidden" aria-hidden />
          </div>
        )}
      </div>
    </div>
  );
}
