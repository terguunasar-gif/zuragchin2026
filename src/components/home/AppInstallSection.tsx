import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Share, Smartphone, X } from 'lucide-react';
import { inAppBrowserName, isAndroid, isIOS, openInBrowserUrl, openInSafariUrl } from '../../lib/browserEnv';
import { isIosSafari, usePwaInstall } from '../../lib/pwaInstall';

type Guide = 'android' | 'ios';

function AndroidMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M6.2 10.2h11.6c.7 0 1.2.5 1.2 1.2v5.2c0 .7-.5 1.2-1.2 1.2h-.7V20c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-2.2H9.7V20c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-2.2h-.7c-.7 0-1.2-.5-1.2-1.2v-5.2c0-.7.5-1.2 1.2-1.2z" />
      <circle cx="9.3" cy="13.2" r="0.85" className="fill-amber-300" />
      <circle cx="14.7" cy="13.2" r="0.85" className="fill-amber-300" />
      <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M8.6 7.2 9.7 10M15.4 7.2 14.3 10M4.6 12.2v2.8M19.4 12.2v2.8" />
    </svg>
  );
}

function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M16.2 12.4c0-2 1.6-3 1.7-3.1-1-.1-1.9.6-2.4.6-.5 0-1.3-.6-2.2-.5-1.1.1-2.2.7-2.7 1.7-1.2 2-.3 5 0.8 6.7.6.8 1.2 1.7 2.1 1.7.8 0 1.1-.5 2.1-.5s1.3.5 2.2.5 1.5-.8 2.1-1.6c.6-.9.9-1.8.9-1.8s-1.8-.7-1.8-2.7zM14.6 7.4c.5-.6.8-1.4.7-2.2-.7 0-1.5.5-2 1.1-.4.5-.8 1.3-.7 2.1.8 0 1.5-.4 2-1z" />
    </svg>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 mt-0.5 rounded-full bg-amber-500 text-stone-950 text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <p className="text-sm text-stone-200 leading-relaxed">{children}</p>
    </li>
  );
}

function InstallGuide({ kind, onClose }: { kind: Guide; onClose: () => void }) {
  const titleId = useId();
  const inApp = inAppBrowserName();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  const title = kind === 'android' ? 'Андройд дээр суулгах' : 'iPhone дээр суулгах';

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" aria-label="Хаах" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-stone-900 border border-amber-500/30 rounded-t-3xl sm:rounded-3xl p-5 pb-8 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id={titleId} className="text-lg font-bold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Хаах"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-stone-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-stone-400 leading-relaxed">
          {kind === 'android'
            ? 'Play Store нээгдэхгүй. Chrome-оос энэ сайтыг шууд нүүр дэлгэцэнд суулгана.'
            : 'App Store нээгдэхгүй. Safari-аас энэ сайтыг шууд нүүр дэлгэцэнд нэмнэ.'}
        </p>

        {kind === 'android' && isAndroid && inApp && (
          <>
            <p className="mt-3 text-xs text-amber-200/90 leading-relaxed">
              Одоо {inApp === 'App' ? 'апп' : inApp} доторх цонхоор орсон тул суулгах цэс гарахгүй.
            </p>
            <a
              href={openInBrowserUrl()}
              className="mt-3 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm py-3 rounded-2xl"
            >
              Эхлээд Chrome-оор нээх
            </a>
          </>
        )}
        {kind === 'android' && !isAndroid && (
          <p className="mt-3 text-xs text-amber-200/90 leading-relaxed">
            Утасныхаа Chrome-оор энэ хуудсыг нээгээд доорх алхмыг дагана уу.
          </p>
        )}

        {kind === 'ios' && isIOS && !isIosSafari() && (
          <>
            <p className="mt-3 text-xs text-amber-200/90 leading-relaxed">
              {inApp
                ? `Одоо ${inApp === 'App' ? 'апп' : inApp} доторх цонхоор орсон байна. Нүүр дэлгэцэд Safari-аас л нэмнэ.`
                : 'Энэ хөтөч дээр «Нүүр дэлгэцэд нэмэх» гарахгүй. Safari-аар нээнэ үү.'}
            </p>
            <a
              href={openInSafariUrl()}
              className="mt-3 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm py-3 rounded-2xl"
            >
              Эхлээд Safari-аар нээх
            </a>
          </>
        )}
        {kind === 'ios' && !isIOS && (
          <p className="mt-3 text-xs text-amber-200/90 leading-relaxed">
            iPhone дээрээ Safari-аар энэ хуудсыг нээгээд доорх алхмыг дагана уу.
          </p>
        )}

        {kind === 'android' ? (
          <ol className="mt-4 space-y-3">
            <Step n={1}>Chrome-оо нээнэ. Messenger, Facebook доторх цонхноос суулгах цэс гарахгүй.</Step>
            <Step n={2}>
              Баруун дээд булангын <span className="inline-flex items-center font-semibold text-white">⋮</span> цэсийг дарна.
            </Step>
            <Step n={3}>
              «Install app» эсвэл «Add to Home screen»-ийг сонгоно. Монголоор «Апп суулгах» / «Нүүр дэлгэцэд нэмэх» гэж гарна.
            </Step>
            <Step n={4}>«Install» / «Суулгах»-ийг дарна. Дэлгүүр биш, энэ сайт өөрөө нүүр дэлгэцэнд сууна.</Step>
          </ol>
        ) : (
          <ol className="mt-4 space-y-3">
            <Step n={1}>Safari-аар энэ хуудсыг нээнэ. iPhone дээрх Chrome-д энэ товч байхгүй.</Step>
            <Step n={2}>
              Доод талын Хуваалцах товчийг дарна — дөрвөлжин доторх дээш сум{' '}
              <Share className="inline w-4 h-4 text-amber-400 align-text-bottom" aria-hidden="true" />.
            </Step>
            <Step n={3}>«Add to Home Screen» / «Нүүр дэлгэцэд нэмэх»-ийг сонгоно.</Step>
            <Step n={4}>Баруун дээд «Add» / «Нэмэх»-ийг дарна. App Store нээгдэхгүй.</Step>
          </ol>
        )}
      </div>
    </div>
  );
}

/** Нүүр хуудасны апп суулгах хэсэг. Дэлгүүрийн жагсаалт биш, сайтаас PWA суулгана. */
export default function AppInstallSection() {
  const { canPrompt, showInstall, platform, promptInstall } = usePwaInstall();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [note, setNote] = useState('');
  const inApp = inAppBrowserName();

  if (!showInstall) return null;

  async function onAndroid() {
    const outcome = await promptInstall();
    if (outcome === 'accepted') return;
    if (outcome === 'dismissed') {
      setNote('Цонхыг хаасан бол дахин «Андройд» дээр дарна уу.');
      return;
    }
    setGuide('android');
  }

  return (
    <section id="app-install" className="scroll-mt-24 mb-10 pb-10 border-b border-white/10">
      <div className="max-w-3xl mx-auto rounded-3xl border border-amber-400/40 bg-stone-900/90 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.18),transparent_58%)] p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-10 h-10 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center">
            <Smartphone className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-amber-400 text-xs font-bold tracking-wide">Апп суулгах</p>
            <h2 className="text-lg sm:text-2xl font-bold text-white leading-tight">Утсандаа нүүр дэлгэцнээс нээх</h2>
          </div>
        </div>
        <p className="mt-3 text-sm text-stone-300 leading-relaxed">
          Play Store, App Store-оос хайхгүй. Энэ вэбсайтаас шууд утасныхаа нүүр дэлгэцэнд Zuragchin-г суулгаад, апп шиг нээнэ.
        </p>

        <div className="mt-4 pt-2 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onAndroid}
            data-install="android"
            className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl min-h-[5.25rem] px-2 py-3 transition-colors ${
              platform === 'android'
                ? 'bg-amber-500 text-stone-950 shadow-[0_0_0_3px_rgba(251,191,36,0.28)]'
                : 'bg-white/5 text-white border border-white/10 hover:border-amber-400/50'
            }`}
          >
            {platform === 'android' && (
              <span className="absolute -top-2 right-2 text-[10px] font-bold bg-stone-950 text-amber-400 border border-amber-400/40 px-1.5 py-0.5 rounded-full">
                Таны утас
              </span>
            )}
            <AndroidMark className="w-7 h-7" />
            <span className="text-sm font-bold">Андройд</span>
            <span className={`text-[11px] font-medium ${platform === 'android' ? 'text-stone-800' : 'text-stone-400'}`}>
              {canPrompt ? 'Шууд суулгах' : 'Chrome цэс'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setGuide('ios')}
            data-install="ios"
            className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl min-h-[5.25rem] px-2 py-3 transition-colors ${
              platform === 'ios'
                ? 'bg-amber-500 text-stone-950 shadow-[0_0_0_3px_rgba(251,191,36,0.28)]'
                : 'bg-white/5 text-white border border-white/10 hover:border-amber-400/50'
            }`}
          >
            {platform === 'ios' && (
              <span className="absolute -top-2 right-2 text-[10px] font-bold bg-stone-950 text-amber-400 border border-amber-400/40 px-1.5 py-0.5 rounded-full">
                Таны утас
              </span>
            )}
            <AppleMark className="w-7 h-7" />
            <span className="text-sm font-bold">iPhone</span>
            <span className={`text-[11px] font-medium ${platform === 'ios' ? 'text-stone-800' : 'text-stone-400'}`}>
              Safari заавар
            </span>
          </button>
        </div>

        {inApp && (
          <p className="mt-3 text-xs text-amber-200/90 leading-relaxed">
            Одоо {inApp === 'App' ? 'апп' : inApp} доторх цонхоор орсон байна. Суулгахын тулд эхлээд {isAndroid ? 'Chrome' : 'Safari'}-аар нээнэ үү.
          </p>
        )}
        {note && (
          <p className="mt-3 text-sm text-amber-200" aria-live="polite">{note}</p>
        )}
      </div>
      {guide && <InstallGuide kind={guide} onClose={() => setGuide(null)} />}
    </section>
  );
}
