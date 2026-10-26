/** Production origin. Canonical and Open Graph URLs always use www. */
export const SITE_ORIGIN = 'https://www.zuragchin.mn';
export const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;
export const SITE_NAME = 'Zuragchin.mn';

export interface PublicPage {
  path: string;
  /** File written into dist/. `/` is index.html. */
  file: string;
  title: string;
  description: string;
  sitemap: boolean;
  /** When false, the prerendered page and route meta send noindex. */
  index: boolean;
}

export const DEFAULT_TITLE = 'Zuragchin.mn — Арга хэмжээний зураг, зурагчид';
export const DEFAULT_DESCRIPTION =
  'Хурим, баяр наадам, спорт, хурал зэрэг арга хэмжээний зургаа олж, утсандаа шууд аваарай. Зурагчид, зохион байгуулагчид болон дурсамжийг холбогч платформ.';

export const PUBLIC_PAGES: PublicPage[] = [
  {
    path: '/',
    file: 'index.html',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    sitemap: true,
    index: true,
  },
  {
    path: '/explore',
    file: 'explore.html',
    title: 'Зургийн цомгууд — Zuragchin.mn',
    description: 'Арга хэмжээнээс өөрийн зургаа олж, шууд худалдаж аваарай. Хурим, баяр наадам, спорт, хурлын цомгууд.',
    sitemap: true,
    index: true,
  },
  {
    path: '/photographers',
    file: 'photographers.html',
    title: 'Зурагчингууд — Zuragchin.mn',
    description: 'Мэргэжлийн зурагчдын жагсаалт. Хурим, портрет, спорт, байгаль, арга хэмжээний зурагчдыг байршлаар хайна.',
    sitemap: true,
    index: true,
  },
  {
    path: '/listings',
    file: 'listings.html',
    title: 'Зурагчин хайж байна — Zuragchin.mn',
    description: 'Арга хэмжээний зурагчин хайж буй зохион байгуулагчдын зар. Зурагчид хүсэлт илгээнэ.',
    sitemap: true,
    index: true,
  },
  {
    path: '/ai-booth',
    file: 'ai-booth.html',
    title: 'AI зургийн бүүт — Zuragchin.mn',
    description: 'QR уншуулж загвар сонгоод, нүүр царайг хадгалсан AI зураг үүсгэнэ. Арга хэмжээний зургийн бүүт.',
    sitemap: true,
    index: true,
  },
  {
    path: '/terms',
    file: 'terms.html',
    title: 'Үйлчилгээний нөхцөл — Zuragchin.mn',
    description: 'Zuragchin.mn үйлчилгээний нөхцөл. Зураг байршуулах, худалдан авах, лицензийн ноорог.',
    sitemap: true,
    index: true,
  },
  {
    path: '/privacy',
    file: 'privacy.html',
    title: 'Нууцлалын бодлого — Zuragchin.mn',
    description: 'Хувийн мэдээлэл, царайгаар хайх, selfie болон царайны тоон хээг хэрхэн боловсруулдаг талаарх нууцлалын ноорог.',
    sitemap: true,
    index: true,
  },
  {
    path: '/contact',
    file: 'contact.html',
    title: 'Холбоо барих — Zuragchin.mn',
    description: 'Zuragchin.mn-тэй холбоо барих. Имэйл, утас, хаяг.',
    sitemap: true,
    index: true,
  },
  {
    path: '/auth/login',
    file: 'auth/login.html',
    title: 'Нэвтрэх — Zuragchin.mn',
    description: 'Zuragchin.mn бүртгэлдээ нэвтэрнэ үү.',
    sitemap: false,
    index: false,
  },
  {
    path: '/auth/register',
    file: 'auth/register.html',
    title: 'Бүртгүүлэх — Zuragchin.mn',
    description: 'Зурагчин, зохион байгуулагч эсвэл худалдан авагчаар Zuragchin.mn-д бүртгүүлнэ.',
    sitemap: false,
    index: false,
  },
  {
    path: '/auth/forgot-password',
    file: 'auth/forgot-password.html',
    title: 'Нууц үг сэргээх — Zuragchin.mn',
    description: 'Имэйлээр нууц үг сэргээх холбоос авна.',
    sitemap: false,
    index: false,
  },
];

export interface HeadMeta {
  title: string;
  description: string;
  path: string;
  robots: string;
}

interface DynamicRule {
  test: RegExp;
  title: string;
  description: string;
  index: boolean;
}

const DYNAMIC: DynamicRule[] = [
  {
    test: /^\/album\/[^/]+\/screen$/,
    title: 'Цомгийн дэлгэц — Zuragchin.mn',
    description: 'Арга хэмжээний цомгийг дэлгэцэн дээр харуулна.',
    index: false,
  },
  {
    test: /^\/album\/[^/]+$/,
    title: 'Цомог — Zuragchin.mn',
    description: 'Арга хэмжээний зургийн цомог. Өөрийн зургаа олж, утсандаа авна.',
    index: true,
  },
  {
    test: /^\/photographers\/[^/]+$/,
    title: 'Зурагчин — Zuragchin.mn',
    description: 'Зурагчны профайл, багц болон нийтэлсэн цомгууд.',
    index: true,
  },
  {
    test: /^\/receipt\/[^/]+$/,
    title: 'Төлбөрийн баримт — Zuragchin.mn',
    description: 'Худалдан авалтын баримт.',
    index: false,
  },
  {
    test: /^\/offer\/[^/]+$/,
    title: 'Үнийн санал — Zuragchin.mn',
    description: 'Зургийн үнийн санал.',
    index: false,
  },
  {
    test: /^\/booth\/r\/[^/]+$/,
    title: 'AI бүүтийн үр дүн — Zuragchin.mn',
    description: 'AI зургийн бүүтийн үр дүн.',
    index: false,
  },
  {
    test: /^\/booth\/[^/]+$/,
    title: 'AI зургийн бүүт — Zuragchin.mn',
    description: 'Арга хэмжээний AI зургийн бүүт.',
    index: false,
  },
  {
    test: /^\/dashboard(?:\/.*)?$/,
    title: 'Хяналтын самбар — Zuragchin.mn',
    description: 'Зурагчин болон зохион байгуулагчийн хяналтын самбар.',
    index: false,
  },
  {
    test: /^\/admin$/,
    title: 'Удирдлага — Zuragchin.mn',
    description: 'Платформын удирдлага.',
    index: false,
  },
  {
    test: /^\/albums$/,
    title: 'Миний цомгууд — Zuragchin.mn',
    description: 'Таны цомгууд.',
    index: false,
  },
  {
    test: /^\/my-purchases$/,
    title: 'Миний худалдан авалт — Zuragchin.mn',
    description: 'Төлсөн захиалгууд.',
    index: false,
  },
  {
    test: /^\/auth\/reset-password$/,
    title: 'Шинэ нууц үг — Zuragchin.mn',
    description: 'Нууц үгээ шинэчилнэ.',
    index: false,
  },
];

export function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  const noQuery = pathname.split('?')[0].split('#')[0];
  const trimmed = noQuery.length > 1 && noQuery.endsWith('/') ? noQuery.slice(0, -1) : noQuery;
  return trimmed || '/';
}

export function absoluteUrl(path: string): string {
  const p = normalizePath(path);
  return p === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${p}`;
}

export function metaForPath(pathname: string): HeadMeta {
  const path = normalizePath(pathname);
  const page = PUBLIC_PAGES.find(p => p.path === path);
  if (page) {
    return {
      title: page.title,
      description: page.description,
      path,
      robots: page.index ? 'index,follow' : 'noindex,nofollow',
    };
  }
  for (const rule of DYNAMIC) {
    if (rule.test.test(path)) {
      return {
        title: rule.title,
        description: rule.description,
        path,
        robots: rule.index ? 'index,follow' : 'noindex,nofollow',
      };
    }
  }
  return {
    title: 'Хуудас олдсонгүй — Zuragchin.mn',
    description: 'Энэ хаяг дээр хуудас алга. Нүүр, цомгууд эсвэл зурагчдын жагсаалт руу орно уу.',
    path,
    robots: 'noindex,nofollow',
  };
}

/** Paths the SPA is allowed to answer with HTTP 200. Unknown paths are HTTP 404. */
export function isKnownSpaPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (PUBLIC_PAGES.some(p => p.path === path)) return true;
  return DYNAMIC.some(rule => rule.test.test(path));
}
