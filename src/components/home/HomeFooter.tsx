import { useNavigate } from 'react-router-dom';
import { Facebook, Instagram, Mail, MapPin, Music2, Phone, Youtube } from 'lucide-react';
import { BrandLogo } from '../BrandMark';
import { normalizeUrl, useSiteContact } from '../../lib/siteContact';

/** Доод хэсэг: холбоо барих, Facebook, зохиогчийн эрх, нөхцөл/нууцлал. Бусад сошиалыг админ тохируулсан бол харуулна. */
export default function HomeFooter() {
  const navigate = useNavigate();
  const c = useSiteContact();
  const year = new Date().getFullYear();
  const socials = [
    { url: c.social_facebook, icon: <Facebook className="w-4 h-4" />, label: 'Facebook', cls: 'hover:bg-blue-500/20 hover:border-blue-500/30 hover:text-blue-400' },
    { url: c.social_instagram, icon: <Instagram className="w-4 h-4" />, label: 'Instagram', cls: 'hover:bg-pink-500/20 hover:border-pink-500/30 hover:text-pink-400' },
    { url: c.social_tiktok, icon: <Music2 className="w-4 h-4" />, label: 'TikTok', cls: 'hover:bg-white/15 hover:border-white/30 hover:text-white' },
    { url: c.social_youtube, icon: <Youtube className="w-4 h-4" />, label: 'YouTube', cls: 'hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400' },
  ].filter(s => !!s.url);
  const phoneHref = c.contact_phone ? 'tel:' + c.contact_phone.replace(/[^\d+]/g, '') : '';

  return (
    <footer className="border-t border-white/10 px-4 sm:px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <BrandLogo />
        <p className="text-stone-500 text-sm leading-relaxed mt-3 max-w-md">
          Зурагчид болон зохион байгуулагчдыг холбогч Монголын тэргүүлэх платформ.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8">
          <div>
            <h2 className="text-white font-semibold mb-3">Холбоо барих</h2>
            <div className="space-y-2">
              {c.contact_phone && (
                <a href={phoneHref} className="flex items-center gap-2 text-stone-400 hover:text-white text-sm">
                  <Phone className="w-4 h-4" /><span>{c.contact_phone}</span>
                </a>
              )}
              {c.contact_email && (
                <a href={`mailto:${c.contact_email}`} className="flex items-center gap-2 text-stone-400 hover:text-white text-sm">
                  <Mail className="w-4 h-4" /><span>{c.contact_email}</span>
                </a>
              )}
              <div className="flex items-center gap-2 text-stone-400 text-sm">
                <MapPin className="w-4 h-4" /><span>{c.contact_address || 'Улаанбаатар, Монгол'}</span>
              </div>
            </div>
          </div>
          {socials.length > 0 && (
            <div>
              <h2 className="text-white font-semibold mb-3">{socials.some(s => s.label === 'Facebook') && socials.length === 1 ? 'Facebook' : 'Сошиал хаяг'}</h2>
              <div className="flex gap-3">
                {socials.map(s => (
                  <a
                    key={s.label}
                    href={normalizeUrl(s.url!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={s.label}
                    aria-label={s.label}
                    className={`w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-stone-400 transition-all ${s.cls}`}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 mt-8 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-stone-500 text-sm">
          <p>© {year} Zuragchin.mn — Бүх эрх хуулиар хамгаалагдсан</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" onClick={() => navigate('/terms')} className="hover:text-white">Үйлчилгээний нөхцөл</button>
            <button type="button" onClick={() => navigate('/privacy')} className="hover:text-white">Нууцлал</button>
            <button type="button" onClick={() => navigate('/contact')} className="hover:text-white">Холбоо барих</button>
          </nav>
        </div>
      </div>
    </footer>
  );
}
