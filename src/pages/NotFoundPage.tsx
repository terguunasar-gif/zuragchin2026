import { Link } from 'react-router-dom';
import BrandMark from '../components/BrandMark';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-stone-950 text-white flex flex-col">
      <header className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80">
            <BrandMark className="w-8 h-8" />
            <span>
              <span className="font-brand font-semibold">Zuragchin</span>
              <span className="font-brand text-amber-400 font-semibold">.mn</span>
            </span>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-md text-center">
          <p className="text-amber-400 font-semibold tracking-wide mb-3">404</p>
          <h1 className="text-3xl font-bold mb-3">Хуудас олдсонгүй</h1>
          <p className="text-stone-400 mb-8">
            Энэ хаяг дээр хуудас алга. Холбоос хуучирсан эсвэл буруу бичигдсэн байж болно.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/" className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-5 py-2.5 rounded-xl">Нүүр хуудас</Link>
            <Link to="/explore" className="border border-white/15 text-stone-200 hover:text-white px-5 py-2.5 rounded-xl">Цомгууд</Link>
            <Link to="/photographers" className="border border-white/15 text-stone-200 hover:text-white px-5 py-2.5 rounded-xl">Зурагчид</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
