import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { normalizeCode } from '../../lib/albumCode';

const QrScanModal = lazy(() => import('../QrScanModal'));

/** Нүүр хуудасны «QR» товч — камер эсвэл галерейн зургаас QR уншуулж холбоос руу нь орно */
export default function HomeQrButton({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function onCode(text: string): { ok: boolean; message: string } {
    const raw = text.trim();
    let url: URL | null = null;
    try { url = new URL(raw); } catch { /* URL биш */ }

    if (url && /(^|\.)zuragchin\.mn$/i.test(url.hostname)) {
      setOpen(false);
      navigate(url.pathname + url.search + url.hash);
      return { ok: true, message: 'Нээж байна…' };
    }
    if (!url && /^[0-9a-f]{6}$/i.test(normalizeCode(raw)) && raw.replace(/\s/g, '').length <= 8) {
      setOpen(false);
      navigate(`/c/${normalizeCode(raw)}`);
      return { ok: true, message: 'Цомог нээж байна…' };
    }
    if (url && /^https?:$/.test(url.protocol)) {
      if (window.confirm(`Энэ QR өөр сайт руу заана:\n\n${url.href}\n\nНээх үү?`)) {
        window.location.href = url.href;
        return { ok: true, message: 'Нээж байна…' };
      }
      return { ok: false, message: 'Нээхийг цуцаллаа' };
    }
    return { ok: false, message: `QR доторх бичиг: ${raw.slice(0, 120)}` };
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="QR уншуулах"
        className={`flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm px-3 py-1.5 rounded-xl flex-shrink-0 ${className}`}
      >
        <ScanLine className="w-4 h-4" /> QR
      </button>
      {open && (
        <Suspense fallback={null}>
          <QrScanModal
            title="QR уншуулах"
            hint="QR кодыг дөрвөлжин хүрээнд оруулна уу. Эсвэл утасныхаа зургийн цомгоос QR-ийн зургийг оруулна."
            onCode={onCode}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
