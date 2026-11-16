import assert from 'node:assert/strict';
import { everyDownloaded, idsWithServerDownloads, withoutDownloaded } from '../src/lib/receiptDownloads.ts';

const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  },
});

const { readDownloadedIds, writeDownloadedIds } = await import('../src/lib/receiptDownloads.ts');

assert.deepEqual(idsWithServerDownloads([
  { id: 'a', downloadCount: 2 },
  { id: 'b', downloadCount: 0 },
  { id: 'c', downloadCount: null },
  { id: '', downloadCount: 3 },
]), ['a']);

assert.deepEqual(withoutDownloaded(['a', 'b', 'c'], ['a']), ['b', 'c']);
assert.equal(everyDownloaded(['a', 'b'], ['a', 'b']), true);
assert.equal(everyDownloaded(['a', 'b'], ['a']), false);
assert.equal(everyDownloaded([], ['a']), false);

assert.deepEqual(readDownloadedIds('inv'), []);
assert.deepEqual(writeDownloadedIds('inv', ['a', 'a', '']), ['a']);
assert.deepEqual(writeDownloadedIds('inv', ['b']), ['a', 'b']);
assert.deepEqual(readDownloadedIds('inv'), ['a', 'b']);
assert.deepEqual(readDownloadedIds('other'), []);

console.log('receipt downloads ok');
