import { useEffect, useState } from 'react';
import { publicDb } from './supabase';

/** Нүүр хуудасны танилцуулга видеоны YouTube холбоос (platform_settings) */
export function useHomeVideo(key: 'home_booth_youtube' | 'home_ai_video_youtube' | 'home_about_youtube'): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    publicDb.from('platform_settings').select('value').eq('key', key).maybeSingle()
      .then(({ data }) => {
        const v = (data as { value?: unknown } | null)?.value;
        setUrl(typeof v === 'string' ? v : '');
      });
  }, [key]);
  return url;
}
