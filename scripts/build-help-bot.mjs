// knowledge.md-г help-bot/index.ts доторх KNOWLEDGE тогтмол руу суулгана.
// Ажиллуулах: node scripts/build-help-bot.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions', 'help-bot');
const md = readFileSync(join(dir, 'knowledge.md'), 'utf8')
  .split('\n')
  .filter((l) => !/build-help-bot|Үнийг энд бичихгүй/.test(l)) // засварлах тэмдэглэлийг ботод өгөхгүй
  .join('\n')
  .trim();

const file = join(dir, 'index.ts');
const src = readFileSync(file, 'utf8');
const start = src.indexOf('// <KNOWLEDGE>');
const end = src.indexOf('// </KNOWLEDGE>');
if (start < 0 || end < 0) throw new Error('KNOWLEDGE markers not found');
const head = src.slice(0, src.indexOf('\n', start) + 1);
const block = `const KNOWLEDGE = ${JSON.stringify(md)};\n`;
writeFileSync(file, head + block + src.slice(end));
console.log(`help-bot: knowledge embedded (${md.length} chars)`);
