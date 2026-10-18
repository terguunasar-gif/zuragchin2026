import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { unlockAlbum } from '../lib/albumLock';
import { BrandLogo } from './BrandMark';
import { useI18n } from '../lib/i18n';

/** Түгжээтэй цомог — 4 оронтой код оруулж нээнэ */
export default function AlbumPinGate({ albumId, albumName, onUnlocked }: {
  albumId: string; albumName: string; onUnlocked: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [digits, setDigits] = useState(['', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  async function submit(pin: string) {
    if (pin.length !== 4 || busy) return;
    setBusy(true); setError('');
    const r = await unlockAlbum(albumId, pin);
    setBusy(false);
    if (r.ok) { onUnlocked(); return; }
    setError(r.error || 'Код буруу байна');
    setDigits(['', '', '', '']);
    refs.current[0]?.focus();
  }

  function change(i: number, raw: string) {
    const v = raw.replace(/\D/g, '');
    if (v.length > 1) { // бүхэлд нь буулгасан
      const all = v.slice(0, 4).split('');
      const next = [0, 1, 2, 3].map(k => all[k] ?? '');
      setDigits(next);
      refs.current[Math.min(all.length, 3)]?.focus();
      if (all.length === 4) submit(all.join(''));
      return;
    }
    const next = [...digits]; next[i] = v; setDigits(next);
    if (v && i < 3) refs.current[i + 1]?.focus();
    if (next.every(d => d)) submit(next.join(''));
  }

  return (
    <div className="min-h-screen bg-stone-950 text-white flex flex-col">
      <header className="px-6 py-4">
        <button onClick={() => navigate('/')}><BrandLogo /></button>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto mb-5">
            <Lock className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-xl font-bold">{albumName}</h1>
          <p className="text-stone-400 text-sm mt-2">{t('Энэ цомог хаалттай. Цомог үүсгэгчээс авсан 4 оронтой кодоо оруулна уу.')}</p>
          <div className="flex justify-center gap-3 mt-7">
            {digits.map((d, i) => (
              <input key={i} ref={el => { refs.current[i] = el; }} value={d} autoFocus={i === 0}
                inputMode="numeric" autoComplete="one-time-code" maxLength={i === 0 ? 4 : 1} aria-label={`${i + 1}-р орон`}
                onChange={e => change(i, e.target.value)}
                onKeyDown={e => { if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus(); }}
                disabled={busy}
                className={`w-14 h-16 rounded-xl bg-white/5 border text-center text-3xl font-bold font-mono outline-none transition-colors ${
                  error ? 'border-red-500/60' : 'border-white/15 focus:border-amber-500'}`} />
            ))}
          </div>
          <div className="h-6 mt-4 text-sm">
            {busy ? <Loader2 className="w-5 h-5 text-amber-400 animate-spin mx-auto" /> : error && <p className="text-red-400">{t(error)}</p>}
          </div>
          <p className="text-stone-600 text-xs mt-6">{t('Аюулгүй байдлын үүднээс цомог руу дахин орох бүрт код асууна.')}</p>
        </div>
      </main>
    </div>
  );
}
