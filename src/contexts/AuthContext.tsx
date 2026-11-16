import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, UserProfile } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // getSession() болон onAuthStateChange(INITIAL_SESSION) хоёулаа профайл татдаг —
  // зэрэг ирсэн ижил хүсэлтийг нэг болгоно (хуудас бүрт 2 удаа татдаг байсан).
  const inflight = useRef<{ id: string; p: Promise<void> } | null>(null);
  function fetchProfile(userId: string): Promise<void> {
    if (inflight.current?.id === userId) return inflight.current.p;
    const p = loadProfile(userId).finally(() => {
      if (inflight.current?.p === p) inflight.current = null;
    });
    inflight.current = { id: userId, p };
    return p;
  }

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    // Таб руу буцаж ороход Supabase токеноо шинэчилж дахин дуудагддаг.
    // Профайл өөрчлөгдөөгүй бол шинэ объект өгөхгүй — эс тэгвээс хуудсууд
    // дахин ачаалагдаж бөглөж байсан маягт арилдаг.
    setProfile(prev => (prev && JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(prev => (prev && session?.user && prev.id === session.user.id ? prev : session?.user ?? null));
      // Токен шинэчлэгдэх нь профайл өөрчлөгдсөн гэсэн үг биш.
      if (event === 'TOKEN_REFRESHED') return;
      if (session?.user) {
        (async () => {
          await fetchProfile(session.user.id);
        })();
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- нэг удаа бүртгэнэ; fetchProfile ref-ээр тогтвортой
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
