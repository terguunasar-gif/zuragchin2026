/** QPay-ийн банкны апп руу шууд нээх товчнууд — лого + нэр (утсан дээр унших амар) */
export interface BankLink { name: string; description?: string; link: string; logo?: string }

export default function BankLinks({ urls }: { urls: BankLink[] }) {
  if (!urls?.length) return null;
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
