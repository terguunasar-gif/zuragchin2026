import { supabase } from './supabase';
import { applyWatermark } from './watermark';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Хэвлэх хэмжээ (см) — богино тал × урт тал */
const SIZE_CM: Record<string, [number, number]> = {
  '10x15': [10, 15], '13x18': [13, 18], '15x21': [15, 21], '20x30': [20, 30], '21x30': [21, 30], A4: [21, 29.7],
};

export type SmsResult = 'sent' | 'already' | 'not_configured' | 'failed' | 'no_phone';
export interface PrintJobResult { sms: SmsResult; smsText: string; buyerPhone: string }

/**
 * Угаалгах захиалгын эх зургийг хэвлэх цонхонд нээнэ (компьютерт холбосон принтер сонгоно).
 * Сервер талд төлөвийг «Угаасан» болгож, худалдан авагчид SMS илгээнэ.
 * Цонхыг товч дарсан агшинд нээх ёстой (popup blocker), тиймээс энэ функцийг click дотроос шууд дуудна.
 */
export async function printPurchase(purchaseId: string): Promise<PrintJobResult> {
  const win = window.open('', '_blank');
  if (win) win.document.write('<p style="font-family:sans-serif;padding:24px">Зураг бэлтгэж байна…</p>');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${QPAY_FN_URL}/print-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: ANON_KEY },
      body: JSON.stringify({ purchaseId }),
    });
    const data = await res.json();
    if (!res.ok || !data.signedUrl) throw new Error(data.error || 'Хэвлэх холбоос үүсгэж чадсангүй');
    const [w, h] = SIZE_CM[data.size] ?? SIZE_CM['10x15'];
    // Цомгийн лого, мэндчилгээг (сайтын «Zuragchin.mn» тамгагүйгээр) хэвлэх зурагт шингээнэ
    const imgSrc = await withBrand(data.signedUrl, data.brand ?? '', data.filename);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.filename)} · ${escapeHtml(data.size)}</title>
<style id="pg">@page{size:${w}cm ${h}cm;margin:0}</style>
<style>html,body{margin:0;padding:0;background:#fff}img{display:block;width:${w}cm;height:${h}cm;object-fit:cover}
@media screen{body{display:flex;justify-content:center;padding:16px;background:#444}img{box-shadow:0 4px 24px rgba(0,0,0,.5)}}</style>
</head><body><img id="im" src="${imgSrc}">
<script>
var im=document.getElementById('im');
im.onload=function(){
  if(im.naturalWidth>im.naturalHeight){ // хэвтээ зураг — цаасыг хэвтээгээр
    document.getElementById('pg').textContent='@page{size:${h}cm ${w}cm;margin:0}';
    im.style.width='${h}cm'; im.style.height='${w}cm';
  }
  setTimeout(function(){window.focus();window.print();},300);
};
</script></body></html>`;
    if (win) { win.document.open(); win.document.write(html); win.document.close(); }
    else window.open(data.signedUrl, '_blank');
    return { sms: data.sms, smsText: data.smsText ?? '', buyerPhone: data.buyerPhone ?? '' };
  } catch (e) {
    win?.close();
    throw e;
  }
}

/** Брэнд давхаргууд: давтагдах тамга болон «zuragchin.mn» текстийг хасна */
function brandLayers(raw: string): string | null {
  try {
    const layers = JSON.parse(raw) as { type: string; text?: string; imagePreview?: string }[];
    if (!Array.isArray(layers)) return null;
    const keep = layers.filter(l =>
      (l.type === 'image' && !!l.imagePreview) ||
      (l.type === 'text' && !!l.text && !/zuragchin/i.test(l.text)));
    return keep.length ? JSON.stringify(keep) : null;
  } catch { return null; }
}

async function withBrand(url: string, raw: string, filename: string): Promise<string> {
  const layers = raw ? brandLayers(raw) : null;
  if (!layers) return url;
  try {
    const blob = await (await fetch(url)).blob();
    const out = await applyWatermark(new File([blob], filename || 'photo.jpg', { type: blob.type || 'image/jpeg' }),
      { type: 'layers', value: layers, position: 'bottom-right', brandOnly: true, quality: 0.95 });
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(out);
    });
  } catch (e) {
    console.warn('brand overlay failed, printing original:', e);
    return url;
  }
}

function escapeHtml(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
