import { contactIntro, DRAFT_NOTICE, privacySections, termsSections, LegalSection } from '../src/content/legal.ts';
import { absoluteUrl, PUBLIC_PAGES } from '../src/seo/site.ts';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function chrome(inner: string): string {
  return `<main class="min-h-screen bg-stone-950 text-white">
  <header class="border-b border-white/10">
    <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
      <a href="/" class="font-brand text-white font-semibold tracking-tight">Zuragchin<span class="text-amber-400">.mn</span></a>
      <nav class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-300">
        <a href="/explore">Цомгууд</a>
        <a href="/photographers">Зурагчид</a>
        <a href="/listings">Зурагчин хайх</a>
        <a href="/ai-booth">AI бүүт</a>
        <a href="/contact">Холбоо барих</a>
      </nav>
    </div>
  </header>
  ${inner}
</main>`;
}

function article(h1: string, paragraphs: string[], extra = ''): string {
  const body = paragraphs.map(p => `<p class="text-stone-300 leading-relaxed mb-3">${esc(p)}</p>`).join('\n');
  return chrome(`<article class="max-w-3xl mx-auto px-6 py-16">
    <h1 class="text-4xl font-bold mb-6">${esc(h1)}</h1>
    ${body}
    ${extra}
  </article>`);
}

function sectionsHtml(sections: LegalSection[]): string {
  return sections.map(s => `<section class="mb-8">
    <h2 class="text-xl font-semibold text-amber-400 mb-3">${esc(s.heading)}</h2>
    ${s.paragraphs.map(p => `<p class="text-stone-300 leading-relaxed mb-3">${esc(p)}</p>`).join('\n')}
  </section>`).join('\n');
}

const BODIES: Record<string, string> = {
  '/': chrome(`<article class="max-w-4xl mx-auto px-6 py-20 text-center">
    <h1 class="text-5xl font-bold mb-6 leading-tight">Гэрэл зургаараа<br /><span class="text-amber-400">ашиг олох шинэ боломж</span></h1>
    <p class="text-stone-400 text-lg mb-8">Зурагчид, зохион байгуулагчид болон дурсамжийг холбогч платформ.</p>
    <p class="text-stone-300 mb-8">Хурим, баяр наадам, спорт, соёл, хөгжим, марафон, хурал уулзалтын зургаа олж, утсандаа шууд аваарай.</p>
    <p class="flex flex-wrap justify-center gap-3 text-sm">
      <a class="bg-amber-500 text-stone-950 font-semibold px-4 py-2 rounded-xl" href="/explore">Цомгууд үзэх</a>
      <a class="border border-white/15 px-4 py-2 rounded-xl" href="/photographers">Зурагчингууд</a>
      <a class="border border-white/15 px-4 py-2 rounded-xl" href="/auth/register">Бүртгүүлэх</a>
    </p>
  </article>
  <section class="max-w-7xl mx-auto px-6 pb-16">
    <h2 class="text-2xl font-bold mb-3">Зурагчингууд</h2>
    <p class="text-stone-400 mb-4">Мэргэжлийн зурагчдыг чиглэл, байршлаар хайна.</p>
    <h2 class="text-2xl font-bold mb-3">Цомгууд</h2>
    <p class="text-stone-400">Нийтлэгдсэн арга хэмжээний цомгоос өөрийн зургаа олно.</p>
  </section>`),
  '/explore': article('Зургийн цомгууд', [
    'Арга хэмжээнээс өөрийн зургаа олж, шууд худалдаж аваарай.',
    'Хурим, баяр наадам, спорт, соёл, хөгжим, марафон, хурал уулзалтын цомгууд энд гарна.',
  ], '<p><a class="text-amber-400" href="/photographers">Зурагчингууд</a></p>'),
  '/photographers': article('Зурагчингууд', [
    'Мэргэжлийн зурагчдын жагсаалт.',
    'Нэр, чиглэл, байршлаар хайж, профайл болон багцыг үзнэ.',
  ]),
  '/listings': article('Зурагчин хайж байна', [
    'Арга хэмжээний зурагчин хайж буй зохион байгуулагчид.',
    'Зурагчид нээлттэй зарлалд хүсэлт илгээж болно.',
  ]),
  '/ai-booth': article('AI зургийн бүүтийн загварын цомог', [
    'Зочид QR уншуулж, загвар сонгоод 1–4 хүн зогсоход хиймэл оюун кино шиг зургийг үүсгэнэ.',
    'Нүүр царайг хадгалахыг зорьдог бөгөөд арга хэмжээний лого, нэр сууж болно.',
    'Царайны боловсруулалтын талаар Нууцлалын бодлогоос уншина уу.',
  ], '<p><a class="text-amber-400" href="/privacy">Нууцлалын бодлого</a></p>'),
  '/terms': chrome(`<article class="max-w-3xl mx-auto px-6 py-12">
    <p class="text-amber-300 text-sm mb-6">${esc(DRAFT_NOTICE)}</p>
    <h1 class="text-4xl font-bold mb-4">Үйлчилгээний нөхцөл</h1>
    <p class="text-stone-400 text-lg mb-8">Zuragchin.mn платформыг ашиглах үндсэн дүрэм.</p>
    ${sectionsHtml(termsSections)}
  </article>`),
  '/privacy': chrome(`<article class="max-w-3xl mx-auto px-6 py-12">
    <p class="text-amber-300 text-sm mb-6">${esc(DRAFT_NOTICE)}</p>
    <h1 class="text-4xl font-bold mb-4">Нууцлалын бодлого</h1>
    <p class="text-stone-400 text-lg mb-8">Хувийн мэдээлэл болон царайгаар хайх функцийн мэдээлэл.</p>
    ${sectionsHtml(privacySections)}
    <p class="text-stone-300">Хүсэлт: <a class="text-amber-400" href="mailto:info@zuragchin.mn">info@zuragchin.mn</a>. <a class="text-amber-400" href="/contact">Холбоо барих</a>.</p>
  </article>`),
  '/contact': article('Холбоо барих', contactIntro, `<p class="text-stone-200">Имэйл: <a class="text-amber-400" href="mailto:info@zuragchin.mn">info@zuragchin.mn</a></p>
    <p class="text-stone-200">Хаяг: Улаанбаатар, Монгол</p>
    <p><a class="text-amber-400" href="/privacy">Нууцлалын бодлого</a> · <a class="text-amber-400" href="/terms">Үйлчилгээний нөхцөл</a></p>`),
  '/auth/login': article('Тавтай морилно уу', [
    'Өөрийн бүртгэлд нэвтрэнэ үү.',
    'Имэйл, нууц үг эсвэл Google-ээр нэвтэрнэ.',
  ], '<p><a class="text-amber-400" href="/auth/register">Бүртгүүлэх</a></p>'),
  '/auth/register': article('Бүртгэл үүсгэх', [
    'Zuragchin.mn-д нэгдэнэ үү.',
    'Бүртгэл үүсгэснээр та Үйлчилгээний нөхцөл болон Нууцлалын бодлогыг зөвшөөрч байна.',
  ], '<p><a class="text-amber-400" href="/terms">Үйлчилгээний нөхцөл</a> · <a class="text-amber-400" href="/privacy">Нууцлалын бодлого</a></p>'),
  '/auth/forgot-password': article('Нууц үг мартсан уу?', [
    'Имэйлээ оруулаад нууц үг сэргээх холбоос илгээнэ.',
  ]),
};

export function renderPageMain(path: string): string {
  const html = BODIES[path];
  if (!html) throw new Error(`Missing prerender body for ${path}`);
  return html;
}

export const SHELL_MAIN = chrome(`<article class="max-w-3xl mx-auto px-6 py-16">
  <h1 class="text-3xl font-bold mb-3">Zuragchin.mn</h1>
  <p class="text-stone-300">Арга хэмжээний зураг, зурагчид. Хуудас ачааллаж байна.</p>
</article>`);

export const NOT_FOUND_MAIN = chrome(`<article class="max-w-xl mx-auto px-6 py-20 text-center">
  <p class="text-amber-400 font-semibold mb-3">404</p>
  <h1 class="text-3xl font-bold mb-3">Хуудас олдсонгүй</h1>
  <p class="text-stone-300 mb-6">Энэ хаяг дээр хуудас алга. Холбоос хуучирсан эсвэл буруу бичигдсэн байж болно.</p>
  <p class="flex flex-wrap justify-center gap-3">
    <a class="bg-amber-500 text-stone-950 font-semibold px-4 py-2 rounded-xl" href="/">Нүүр хуудас</a>
    <a class="border border-white/15 px-4 py-2 rounded-xl" href="/explore">Цомгууд</a>
    <a class="border border-white/15 px-4 py-2 rounded-xl" href="/photographers">Зурагчид</a>
  </p>
</article>`);

export function sitemapXml(): string {
  const urls = PUBLIC_PAGES.filter(p => p.sitemap).map(p => `  <url><loc>${esc(absoluteUrl(p.path))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
