import { Smartphone } from 'lucide-react';
import { isAndroid, isIOS } from '../lib/browserEnv';
import { useI18n } from '../lib/i18n';

/** QPay-ийн банкны апп руу шууд нээх товчнууд — лого + нэр (утсан дээр унших амар) */
export interface BankLink { name: string; description?: string; link: string; logo?: string }

/** Банкны апп зөвхөн утсан дээр нээгдэнэ (khanbank:// гэх мэт). Компьютер дээр QR уншуулна. */
export const canOpenBankApps = isAndroid || isIOS;

/** Зөвхөн qPay хэтэвч болон Хаан банкийг харуулна (бусад банкийг хасна). */
const ALLOWED: RegExp[] = [/qpay/i, /khan|хаан/i];
function allowedIndex(u: BankLink) {
  // Холбоосын бүтэн хаягийг шалгахгүй: бүх банкны холбоосонд «qPay_QRcode=» байдаг тул бүгд таарч байсан.
  // Зөвхөн нэр, тайлбар, апп-ын схем (khanbank://, qpaywallet://).
  const scheme = String(u.link ?? '').split('://')[0];
  const key = `${u.name} ${u.description ?? ''} ${scheme}`;
  return ALLOWED.findIndex(re => re.test(key));
}
export function filterBankLinks(urls: BankLink[] = []) {
  return urls
    .filter(u => allowedIndex(u) >= 0)
    .sort((a, b) => allowedIndex(a) - allowedIndex(b));
}

export default function BankLinks({ urls: rawUrls }: { urls: BankLink[] }) {
  const { t } = useI18n();
  const urls = filterBankLinks(rawUrls);
  if (!urls.length) return null;
  if (!canOpenBankApps) {
    return (
      <div className="flex items-start gap-2.5 bg-sky-500/10 border border-sky-500/25 rounded-xl p-3 text-left">
        <Smartphone className="w-5 h-5 text-sky-300 flex-shrink-0 mt-0.5" />
        <p className="text-sky-100 text-xs leading-relaxed">
          {t('Компьютер дээр банкны апп нээгдэхгүй. Утсаараа банкны аппаа нээгээд дээрх QR кодыг уншуулж төлнө үү.')}
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-2">
      {urls.map((u, i) => (
        <a key={i} href={u.link} target="_blank" rel="noreferrer"
          className="flex flex-col items-center gap-1.5 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 rounded-xl p-2 transition-colors">
          {u.logo
            ? <img src={u.logo} alt={u.name} loading="lazy" className="w-11 h-11 rounded-xl object-contain bg-white" />
            : <div className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center font-bold">{u.name.slice(0, 1)}</div>}
          <span className="text-[10px] leading-tight text-stone-300 text-center line-clamp-2">{u.description || u.name}</span>
        </a>
      ))}
    </div>
  );
}
