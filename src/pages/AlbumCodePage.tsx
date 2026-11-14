import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Images, KeyRound, Loader2 } from 'lucide-react';
import { CodeAlbum, findAlbumsByCode, normalizeCode } from '../lib/albumCode';
import { listVisitedAlbums } from '../lib/visitedAlbums';
import { useI18n } from '../lib/i18n';

/** /c/:code — цомгийн богино кодоор цомог руу орох (өөр хөтөч, өөр утаснаас) */
export default function AlbumCodePage() {
  const { code: param } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [code, setCode] = useState(normalizeCode(param || ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<CodeAlbum[]>([]);
  const visited = listVisitedAlbums();

  async function go(raw: string) {
    const c = normalizeCode(raw);
    setError(''); setMatches([]);
    if (c.length !== 6) { setError(t('Код 6 тэмдэгттэй байна (жишээ: BDB02C)')); return; }
    setBusy(true);
    const list = await findAlbumsByCode(c);
    setBusy(false);
    if (list.length === 1) { navigate(`/album/${list[0].link}`, { replace: true }); return; }
    if (list.length === 0) { setError(t('Ийм кодтой нээлттэй цомог олдсонгүй. Кодоо шалгаад дахин оролдоно уу.')); return; }
    setMatches(list);
  }

  useEffect(() => { if (param) void go(param); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [param]);

  function submit(e: FormEvent) { e.preventDefault(); void go(code); }

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <div className="max-w-md mx-auto px-5 py-8">
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-stone-400 hover:text-white text-sm mb-6">
          <ChevronLeft className="w-4 h-4" /> zuragchin.mn
        </button>
        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center mb-4">
          <KeyRound className="w-6 h-6 text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">{t('Цомгийн кодоор орох')}</h1>
        <p className="text-stone-400 text-sm mb-6">
          {t('Цомгийн хуудсан дээрх 6 тэмдэгттэй кодыг оруулна уу. Өөр хөтөч эсвэл өөр утаснаас цомгоо дахин олоход хэрэгтэй.')}
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            value={code}
            onChange={e => setCode(normalizeCode(e.target.value))}
            placeholder="BDB02C"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus={!param}
            className="w-full bg-white/5 border border-white/15 focus:border-amber-400 outline-none rounded-2xl px-4 py-4 text-center text-3xl font-bold tracking-[0.4em] uppercase"
          />
          {error && <p className="text-red-300 text-sm">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-bold rounded-2xl py-3.5 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t('Цомог нээх')}
          </button>
        </form>

        {matches.length > 1 && (
          <div className="mt-6 space-y-2">
            <p className="text-stone-400 text-sm">{t('Энэ кодтой хэд хэдэн цомог байна — өөрийнхөө цомгийг сонгоно уу:')}</p>
            {matches.map(a => (
              <button key={a.id} onClick={() => navigate(`/album/${a.link}`)}
                className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3">
                <span className="block font-semibold">{a.name}</span>
                {a.event_date && <span className="block text-xs text-stone-500">{a.event_date}</span>}
              </button>
            ))}
          </div>
        )}

        {visited.length > 0 && (
          <div className="mt-8">
            <p className="text-stone-500 text-xs mb-2">{t('Энэ төхөөрөмжөөс үзсэн цомгууд')}</p>
            <div className="space-y-2">
              {visited.map(a => (
                <button key={a.id} onClick={() => navigate(`/album/${a.link}`)}
                  className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2.5 text-left">
                  {a.cover ? <img src={a.cover} alt="" className="w-9 h-9 rounded-lg object-cover" /> : <Images className="w-5 h-5 text-stone-400" />}
                  <span className="truncate text-sm">{a.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
