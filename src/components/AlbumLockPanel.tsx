import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Lock, Unlock, RefreshCw, Pencil } from 'lucide-react';
import { AlbumLockInfo, albumLockInfo, setAlbumLock } from '../lib/albumLock';
import QpayPayModal from './QpayPayModal';

/** Цомгийн эзэнд: цомгийг 4 оронтой кодоор түгжих (QR цонхонд) */
export default function AlbumLockPanel({ albumId, albumUrl }: { albumId: string; albumUrl: string }) {
  const [info, setInfo] = useState<AlbumLockInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function reload() {
    setInfo(await albumLockInfo(albumId));
    setLoading(false);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [albumId]);

  async function apply(enabled: boolean, pin?: string | null) {
    setBusy(true); setError('');
    try {
      const newPin = await setAlbumLock(albumId, enabled, pin);
      setInfo(i => (i ? { ...i, enabled, pin: newPin } : i));
      setEditing(false); setPinInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  function copyShare() {
    if (!info) return;
    const text = `Цомог: ${albumUrl}\nНэвтрэх код: ${info.pin}`;
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  if (loading) return <div className="mt-4 flex justify-center"><Loader2 className="w-5 h-5 text-stone-500 animate-spin" /></div>;
  if (!info) return null; // SQL ажиллуулаагүй эсвэл эзэн биш

  return (
    <div className="mt-4 border border-white/10 rounded-xl p-4 text-left">
      {!info.paid ? (
        <>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0"><Lock className="w-4 h-4 text-amber-400" /></div>
            <div>
              <p className="text-white font-semibold text-sm">Цомгийг кодоор түгжих</p>
              <p className="text-stone-400 text-xs mt-0.5 leading-relaxed">
                Тусгай хүмүүст зориулсан цомгоо 4 оронтой кодоор хамгаална. Линк гадагш задарсан ч кодгүй хүн зургийг харж чадахгүй.
              </p>
            </div>
          </div>
          <button onClick={() => setPaying(true)}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold py-2.5 rounded-xl text-sm">
            <KeyRound className="w-4 h-4 text-amber-400" /> Түгжээ идэвхжүүлэх · ₮{info.price.toLocaleString()}
          </button>
          <p className="text-stone-500 text-[11px] mt-1.5 text-center">Нэг цомогт нэг удаа төлнө. Дараа нь кодоо хүссэнээрээ сольж, асааж унтрааж болно.</p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {info.enabled ? <Lock className="w-4 h-4 text-emerald-400" /> : <Unlock className="w-4 h-4 text-stone-500" />}
              <p className="text-white font-semibold text-sm">{info.enabled ? 'Цомог кодоор түгжээтэй' : 'Түгжээ унтраалттай'}</p>
            </div>
            <button onClick={() => apply(!info.enabled)} disabled={busy} role="switch" aria-checked={info.enabled}
              className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${info.enabled ? 'bg-emerald-500' : 'bg-white/15'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${info.enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          {info.enabled && (
            <>
              <div className="mt-3 flex items-center justify-center gap-2">
                {(editing ? pinInput.padEnd(4, ' ') : info.pin).split('').map((d, i) => (
                  <span key={i} className="w-11 h-12 rounded-lg bg-stone-950 border border-white/10 flex items-center justify-center text-2xl font-bold text-amber-400 font-mono">{d.trim() || '·'}</span>
                ))}
              </div>
              {editing ? (
                <div className="mt-3 flex gap-2">
                  <input autoFocus inputMode="numeric" maxLength={4} value={pinInput} placeholder="4 оронтой код"
                    onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    onKeyDown={e => { if (e.key === 'Enter' && pinInput.length === 4) apply(true, pinInput); }}
                    className="flex-1 min-w-0 bg-stone-950 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-white text-sm outline-none tracking-widest" />
                  <button onClick={() => apply(true, pinInput)} disabled={busy || pinInput.length !== 4}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-semibold px-3 rounded-lg text-sm">Хадгалах</button>
                  <button onClick={() => { setEditing(false); setPinInput(''); }} className="text-stone-400 hover:text-white text-sm px-1">Болих</button>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button onClick={copyShare} className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg py-2 text-xs text-stone-200">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Хуулсан' : 'Линк+код'}
                  </button>
                  <button onClick={() => setEditing(true)} className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg py-2 text-xs text-stone-200">
                    <Pencil className="w-3.5 h-3.5" /> Өөрчлөх
                  </button>
                  <button onClick={() => apply(true, 'random')} disabled={busy} className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg py-2 text-xs text-stone-200 disabled:opacity-50">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Шинэ код
                  </button>
                </div>
              )}
              <p className="text-stone-500 text-[11px] mt-2 leading-relaxed">
                Кодоо зөвхөн зориулсан хүмүүстээ өгнө үү. Код солиход өмнө нь нээсэн хүмүүс шинэ кодыг дахин оруулна.
              </p>
            </>
          )}
          {!info.enabled && <p className="text-stone-500 text-xs mt-2">Унтраалттай үед линктэй хэн ч цомгийг үзнэ.</p>}
        </>
      )}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

      {paying && (
        <QpayPayModal
          title="Цомгийн код түгжээ"
          amount={info.price}
          invoicePath="/lock-invoice"
          checkPath="/check-lock/"
          payload={{ albumId }}
          paidText="Төлбөр амжилттай! Цомог кодоор түгжигдлээ."
          onClose={() => setPaying(false)}
          onPaid={() => { setPaying(false); reload(); }}
        />
      )}
    </div>
  );
}
