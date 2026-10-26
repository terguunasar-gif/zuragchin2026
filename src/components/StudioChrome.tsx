import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import BrandMark from './BrandMark';

interface StudioChromeProps {
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
}

export default function StudioChrome({ children, backTo, backLabel = 'Буцах' }: StudioChromeProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <header className="border-b border-white/10 sticky top-0 z-30 bg-stone-950/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {backTo && (
              <>
                <button
                  onClick={() => navigate(backTo)}
                  className="flex items-center gap-1.5 text-stone-400 hover:text-white text-sm flex-shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">{backLabel}</span>
                </button>
                <div className="w-px h-5 bg-white/10 hidden sm:block" />
              </>
            )}
            <button onClick={() => navigate('/')} className="flex items-center gap-2.5 hover:opacity-80 min-w-0">
              <BrandMark className="w-8 h-8 flex-shrink-0" />
              <span className="font-brand text-white font-semibold tracking-tight truncate">
                Zuragchin<span className="text-amber-400">.mn</span>
              </span>
            </button>
          </div>
          {profile ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium"
            >
              <span className="hidden sm:inline">Хяналтын самбар</span>
              <span className="sm:hidden">Самбар</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => navigate('/auth/login')}
              className="flex items-center gap-2 text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium"
            >
              <LogIn className="w-4 h-4" /> Нэвтрэх
            </button>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
