import assert from 'node:assert/strict';
import { normalizeMnPhone, ruleReply } from '../src/lib/albumGuide.ts';

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

console.log('album guide ok');
