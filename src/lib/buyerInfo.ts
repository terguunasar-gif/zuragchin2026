/**
 * Худалдан авагчийн нэр, утсыг энэ төхөөрөмж дээр санана — дараагийн худалдан авалт,
 * үнийн санал, угаалгах хүсэлтэд автоматаар бөглөгдөнө (дахин бичих шаардлагагүй).
 * Зөвхөн тухайн хүний өөрийн хөтөчид (localStorage) хадгалагдана.
 */
const KEY = 'zuragchin.buyer';

export interface BuyerInfo { name: string; phone: string; email: string }

export function loadBuyerInfo(): BuyerInfo {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      name: String(raw?.name ?? ''),
      phone: String(raw?.phone ?? ''),
      email: String(raw?.email ?? ''),
    };
  } catch {
    return { name: '', phone: '', email: '' };
  }
}

/** email өгөхгүй бол өмнө хадгалсан имэйлийг хэвээр үлдээнэ. */
export function saveBuyerInfo(name: string, phone: string, email?: string) {
  try {
    const prev = loadBuyerInfo();
    const n = name.trim();
    const p = phone.trim();
    const e = (email === undefined ? prev.email : email).trim().toLowerCase();
    if (n || p || e) localStorage.setItem(KEY, JSON.stringify({ name: n, phone: p, email: e }));
  } catch { /* хувийн горим г.м. — санахгүй */ }
}
