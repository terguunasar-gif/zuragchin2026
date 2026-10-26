import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { NOT_FOUND_MAIN, renderPageMain, SHELL_MAIN, sitemapXml } from './prerenderBodies.ts';
import { absoluteUrl, OG_IMAGE, PUBLIC_PAGES } from '../src/seo/site.ts';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function upsertCanonical(html: string, href: string): string {
  const tag = `<link rel="canonical" href="${esc(href)}" />`;
  if (/<link rel="canonical"[^>]*>/.test(html)) {
    return html.replace(/<link rel="canonical"[^>]*>/, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function upsertRobots(html: string, content: string): string {
  const tag = `<meta name="robots" content="${esc(content)}" />`;
  if (/<meta name="robots"[^>]*>/.test(html)) {
    return html.replace(/<meta name="robots"[^>]*>/, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function applyTemplate(template: string, opts: {
  title: string;
  description: string;
  path: string;
  robots: string;
  main: string;
}): string {
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(opts.title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${esc(opts.description)}" />`,
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${esc(absoluteUrl(opts.path))}" />`,
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${esc(opts.title)}" />`,
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${esc(opts.description)}" />`,
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*"\s*\/?>/,
    `<meta property="og:image" content="${esc(OG_IMAGE)}" />`,
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:image" content="${esc(OG_IMAGE)}" />`,
  );
  html = upsertCanonical(html, absoluteUrl(opts.path));
  html = upsertRobots(html, opts.robots);
  if (!html.includes('<div id="root">')) throw new Error('Built index.html is missing #root');
  html = html.replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root">${opts.main}</div>`);
  return html;
}

function assertVercel(root: string) {
  const cfg = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
    routes?: { src?: string; dest?: string; status?: number }[];
    redirects?: { statusCode?: number; destination?: string; permanent?: boolean }[];
  };
  const routes = cfg.routes ?? [];
  for (const page of PUBLIC_PAGES) {
    const dest = `/${page.file}`;
    if (!routes.some(r => r.dest === dest)) {
      throw new Error(`vercel.json has no route dest ${dest} for ${page.path}`);
    }
  }
  if (!routes.some(r => r.dest === '/app.html')) throw new Error('vercel.json missing /app.html shell route');
  if (!routes.some(r => r.status === 404 && r.dest === '/404.html')) {
    throw new Error('vercel.json missing HTTP 404 route to /404.html');
  }
  const apex = (cfg.redirects ?? []).find(r => (r.destination ?? '').startsWith('https://www.zuragchin.mn'));
  if (!apex || (apex.statusCode !== 301 && apex.statusCode !== 308 && apex.permanent !== true)) {
    throw new Error('vercel.json apex redirect must be permanent (301 or 308)');
  }
}

export function prerenderPlugin(): Plugin {
  return {
    name: 'zuragchin-prerender',
    apply: 'build',
    closeBundle() {
      const root = process.cwd();
      const dist = resolve(root, 'dist');
      const template = readFileSync(resolve(dist, 'index.html'), 'utf8');
      for (const page of PUBLIC_PAGES) {
        const html = applyTemplate(template, {
          title: page.title,
          description: page.description,
          path: page.path,
          robots: page.index ? 'index,follow' : 'noindex,nofollow',
          main: renderPageMain(page.path),
        });
        const file = resolve(dist, page.file);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, html);
      }
      writeFileSync(resolve(dist, 'app.html'), applyTemplate(template, {
        title: 'Zuragchin.mn — Арга хэмжээний зураг, зурагчид',
        description: 'Арга хэмжээний зураг, зурагчид.',
        path: '/',
        robots: 'noindex,nofollow',
        main: SHELL_MAIN,
      }));
      writeFileSync(resolve(dist, '404.html'), applyTemplate(template, {
        title: 'Хуудас олдсонгүй — Zuragchin.mn',
        description: 'Энэ хаяг дээр хуудас алга.',
        path: '/',
        robots: 'noindex,nofollow',
        main: NOT_FOUND_MAIN,
      }));
      const robots = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /dashboard',
        'Disallow: /admin',
        'Disallow: /albums',
        'Disallow: /auth/',
        'Disallow: /receipt/',
        'Disallow: /offer/',
        'Disallow: /booth/',
        'Disallow: /my-purchases',
        '',
        'Sitemap: https://www.zuragchin.mn/sitemap.xml',
        '',
      ].join('\n');
      writeFileSync(resolve(dist, 'robots.txt'), robots);
      writeFileSync(resolve(dist, 'sitemap.xml'), sitemapXml());
      assertVercel(root);
    },
  };
}
