/** Энэ төхөөрөмжөөс илгээсэн үнийн саналын токенууд (зочин дараа нь буцаж ирэхэд) */
const KEY = 'zm_offer_tokens';

export function rememberOffer(token: string) {
  try {
    const list = listOffers().filter(t => t !== token);
    list.unshift(token);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch { /* хувийн цонх */ }
}

export function listOffers(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const QPAY_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qpay`;

export type OfferStatus = 'pending' | 'countered' | 'accepted' | 'rejected' | 'paid' | 'cancelled';

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  pending: 'Хариу хүлээж байна',
  countered: 'Зурагчин өөр үнэ санал болгосон',
  accepted: 'Зөвшөөрсөн — төлбөр хүлээж байна',
  rejected: 'Татгалзсан',
  paid: 'Төлөгдсөн',
  cancelled: 'Цуцлагдсан / хугацаа дууссан',
};
