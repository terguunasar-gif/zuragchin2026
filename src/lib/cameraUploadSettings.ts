import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** platform_settings түлхүүрүүд — байхгүй бол харагдана (true) */
export const CAMERA_SETTING_KEYS = {
  local: 'camera_local_folder_visible',
  ftp: 'camera_ftp_inbox_visible',
} as const;

export function useCameraUploadVisibility() {
  const [vis, setVis] = useState<{ local: boolean; ftp: boolean; loaded: boolean }>({ local: false, ftp: false, loaded: false });
  useEffect(() => {
    let alive = true;
    supabase.from('platform_settings').select('key, value')
      .in('key', [CAMERA_SETTING_KEYS.local, CAMERA_SETTING_KEYS.ftp])
      .then(({ data }) => {
        if (!alive) return;
        const get = (k: string) => {
          const r = (data ?? []).find(x => x.key === k);
          return r ? !(r.value === false || r.value === 'false') : true;
        };
        setVis({ local: get(CAMERA_SETTING_KEYS.local), ftp: get(CAMERA_SETTING_KEYS.ftp), loaded: true });
      });
    return () => { alive = false; };
  }, []);
  return vis;
}
