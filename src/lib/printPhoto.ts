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

type PrintJobData = { signedUrl: string; filename: string; size: string; brand?: string; adjust?: PhotoAdjust & PrintCrop; baseAdjust?: PhotoAdjust & PrintCrop; sms: SmsResult; smsText?: string; buyerPhone?: string };

/** Сервер: эх зургийн холбоос + төлөв «Угаасан» + (нэг удаа) SMS */
async function requestPrintJob(purchaseId: string): Promise<PrintJobData> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${QPAY_FN_URL}/print-job`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: ANON_KEY },
    body: JSON.stringify({ purchaseId }),
  });
  const data = await res.json();
  if (!res.ok || !data.signedUrl) throw new Error(data.error || 'Хэвлэх холбоос үүсгэж чадсангүй');
  return data as PrintJobData;
}

/** Цаасны хэмжээтэй хэвлэх HTML. doneScript — хэвлэсний дараа ажиллах JS (автомат принтэд) */
async function buildPrintHtml(data: PrintJobData, adjustOverride?: PhotoAdjust & PrintCrop, doneScript = ''): Promise<string> {
  const [w, h] = SIZE_CM[data.size] ?? SIZE_CM['10x15'];
  // Цомгийн лого, мэндчилгээ болон жижиг «Zuragchin.mn» тэмдгийг хэвлэх зурагт шингээнэ
  const imgSrc = await withBrand(data.signedUrl, data.brand ?? '', data.filename, data.size, adjustOverride ?? data.adjust ?? {}, data.baseAdjust ?? {});
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.filename)} · ${escapeHtml(data.size)}</title>
<style id="pg">@page{size:${w}cm ${h}cm;margin:0}</style>
<style>html,body{margin:0;padding:0;background:#fff}img{display:block;width:${w}cm;height:${h}cm;object-fit:contain}
@media screen{body{display:flex;justify-content:center;padding:16px;background:#444}img{box-shadow:0 4px 24px rgba(0,0,0,.5)}}</style>
</head><body><img id="im" src="${imgSrc}">
<script>
var im=document.getElementById('im');
im.onerror=function(){${doneScript}};
im.onload=function(){
  if(im.naturalWidth>im.naturalHeight){ // хэвтээ зураг — цаасыг хэвтээгээр
    document.getElementById('pg').textContent='@page{size:${h}cm ${w}cm;margin:0}';
    im.style.width='${h}cm'; im.style.height='${w}cm';
  }
  setTimeout(function(){window.focus();window.print();${doneScript}},300);
};
</script></body></html>`;
  return html;
}

/** adjustOverride: «Засах» цонхноос шууд хэвлэх үед (хадгалагдахыг хүлээхгүй) */
export async function printPurchase(purchaseId: string, adjustOverride?: PhotoAdjust & PrintCrop): Promise<PrintJobResult> {
  const win = window.open('', '_blank');
  if (win) win.document.write('<p style="font-family:sans-serif;padding:24px">Зураг бэлтгэж байна…</p>');
  try {
    const data = await requestPrintJob(purchaseId);
    const html = await buildPrintHtml(data, adjustOverride);
    if (win) { win.document.open(); win.document.write(html); win.document.close(); }
    else window.open(data.signedUrl, '_blank');
    return { sms: data.sms, smsText: data.smsText ?? '', buyerPhone: data.buyerPhone ?? '' };
  } catch (e) {
    win?.close();
    throw e;
  }
}

/**
 * Автомат принт: товч дарахгүйгээр (popup-гүй) нууц iframe дотор хэвлэнэ.
 * Chrome-ыг --kiosk-printing-тэй нээсэн бол цонх асуулгүй анхдагч принтер рүү шууд гарна.
 * Хэвлэх цонх хаагдсаны дараа (эсвэл 3 мин) дуусна — дараагийн захиалга түүний дараа.
 */
export async function printPurchaseSilently(purchaseId: string): Promise<PrintJobResult> {
  const data = await requestPrintJob(purchaseId);
  const token = `zmprint-${purchaseId}-${Date.now()}`;
  const html = await buildPrintHtml(data, undefined, `parent.postMessage(${JSON.stringify(token)},'*');`);
  await new Promise<void>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    let timer = 0;
    const finish = (err?: Error) => {
      window.removeEventListener('message', onMsg);
      window.clearTimeout(timer);
      // Хэвлэгч өгөгдлөө авч дуусахыг бага зэрэг хүлээгээд устгана
      window.setTimeout(() => frame.remove(), 5000);
      if (err) reject(err); else resolve();
    };
    const onMsg = (e: MessageEvent) => { if (e.data === token) finish(); };
    window.addEventListener('message', onMsg);
    timer = window.setTimeout(() => finish(), 180000);
    frame.onerror = () => finish(new Error('Хэвлэх хуудас ачаалсангүй'));
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
  return { sms: data.sms, smsText: data.smsText ?? '', buyerPhone: data.buyerPhone ?? '' };
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
  // Цомгийн лого/текст + жижиг «Zuragchin.mn» тэмдэг (логотой нэг шугамд, сул буланд)
  const branded = await applyBrandToPurchase(blob, raw, filename, true);
  // applyBrandToPurchase алдаа гарвал эх blob-ийг буцаадаг — цомгийн логотой бол логогүй хэвлэхгүй
  if (branded === blob && layers) throw new Error('Зурагт лого нэмж чадсангүй. «Принт»-ийг дахин дарна уу.');
  blob = branded;
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
