import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import OrganizerRequestsTab from './OrganizerRequestsTab';

/** Зохион байгуулагч: зурагчдын цомогт нэгдэх хүсэлтүүд */
export default function OrganizerRequestsPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-white/10 bg-stone-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-stone-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Users className="w-5 h-5 text-blue-400" />
          <p className="text-white font-bold">Зурагчдын хүсэлт</p>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <OrganizerRequestsTab />
      </main>
    </div>
  );
}
