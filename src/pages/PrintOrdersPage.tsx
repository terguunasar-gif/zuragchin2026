import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { hasRole } from '../lib/supabase';
import SalesPanel, { useMySales } from '../components/SalesPanel';

/**
 * Угаалгах захиалгатай зургуудын хуудас (/dashboard/print-orders?album=<id>).
 * Цомгийн карт дээрх «N шинэ угаалгах захиалга» тэмдгийг дарахад нээгдэнэ.
 */
export default function PrintOrdersPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [params] = useSearchParams();
  const albumId = params.get('album');
  const asParam = params.get('as');
  const sales = useMySales();
  const mode: 'organizer' | 'photographer' =
    asParam === 'photographer' || asParam === 'organizer' ? asParam
      : hasRole(profile, 'organizer') ? 'organizer' : 'photographer';

  const pending = sales.rows.filter(r =>
    r.type === 'print' && r.print_status === 'pending' &&
    (mode === 'organizer' ? r.is_my_album : r.is_my_photo) && (!albumId || r.album_id === albumId)).length;

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 bg-stone-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <Printer className="w-5 h-5 text-amber-400" />
          <p className="text-white font-bold flex-1">Угаалгах захиалгууд</p>
          {pending > 0 && <span className="text-xs font-semibold text-red-300 bg-red-500/15 border border-red-500/40 px-2 py-1 rounded-md">{pending} хэвлээгүй</span>}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
        <p className="text-stone-500 text-xs mt-6 -mb-4">
          Зураг дээр дарж томоор харна. «Засах»-аар гэрэл, өнгийг тохируулаад «Принт» дарна. Хүлээлгэж өгсний дараа төлвийг «Хүлээлгэж өгсөн» болгоно.
        </p>
        <SalesPanel mode={mode} sales={sales} initialFilter="print" initialAlbumId={albumId} bigThumbs hideSummary />
      </main>
    </div>
  );
}
