import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { hasRole } from '../lib/supabase';
import { setAutoPrintSource } from '../lib/autoPrintRunner';

/** App-д нэг удаа: нэвтэрсэн эрхээр автомат принтийг аль ч хуудсанд ажиллуулна */
export default function AutoPrintRunner() {
  const { profile } = useAuth();
  useEffect(() => {
    if (!profile) { setAutoPrintSource(null); return; }
    if (hasRole(profile, 'admin')) setAutoPrintSource('admin');
    else if (hasRole(profile, 'organizer') || hasRole(profile, 'photographer')) setAutoPrintSource('owner');
    else setAutoPrintSource(null);
  }, [profile]);
  return null;
}
