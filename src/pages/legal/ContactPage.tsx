import { Mail, MapPin, Phone } from 'lucide-react';
import { contactIntro } from '../../content/legal';
import { normalizeUrl, useSiteContact } from '../../lib/siteContact';
import LegalLayout from './LegalLayout';

export default function ContactPage() {
  const c = useSiteContact();
  const phone = c.contact_phone || '';
  const email = c.contact_email || 'info@zuragchin.mn';
  const address = c.contact_address || 'Улаанбаатар, Монгол';
  const phoneHref = phone ? 'tel:' + phone.replace(/[^\d+]/g, '') : '';
  const socials = [
    ['Facebook', c.social_facebook],
    ['Instagram', c.social_instagram],
    ['TikTok', c.social_tiktok],
    ['YouTube', c.social_youtube],
  ].filter((s): s is [string, string] => !!s[1]);

  return (
    <LegalLayout title="Холбоо барих" lede={contactIntro[0]}>
      <p className="text-stone-300 leading-relaxed -mt-4">{contactIntro[1]}</p>
      <section className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <a href={`mailto:${email}`} className="flex items-center gap-3 text-stone-200 hover:text-amber-300">
          <Mail className="w-5 h-5 text-amber-400" />
          <span>{email}</span>
        </a>
        {phone && (
          <a href={phoneHref} className="flex items-center gap-3 text-stone-200 hover:text-amber-300">
            <Phone className="w-5 h-5 text-amber-400" />
            <span>{phone}</span>
          </a>
        )}
        <p className="flex items-center gap-3 text-stone-200">
          <MapPin className="w-5 h-5 text-amber-400" />
          <span>{address}</span>
        </p>
        {socials.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-2">
            {socials.map(([label, url]) => (
              <a key={label} href={normalizeUrl(url)} target="_blank" rel="noopener noreferrer"
                className="text-sm text-amber-400 hover:text-amber-300 border border-white/10 rounded-xl px-3 py-1.5">
                {label}
              </a>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="text-xl font-semibold text-amber-400 mb-3">Юуны талаар бичих вэ</h2>
        <p className="text-stone-300 leading-relaxed mb-3">Цомгийн хандалт, төлбөр, татаж авах хугацаа, царайгаар хайх, зураг устгуулах, хамтын ажиллагаа.</p>
        <p className="text-stone-500 text-sm">Царайны мэдээллийн дэлгэрэнгүйг <a href="/privacy" className="text-amber-400 hover:text-amber-300">Нууцлалын бодлого</a>-оос уншина уу.</p>
      </section>
    </LegalLayout>
  );
}
