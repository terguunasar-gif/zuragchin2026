import assert from 'node:assert/strict';
import { downloadExpired, dropGuideCartPhoto, emptyGuide, groupOwned, guidePaySummary, mergeOwned, normalizeMnPhone, prepareGuideEntry, readGuideInvoice, rememberPurchase, returningWelcome, ruleReply } from '../src/lib/albumGuide.ts';
import { canShareFiles } from '../src/lib/browserEnv.ts';

assert.equal(normalizeMnPhone('99112233'), '99112233');
assert.equal(normalizeMnPhone('9911 2233'), '99112233');
assert.equal(normalizeMnPhone('+976 99112233'), '99112233');
assert.equal(normalizeMnPhone('97699112233'), '99112233');
assert.equal(normalizeMnPhone('9911223'), null);
assert.equal(normalizeMnPhone('123456789'), null);

const folders = [{ id: 'a', name: 'Хайрт' }, { id: 'b', name: 'Бүжиг' }];
assert.equal(ruleReply('Тийм', folders)?.action, 'yes');
assert.equal(ruleReply('үгүй', folders)?.action, 'no');
assert.equal(ruleReply('Бүжиг', folders)?.folderId, 'b');
assert.equal(ruleReply('ямар үнэтэй вэ?', folders), null);

const cart = {
  ...emptyGuide(),
  step: 'choices' as const,
  selected: ['a', 'b'],
  choices: [
    { photoId: 'a', download: true, print: false },
    { photoId: 'b', download: false, print: true, printSize: '10x15' },
  ],
  messages: [{ role: 'bot' as const, text: 'сонго' }],
};
const oneLeft = dropGuideCartPhoto(cart, 'a');
assert.deepEqual(oneLeft.selected, ['b']);
assert.deepEqual(oneLeft.choices.map(c => c.photoId), ['b']);
assert.equal(oneLeft.step, 'choices');
const emptied = dropGuideCartPhoto(oneLeft, 'b');
assert.equal(emptied.step, 'browse');
assert.deepEqual(emptied.choices, []);
assert.deepEqual(emptied.selected, []);
assert.match(emptied.messages.at(-1)?.text ?? '', /Сагс хоосон/);
assert.equal(dropGuideCartPhoto(cart, 'missing'), cart);

assert.equal(
  guidePaySummary('Бат', 3, 2, 1, '₮4,000'),
  'Бат, та 3 зураг сонгосон байна (татах 2, угаалгах 1). Нийт ₮4,000 төлнө.',
);
assert.equal(readGuideInvoice(null), null);
assert.equal(readGuideInvoice({ invoiceId: 'inv', qrImage: 'aa', grossTotal: 1000, urls: [{ name: 'QPay', link: 'qpaywallet://x' }, { name: 1 }] })?.urls.length, 1);

const known = { ...emptyGuide(), name: 'Бат', phone: '99112233', step: 'done' as const };
const back = prepareGuideEntry(known, 'Хайрт');
assert.equal(back.step, 'greet');
assert.equal(back.known, true);
assert.equal(back.declined, false);
assert.equal(back.messages[0].text, returningWelcome('Бат', 'Хайрт'));
assert.match(back.messages[0].text, /Сайн байна уу, Бат! «Хайрт» цомогт орсон байна/);
assert.equal(prepareGuideEntry({ ...known, step: 'browse' }, 'Хайрт').step, 'browse');
assert.equal(prepareGuideEntry(emptyGuide(), 'Хайрт').step, 'welcome');

const saved = rememberPurchase(known, 'inv1', [{ photoId: 'p', type: 'download', filename: 'a.jpg' }]);
assert.deepEqual(saved.paidInvoices, ['inv1']);
assert.equal(saved.step, 'welcome');
const again = rememberPurchase(saved, 'inv1', [{ photoId: 'p', type: 'download', filename: 'a.jpg' }]);
assert.equal(again.owned?.length, 1);
assert.equal(groupOwned(again.owned ?? []).length, 1);
assert.equal(mergeOwned(again.owned ?? [], [{ photoId: 'p', invoiceId: 'inv1', type: 'download', filename: 'a.jpg', expiresAt: '2000-01-01' }])[0].expiresAt, '2000-01-01');
assert.equal(downloadExpired('2000-01-01T00:00:00Z'), true);
assert.equal(downloadExpired('2999-01-01T00:00:00Z'), false);
assert.equal(downloadExpired(null), false);
assert.equal(canShareFiles([]), false);

console.log('album guide ok');
