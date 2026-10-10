import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet } from 'lucide-react';
import WalletTab from './WalletTab';

/** Миний орлого ба мөнгө татах (зурагчин, зохион байгуулагч) */
export default function WalletPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 bg-stone-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <Wallet className="w-5 h-5 text-amber-400" />
          <p className="text-white font-bold">Миний түрийвч · Мөнгө татах</p>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <WalletTab />
      </main>
    </div>
  );
}
