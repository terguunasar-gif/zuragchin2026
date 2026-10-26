import { useState } from 'react';
import { LocateFixed } from 'lucide-react';
import SearchMap from './SearchMap';
import { requestCurrentPosition } from '../../lib/studios';

interface LocationPickerProps {
  value: { lat: number; lng: number } | null;
  onChange: (next: { lat: number; lng: number }) => void;
}

/** Pin a studio on the map. Click the imagery or use the device location. */
export default function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [flyNonce, setFlyNonce] = useState(0);

  async function locate() {
    setLocating(true);
    setError('');
    try {
      const next = await requestCurrentPosition();
      onChange(next);
      setFlyNonce(n => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Байршил авах боломжгүй.');
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-stone-300 text-sm">Газрын зураг дээр дарж байршлаа тэмдэглэнэ үү</p>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 px-3 py-1.5 rounded-full"
        >
          <LocateFixed className="w-4 h-4" />
          {locating ? 'Хайж байна…' : 'Одоогийн байршил'}
        </button>
      </div>
      <SearchMap center={value} onPick={(lat, lng) => onChange({ lat, lng })} flyNonce={flyNonce} className="h-64 sm:h-72" />
      {value ? (
        <p className="text-emerald-300 text-xs">
          Байршил тогтоогдсон · {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      ) : (
        <p className="text-stone-500 text-xs">Байршил сонгоогүй байна. Студийг илгээхийн тулд цэг хэрэгтэй.</p>
      )}
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
