import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../../components/BrandMark';
import { DRAFT_NOTICE, LegalSection } from '../../content/legal';

export default function LegalLayout({
  title,
  lede,
  sections,
  children,
}: {
  title: string;
  lede?: string;
  sections?: LegalSection[];
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <header className="border-b border-white/10 bg-stone-950/95">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80">
            <BrandMark className="w-8 h-8 flex-shrink-0" />
            <span>
              <span className="font-brand text-white font-semibold tracking-tight">Zuragchin</span>
              <span className="font-brand text-amber-400 font-semibold">.mn</span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-stone-400">
            <Link to="/contact" className="hover:text-white">Холбоо барих</Link>
            <Link to="/auth/login" className="hover:text-white">Нэвтрэх</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-amber-300/90 text-sm bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-8">
          {DRAFT_NOTICE}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold mb-4">{title}</h1>
        {lede && <p className="text-stone-400 text-lg mb-8">{lede}</p>}
        <div className="space-y-8">
          {sections?.map(section => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold text-amber-400 mb-3">{section.heading}</h2>
              {section.paragraphs.map(p => (
                <p key={p} className="text-stone-300 leading-relaxed mb-3">{p}</p>
              ))}
            </section>
          ))}
          {children}
        </div>
      </main>
      <footer className="border-t border-white/10 py-8 px-6 text-sm text-stone-500">
        <div className="max-w-3xl mx-auto flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/" className="hover:text-white">Нүүр</Link>
          <Link to="/terms" className="hover:text-white">Үйлчилгээний нөхцөл</Link>
          <Link to="/privacy" className="hover:text-white">Нууцлал</Link>
          <Link to="/contact" className="hover:text-white">Холбоо барих</Link>
        </div>
      </footer>
    </div>
  );
}
