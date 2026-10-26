import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyHead, peekPageOverride } from '../seo/head';
import { metaForPath } from '../seo/site';

/** Default document head for the current path. */
export default function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (peekPageOverride()) return;
    applyHead(metaForPath(pathname));
  }, [pathname]);
  return null;
}
