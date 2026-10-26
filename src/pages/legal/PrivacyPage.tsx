import { Link } from 'react-router-dom';
import { privacySections } from '../../content/legal';
import LegalLayout from './LegalLayout';

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Нууцлалын бодлого"
      lede="Хувийн мэдээлэл болон царайгаар хайх функцийн мэдээллийг хэрхэн хамгаалдаг тухай. Эзэмшигч хянаж батлах хүртэл ноорог."
      sections={privacySections}
    >
      <section>
        <h2 className="text-xl font-semibold text-amber-400 mb-3">Холбоо барих</h2>
        <p className="text-stone-300 leading-relaxed">
          Нууцлалын хүсэлт, царайны мэдээллээ устгуулах, энэ нооргийг засах саналаа{' '}
          <a href="mailto:info@zuragchin.mn" className="text-amber-400 hover:text-amber-300">info@zuragchin.mn</a>
          {' '}хаягаар илгээнэ үү. Бусад суваг <Link to="/contact" className="text-amber-400 hover:text-amber-300">Холбоо барих</Link> хуудсанд байна.
        </p>
      </section>
    </LegalLayout>
  );
}
