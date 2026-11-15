import assert from 'node:assert/strict';
import { movePage, pageStartIndex, parseKioskLayout } from '../src/lib/kioskLayout.ts';

assert.equal(parseKioskLayout(null), 1);
assert.equal(parseKioskLayout('1'), 1);
assert.equal(parseKioskLayout('4'), 4);
assert.equal(parseKioskLayout('9'), 9);
assert.equal(parseKioskLayout('2'), 1);
assert.equal(parseKioskLayout('16'), 1);

assert.equal(movePage(0, 1, 10, 1), 1);
assert.equal(movePage(9, 1, 10, 1), 0);
assert.equal(movePage(0, -1, 10, 1), 9);
assert.equal(movePage(3, -1, 10, 1), 2);

assert.equal(movePage(0, 1, 10, 4), 4);
assert.equal(movePage(5, 1, 10, 4), 8);
assert.equal(movePage(9, 1, 10, 4), 0);
assert.equal(movePage(8, -1, 10, 4), 4);
assert.equal(movePage(2, -1, 10, 4), 8);

assert.equal(movePage(0, 1, 10, 9), 9);
assert.equal(movePage(3, 1, 10, 9), 9);
assert.equal(movePage(9, 1, 10, 9), 0);
assert.equal(movePage(9, -1, 10, 9), 0);

assert.equal(pageStartIndex(100, 291, 9), 99);
assert.equal(pageStartIndex(100, 291, 4), 100);
assert.equal(pageStartIndex(0, 291, 9), 0);
assert.equal(pageStartIndex(290, 291, 9), 288);
assert.equal(pageStartIndex(500, 10, 4), 8);
assert.equal(movePage(0, 1, 0, 4), 0);
assert.equal(pageStartIndex(0, 0, 4), 0);

console.log('kiosk layout ok');
