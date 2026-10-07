import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Download, Loader2, Sparkles } from 'lucide-react';
import { boothApi, saveImageToDevice, saveHint } from '../../lib/aiBooth';

// Kiosk дээрх QR-аар нээгдэх хуудас: зөвхөн тухайн нэг зургийг харуулна.
export default function BoothResultPage() {
  const { resultToken = '' } = useParams<{ resultToken: string }>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<{ blob: Blob; url: string; albumName: string; expiresAt: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<'shared' | 'downloaded' | null>(null);

  useEffect(() => {
    let objectUrl = '';
    (async () => {
      try {
        const r = await boothApi.result(resultToken);
        const blob = await (await fetch(r.imageUrl)).blob();
        objectUrl = URL.createObjectURL(blob);
        setData({ blob, url: objectUrl, albumName: r.albumName, expiresAt: r.expiresAt });
        setState('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Зураг олдсонгүй');
        setState('error');
      }
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [resultToken]);

  async function save() {
    if (!data) return;
    setSaving(true);
    const r = await saveImageToDevice(data.blob, `zuragchin-ai-${resultToken.slice(0, 6)}.jpg`);
    setSaving(false);
    setSaved(r);
  }

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <header className="px-4 py-4 flex items-center gap-3 border-b border-white/10">
        <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-stone-950" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{data?.albumName || 'AI зураг'}</p>
          <p className="text-xs text-stone-500">zuragchin.mn · AI бүүт</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6">
        {state === 'loading' && (
          <div className="min-h-[60vh] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          </div>
        )}
        {state === 'error' && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-stone-300">{error}</p>
          </div>
        )}
        {state === 'ready' && data && (
          <div className="space-y-4">
            <img src={data.url} alt="AI зураг" className="w-full rounded-2xl border border-white/10" />
            <button
              onClick={save}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 rounded-xl py-4 font-bold text-lg"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              Утсандаа хадгалах
            </button>
            {saved && (
              <p className="text-stone-400 text-xs text-center">
                {saveHint(saved)}
              </p>
            )}
            <p className="text-stone-600 text-xs text-center">
              Энэ линк {new Date(data.expiresAt).toLocaleDateString('mn-MN')} хүртэл хүчинтэй.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
