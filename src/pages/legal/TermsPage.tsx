import { termsSections } from '../../content/legal';
import LegalLayout from './LegalLayout';

export default function TermsPage() {
  return (
    <LegalLayout
      title="Үйлчилгээний нөхцөл"
      lede="Zuragchin.mn платформыг ашиглах үндсэн дүрэм. Эзэмшигч хянаж батлах хүртэл ноорог."
      sections={termsSections}
    />
  );
}
