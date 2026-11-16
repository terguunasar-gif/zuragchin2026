import assert from 'node:assert/strict';
import { dropGuideCartPhoto, emptyGuide, normalizeMnPhone, ruleReply } from '../src/lib/albumGuide.ts';

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

console.log('album guide ok');
