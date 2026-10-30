import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, ImagePlus, Loader2, LogIn, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../lib/i18n';
import { GuestInfo, GuestPhoto, deleteGuestPhoto, guestUrl, listGuestPhotos, uploadGuestPhoto } from '../lib/guestPhotos';
import GuestPhotosPanel from './GuestPhotosPanel';

/** Цомгийн «Зочдын зураг» таб: зочид утсаар авсан зургаа оруулж, бүгд үнэгүй татна (зарагдахгүй) */
export default function GuestPhotosSection({ albumId, lockToken, info, onInfo }: {
  albumId: string; lockToken: string; info: GuestInfo; onInfo: (i: GuestInfo) => void;
}) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<GuestPhoto[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reload = () => listGuestPhotos(albumId, lockToken).then(setPhotos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [albumId, lockToken]);

  const remaining = Math.max(0, info.photo_limit - info.used);

  async function onFiles(list: FileList | null) {
    if (!list?.length || !profile) return;
    setError('');
    const files = Array.from(list).filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    const take = files.slice(0, remaining);
    if (files.length > take.length) setError(t('Үлдсэн хязгаар {n} зураг тул эхний {n}-ийг оруулна.', { n: take.length }));
    setProgress({ done: 0, total: take.length });
    let ok = 0;
    for (const f of take) {
      try {
        await uploadGuestPhoto(albumId, profile.id, f, lockToken);
        ok++;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (/хязгаар|хаагдсан|хаалттай/i.test(String(e))) break;
      }
      setProgress({ done: ok, total: take.length });
    }
    setProgress(null);
    if (fileRef.current) fileRef.current.value = '';
    onInfo({ ...info, used: info.used + ok, can_upload: info.used + ok < info.photo_limit && info.enabled });
    reload();
  }

  function login() {
    try { localStorage.setItem('login_next', window.location.pathname + window.location.search); } catch { /* */ }
    navigate('/auth/login');
  }

  async function remove(p: GuestPhoto) {
    if (!confirm(t('Энэ зургийг устгах уу?'))) return;
    setDeleting(true);
    try {
      await deleteGuestPhoto(p.id);
      setPhotos(list => (list ?? []).filter(x => x.id !== p.id));
      onInfo({ ...info, used: Math.max(0, info.used - 1), can_upload: info.enabled && info.photo_limit > 0 });
      setOpen(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setDeleting(false);
  }

  const current = open !== null && photos ? photos[open] : null;

  return (
    <div>
      {info.can_manage && <div className="mb-4"><GuestPhotosPanel albumId={albumId} compact onChange={onInfo} /></div>}

      {/* Толгой: тайлбар, үлдсэн тоо, оруулах товч */}
      <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl p-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Users className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold">{t('Зочдын зураг — үнэгүй хуваалцана')}</p>
            <p className="text-stone-400 text-xs mt-0.5 leading-relaxed">
              {t('Утсаараа авсан зургаа энд оруулж бусадтайгаа хуваалцаарай. Зочдын зураг зарагдахгүй, хүн бүр үнэгүй татаж авна.')}
            </p>
            {info.photo_limit > 0 && (
              <p className="text-xs mt-1.5">
                {info.can_upload
                  ? <span className="text-emerald-300 font-semibold">{t('Цомогт дахиад {n} зураг орох боломжтой', { n: remaining.toLocaleString() })}</span>
                  : <span className="text-stone-500">{info.enabled ? t('Зочдын зургийн хязгаар дүүрсэн') : t('Зураг оруулалт түр зогссон')}</span>}
              </p>
            )}
          </div>
        </div>
        {info.can_upload && (
          profile ? (
            <>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => onFiles(e.target.files)} />
              <button onClick={() => fileRef.current?.click()} disabled={!!progress}
                className="flex-shrink-0 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-stone-950 font-semibold text-sm px-4 py-2.5 rounded-xl">
                {progress ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                {progress ? t('{a}/{b} оруулж байна…', { a: progress.done, b: progress.total }) : t('Зураг оруулах')}
              </button>
            </>
          ) : (
            <button onClick={login}
              className="flex-shrink-0 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm px-4 py-2.5 rounded-xl">
              <LogIn className="w-4 h-4" /> {t('Нэвтэрч зураг оруулах')}
            </button>
          )
        )}
      </div>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {photos === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-stone-500 animate-spin" /></div>
      ) : photos.length === 0 ? (
        <p className="text-center text-stone-500 text-sm py-16">{t('Одоогоор зочдын зураг алга. Анхных нь болоорой!')}</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
          {photos.map((p, i) => (
            <button key={p.id} onClick={() => setOpen(i)} className="relative aspect-square bg-stone-900 rounded-md overflow-hidden group">
              <img src={guestUrl(p.thumb_path)} alt={p.uploader_name} loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            </button>
          ))}
        </div>
      )}

      {/* Томоор харах */}
      {current && open !== null && photos && (
        <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-stone-300 text-sm truncate">📷 {current.uploader_name}</p>
            <button onClick={() => setOpen(null)} aria-label={t('Хаах')} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative flex-1 min-h-0 flex items-center justify-center px-2">
            <img src={guestUrl(current.path)} alt={current.uploader_name} className="max-w-full max-h-full object-contain" />
            {open > 0 && (
              <button onClick={() => setOpen(open - 1)} aria-label={t('Өмнөх')}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {open < photos.length - 1 && (
              <button onClick={() => setOpen(open + 1)} aria-label={t('Дараах')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-2 px-4 py-4">
            <a href={`${guestUrl(current.path)}?download=zuragchin-${current.id.slice(0, 8)}.jpg`}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-semibold text-sm px-5 py-2.5 rounded-xl">
              <Download className="w-4 h-4" /> {t('Үнэгүй татах')}
            </a>
            {(current.mine || info.can_manage) && (
              <button onClick={() => remove(current)} disabled={deleting}
                className="flex items-center gap-2 bg-white/10 hover:bg-red-500/80 disabled:opacity-50 text-white text-sm px-4 py-2.5 rounded-xl">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} {t('Устгах')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
