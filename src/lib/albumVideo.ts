// Цомгийн AI видео (update-66) — album-video Edge Function-ийн клиент.
import { publicDb, supabase } from './supabase';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/album-video`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface VideoTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  emoji: string;
  sample_video_url: string;
  preview_url: string;
  tags: string;
}

export interface VideoTemplatesInfo {
  enabled: boolean;
  price: number;
  seconds: number;
  templates: VideoTemplate[];
}

export type VideoStatus = 'pending_payment' | 'paid' | 'processing' | 'done' | 'failed' | 'expired' | 'deleted';

export interface VideoState {
  id: string;
  status: VideoStatus;
  amount: number;
  videoUrl: string;
  posterUrl: string;
  templateName: string;
  canRetry: boolean;
  error: string;
}

export interface VideoInvoice {
  videoId: string;
  status: VideoStatus;
  amount: number;
  qrImage?: string;
  urls?: { name: string; description?: string; link: string; logo?: string }[];
}

/** Цомогт харагдах бэлэн видео */
export interface AlbumVideo {
  id: string;
  template_name: string;
  video_url: string;
  poster_url: string;
  aspect_ratio: '16:9' | '9:16';
  show_on_screen: boolean;
  created_at: string;
}

/** Эзэнд харагдах (боловсруулж буйг оруулаад) */
export interface OwnerVideo extends AlbumVideo {
  status: VideoStatus;
  hidden: boolean;
  photo_id: string | null;
}

async function call<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  let bearer = ANON_KEY;
  if (auth) {
    const { data: { session } } = await supabase.auth.getSession();
    bearer = session?.access_token ?? '';
  }
  const res = await fetch(`${FN_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${bearer}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error || `Алдаа (${res.status})`);
  return data as T;
}

export const albumVideoApi = {
  templates: () => call<VideoTemplatesInfo>('/templates'),
  start: (p: { albumId: string; photoId: string; templateId: string; aspectRatio: '16:9' | '9:16'; free?: boolean }) =>
    call<VideoInvoice>('/start', { method: 'POST', body: JSON.stringify(p) }, true),
  status: (videoId: string) => call<VideoState>(`/status/${videoId}`, {}, true),
  retry: (videoId: string) => call<VideoState>('/retry', { method: 'POST', body: JSON.stringify({ videoId }) }, true),
  remove: (videoId: string) => call<{ ok: boolean }>('/delete', { method: 'POST', body: JSON.stringify({ videoId }) }, true),
  /** Админ: загварын жишээ зургийг AI-аар үүсгэнэ */
  adminPreview: (templateId: string) => call<{ previewUrl: string }>('/admin/preview', { method: 'POST', body: JSON.stringify({ templateId }) }, true),
  /** Цомог нээгдэхэд боловсруулж буй видеог ахиулна (алдааг үл тооно) */
  advance: (albumId: string) => call<{ done: number }>('/advance', { method: 'POST', body: JSON.stringify({ albumId }) }).catch(() => ({ done: 0 })),
};

/** Цомгийн бэлэн видеонууд (SQL ажиллуулаагүй бол хоосон) */
export async function fetchAlbumVideos(albumId: string, lockToken = ''): Promise<AlbumVideo[]> {
  const { data, error } = await publicDb.rpc('album_ai_videos_public', { p_album_id: albumId, p_token: lockToken || null });
  if (error) return [];
  return (data ?? []) as AlbumVideo[];
}

/** Эзэн: өөрийн цомгийн бүх видео (боловсруулж буй, нуусан) */
export async function fetchOwnerVideos(albumId: string): Promise<OwnerVideo[]> {
  const { data, error } = await supabase.from('album_ai_videos')
    .select('id, template_name, video_url, poster_url, aspect_ratio, show_on_screen, created_at, status, hidden, photo_id')
    .eq('album_id', albumId)
    .in('status', ['paid', 'processing', 'done', 'failed'])
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as OwnerVideo[];
}

export async function setVideoFlags(id: string, flags: { hidden?: boolean; showOnScreen?: boolean }) {
  const { error } = await supabase.rpc('set_album_video_flags', {
    p_id: id, p_hidden: flags.hidden ?? null, p_show_on_screen: flags.showOnScreen ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Зургийн чиглэлээр видеоны харьцааг сонгоно */
export function aspectForImage(w: number, h: number): '16:9' | '9:16' {
  return h > w * 1.05 ? '9:16' : '16:9';
}
