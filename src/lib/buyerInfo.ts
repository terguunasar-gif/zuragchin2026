/**
 * Худалдан авагчийн нэр, утсыг энэ төхөөрөмж дээр санана — дараагийн худалдан авалт,
 * үнийн санал, угаалгах хүсэлтэд автоматаар бөглөгдөнө (дахин бичих шаардлагагүй).
 * Зөвхөн тухайн хүний өөрийн хөтөчид (localStorage) хадгалагдана.
 */
const KEY = 'zuragchin.buyer';

export interface BuyerInfo { name: string; phone: string }

export function loadBuyerInfo(): BuyerInfo {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { name: String(raw?.name ?? ''), phone: String(raw?.phone ?? '') };
  } catch {
    return { name: '', phone: '' };
  }
}

export function saveBuyerInfo(name: string, phone: string) {
  try {
    const n = name.trim(), p = phone.trim();
    if (n || p) localStorage.setItem(KEY, JSON.stringify({ name: n, phone: p }));
  } catch { /* хувийн горим г.м. — санахгүй */ }
}
