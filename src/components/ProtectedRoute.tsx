import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ReactNode } from 'react';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}
