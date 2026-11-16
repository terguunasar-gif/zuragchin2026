import { useEffect, useState } from 'react';
import { applyAdjustToCanvas, hasEdit, loadImg, renderPaper, type PhotoAdjust, type PrintCrop } from '../lib/photoAdjust';

/** Засвар (тайралт, гэрэл/өнгө) хэрэгжсэн жижиг зураг — засвар хадгалагдсаныг шууд харуулна */
export default function EditedThumb({ url, size, edit, className }: { url: string; size: string; edit?: (PhotoAdjust & PrintCrop) | null; className?: string }) {
  const [src, setSrc] = useState(url);
  const key = JSON.stringify(edit ?? {});
  useEffect(() => {
    if (!hasEdit(edit)) { setSrc(url); return; }
    let alive = true;
    loadImg(url).then(im => {
      if (!alive) return;
      const k = Math.min(1, 360 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(im, 0, 0, c.width, c.height);
      applyAdjustToCanvas(ctx, c.width, c.height, edit!);
      setSrc(renderPaper(c, c.width, c.height, size, edit!).toDataURL('image/jpeg', 0.8));
    }).catch(() => { if (alive) setSrc(url); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, size, key]);
  return <img src={src} alt="" draggable={false} onContextMenu={e => e.preventDefault()} className={className} />;
}
