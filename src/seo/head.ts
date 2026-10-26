import { useLayoutEffect } from 'react';
import { absoluteUrl, HeadMeta, OG_IMAGE, SITE_NAME } from './site';

let pageOverride: HeadMeta | null = null;

export function peekPageOverride(): HeadMeta | null {
  return pageOverride;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function applyHead(meta: HeadMeta) {
  document.title = meta.title;
  upsertMeta('name', 'description', meta.description);
  upsertMeta('name', 'robots', meta.robots);
  upsertMeta('property', 'og:title', meta.title);
  upsertMeta('property', 'og:description', meta.description);
  upsertMeta('property', 'og:url', absoluteUrl(meta.path));
  upsertMeta('property', 'og:image', OG_IMAGE);
  upsertMeta('property', 'og:site_name', SITE_NAME);
  upsertMeta('property', 'og:locale', 'mn_MN');
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:image', OG_IMAGE);
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', absoluteUrl(meta.path));
}

/** Page-level title/description. Wins over the route default. */
export function usePageMeta(meta: HeadMeta | null) {
  const title = meta?.title ?? '';
  const description = meta?.description ?? '';
  const path = meta?.path ?? '';
  const robots = meta?.robots ?? '';
  const active = meta !== null;
  useLayoutEffect(() => {
    if (!active) {
      pageOverride = null;
      return;
    }
    const next: HeadMeta = { title, description, path, robots: robots || 'index,follow' };
    pageOverride = next;
    applyHead(next);
    return () => { pageOverride = null; };
  }, [active, title, description, path, robots]);
}
