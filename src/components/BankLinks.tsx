import { useState } from 'react';
import { Smartphone } from 'lucide-react';
import { isAndroid, isIOS } from '../lib/browserEnv';
import { useI18n } from '../lib/i18n';

/** QPay-ийн банкны апп руу шууд нээх товчнууд — лого + нэр (утсан дээр унших амар) */
export interface BankLink { name: string; description?: string; link: string; logo?: string }

/** Банкны апп зөвхөн утсан дээр нээгдэнэ (khanbank:// гэх мэт). Компьютер дээр QR уншуулна. */
export const canOpenBankApps = isAndroid || isIOS;

/**
 * Харуулах банкууд (энэ дарааллаар). QPay-ийн жагсаалтаас нэр/тайлбар/апп-ын схемээр таниулна.
 * Нэрийг БҮТНЭЭР нь эсвэл тодорхой түлхүүр үгээр тулгана — «Чингис Хаан банк» шиг хэсэгчилсэн таарцыг оруулахгүй.
 * Нэг банк QPay-д 2 удаа (жишээ нь Голомт + SocialPay) ирвэл эхнийх нь л харагдана.
 */
interface AllowedBank {
  label: string;
  /** QPay лого ирээгүй үед ашиглах лого */
  fallbackLogo: string;
  match: (name: string, desc: string, scheme: string) => boolean;
  /** Нэг банкны хоёр апп ирвэл аль нь давуу (жишээ нь Голомт банкны апп > SocialPay) */
  prefer?: (scheme: string) => boolean;
}
const QPAY_LOGO = 'https://qpay.mn/q/logo/';
const ALLOWED: AllowedBank[] = [
  { label: 'qPay хэтэвч', fallbackLogo: '',
    match: (n, d, sc) => sc === 'qpaywallet' || /^qpay (wallet|хэтэвч)$/.test(n) || /^qpay (wallet|хэтэвч)$/.test(d) },
  { label: 'Хаан банк', fallbackLogo: QPAY_LOGO + 'khanbank.png',
    match: (n, d, sc) => sc === 'khanbank' || n === 'khan bank' || d === 'хаан банк' },
  { label: 'ХХБ', fallbackLogo: QPAY_LOGO + 'tdbbank.png',
    match: (n, d, sc) => sc === 'tdbbank' || /(^|\s)tdb(\s|$)/.test(n) || /trade and development/.test(n) || /худалдаа хөгжлийн/.test(d) || /(^|\s)tdb(\s|$)/.test(d) },
  { label: 'Хас банк', fallbackLogo: QPAY_LOGO + 'xacbank.png',
    match: (n, d, sc) => sc === 'xacbank' || n === 'xac bank' || n === 'xacbank' || d === 'хас банк' },
  { label: 'Голомт банк', fallbackLogo: QPAY_LOGO + 'socialpay.png', // QPay-д Голомт нь SocialPay апп-аар орж ирдэг
    match: (n, d, sc) => sc === 'golomtbank' || sc === 'socialpay-payment' || /golomt/.test(n) || /голомт/.test(d) || /^social ?pay$/.test(n),
    prefer: sc => sc === 'golomtbank' },
];
function allowedIndex(u: BankLink) {
  // Холбоосын бүтэн хаягийг шалгахгүй: бүх банкны холбоосонд «qPay_QRcode=» байдаг.
  const norm = (v?: string) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const scheme = norm(String(u.link ?? '').split('://')[0]);
  return ALLOWED.findIndex(b => b.match(norm(u.name), norm(u.description), scheme));
}
export function filterBankLinks(urls: BankLink[] = []): (BankLink & { label: string; fallbackLogo: string })[] {
  const schemeOf = (u: BankLink) => String(u.link ?? '').split('://')[0].trim().toLowerCase();
  const picked = new Map<number, BankLink>();
  for (const u of urls) {
    const i = allowedIndex(u);
    if (i < 0) continue;
    if (!picked.has(i) || ALLOWED[i].prefer?.(schemeOf(u))) picked.set(i, u);
  }
  return [...picked.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, u]) => ({ ...u, label: ALLOWED[i].label, fallbackLogo: ALLOWED[i].fallbackLogo }));
}

function BankLogo({ src, fallback, name }: { src?: string; fallback: string; name: string }) {
  const [url, setUrl] = useState(src || fallback);
  const [failed, setFailed] = useState(!src && !fallback);
  if (failed) {
    return <div className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center font-bold">{name.slice(0, 1)}</div>;
  }
  return (
    <img src={url} alt={name} loading="lazy" className="w-11 h-11 rounded-xl object-contain bg-white"
      onError={() => (fallback && url !== fallback ? setUrl(fallback) : setFailed(true))} />
  );
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
    <div className="grid grid-cols-5 gap-1.5">
      {urls.map((u, i) => (
        <a key={i} href={u.link} target="_blank" rel="noreferrer"
          className="flex flex-col items-center gap-1.5 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 rounded-xl px-1 py-2 transition-colors">
          <BankLogo src={u.logo} fallback={u.fallbackLogo} name={u.label} />
          <span className="text-[10px] leading-tight text-stone-300 text-center line-clamp-2">{u.label}</span>
        </a>
      ))}
    </div>
  );
}
