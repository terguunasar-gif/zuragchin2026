import { supabase } from './supabase';
import { applyBrandToPurchase, brandLayers } from './watermark';
import { applyBaseEdit, PhotoAdjust, PrintCrop, preparePrintBlob, PRINT_SIZE_CM, CROP_KEYS } from './photoAdjust';

const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Хэвлэх хэмжээ (см) — богино тал × урт тал */
const SIZE_CM = PRINT_SIZE_CM;

export type SmsResult = 'sent' | 'already' | 'not_configured' | 'failed' | 'no_phone';
export interface PrintJobResult { sms: SmsResult; smsText: string; buyerPhone: string }

/**
 * Угаалгах захиалгын эх зургийг хэвлэх цонхонд нээнэ (компьютерт холбосон принтер сонгоно).
 * Сервер талд төлөвийг «Угаасан» болгож, худалдан авагчид SMS илгээнэ.
 * Цонхыг товч дарсан агшинд нээх ёстой (popup blocker), тиймээс энэ функцийг click дотроос шууд дуудна.
 */
/** «Засах» цонхонд: эх зураг, хэмжээ, лого, хадгалсан засвар (төлөв өөрчлөхгүй, SMS явахгүй) */
export async function loadPrintSource(purchaseId: string): Promise<{ signedUrl: string; filename: string; size: string; brand: string; adjust: PhotoAdjust & PrintCrop; baseAdjust: PhotoAdjust & PrintCrop }> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${QPAY_FN_URL}/print-job`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: ANON_KEY },
    body: JSON.stringify({ purchaseId, preview: true }),
  });
  const data = await res.json();
  if (!res.ok || !data.signedUrl) throw new Error(data.error || 'Зураг ачаалж чадсангүй');
  return { signedUrl: data.signedUrl, filename: data.filename, size: data.size, brand: data.brand ?? '', adjust: data.adjust ?? {}, baseAdjust: data.baseAdjust ?? {} };
}

/** Гэрэл/өнгөний засварыг хадгална — дараагийн «Принт» бүрт хэрэгжинэ */
export async function savePrintAdjust(purchaseId: string, adjust: PhotoAdjust & PrintCrop): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${QPAY_FN_URL}/print-adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: ANON_KEY },
    body: JSON.stringify({ purchaseId, adjust }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Хадгалж чадсангүй');
}

/** adjustOverride: «Засах» цонхноос шууд хэвлэх үед (хадгалагдахыг хүлээхгүй) */
export async function printPurchase(purchaseId: string, adjustOverride?: PhotoAdjust & PrintCrop): Promise<PrintJobResult> {
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
    const imgSrc = await withBrand(data.signedUrl, data.brand ?? '', data.filename, data.size, adjustOverride ?? data.adjust ?? {}, data.baseAdjust ?? {});
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.filename)} · ${escapeHtml(data.size)}</title>
<style id="pg">@page{size:${w}cm ${h}cm;margin:0}</style>
<style>html,body{margin:0;padding:0;background:#fff}img{display:block;width:${w}cm;height:${h}cm;object-fit:contain}
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

async function withBrand(url: string, raw: string, filename: string, size: string, adjust: PhotoAdjust & PrintCrop = {}, base: PhotoAdjust & PrintCrop = {}): Promise<string> {
  const layers = raw ? brandLayers(raw) : null;
  // Цомгийн лого(нууд)-ыг урьдчилан шалгана — ачаалагдахгүй бол логогүй хэвлэхгүй, алдаа харуулна
  if (layers) {
    const logos = (JSON.parse(layers) as { type: string; imagePreview?: string }[])
      .filter(l => l.type === 'image' && l.imagePreview && !l.imagePreview.startsWith('data:'))
      .map(l => l.imagePreview as string);
    for (const u of logos) {
      const ok = await fetch(u, { cache: 'force-cache' }).then(r => r.ok).catch(() => false);
      if (!ok) throw new Error('Цомгийн логог ачаалж чадсангүй. Интернэтээ шалгаад «Принт»-ийг дахин дарна уу.');
    }
  }
  let blob = await (await fetch(url)).blob();
  // 0) цомгийн эзний засвар (байвал) — худалдан авагч/хэвлэгчийн засвар үүн дээр нэмэгдэнэ
  blob = await applyBaseEdit(blob, base);
  // 1) гэрэл/өнгө → 2) цаасны харьцаанд тайрах (лого тайрагдахгүйн тулд ЭХЛЭЭД тайрна) → 3) цомгийн лого
  try {
    blob = await preparePrintBlob(blob, size, adjust);
  } catch (e) {
    // Засвар хийж чадаагүй (ж: санах ой) — засваргүйгээр цаасны харьцаанд дахин оролдоно
    console.warn('print adjust failed, retrying without adjust:', e);
    const crop = Object.fromEntries(CROP_KEYS.filter(k => adjust[k] != null).map(k => [k, adjust[k]])) as PhotoAdjust & PrintCrop;
    blob = await preparePrintBlob(blob, size, crop);
  }
  if (layers) {
    const branded = await applyBrandToPurchase(blob, raw, filename, false);
    // applyBrandToPurchase алдаа гарвал эх blob-ийг буцаадаг — тэгвэл логогүй хэвлэхгүй
    if (branded === blob) throw new Error('Зурагт лого нэмж чадсангүй. «Принт»-ийг дахин дарна уу.');
    blob = branded;
  }
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function escapeHtml(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
