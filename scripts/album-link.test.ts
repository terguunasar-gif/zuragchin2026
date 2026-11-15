import assert from 'node:assert/strict';
import { isMissingColumnError, normalizeShareLink, readAlbumQuery } from '../src/lib/albumLink.ts';

const id = '1f0c6cba-59b0-4889-8297-df7b2f026326';

assert.equal(normalizeShareLink(`  ${id}  `), id);
assert.equal(normalizeShareLink(`${id}/`), id);
assert.equal(normalizeShareLink(`${id}.`), id);
assert.equal(normalizeShareLink(`${id},`), id);
assert.equal(normalizeShareLink(`${id})`), id);
assert.equal(normalizeShareLink(`${id}?fbclid=IwAR0abc&utm_source=fb`), id);
assert.equal(normalizeShareLink(`${id}%3Ffbclid%3DIwAR0abc`), id);
assert.equal(normalizeShareLink(`${id}&fbclid=IwAR0abc`), id);
assert.equal(normalizeShareLink(`%2Falbum%2F${id}%2F`), id);
assert.equal(normalizeShareLink(`/album/${id}/`), id);
assert.equal(normalizeShareLink(`${id}%253Ffbclid%253Dxx`), id);
assert.equal(normalizeShareLink(''), '');
assert.equal(normalizeShareLink(null), '');

assert.equal(isMissingColumnError({ code: '42703', message: 'column albums.free_activated does not exist' }), true);
assert.equal(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'expires_at' column of 'albums' in the schema cache" }), true);
assert.equal(isMissingColumnError({ message: 'Сүлжээ удаан байна. Дахин оролдоно уу.' }), false);
assert.equal(isMissingColumnError(null), false);

let calls = 0;
const recovered = await readAlbumQuery(async () => {
  calls += 1;
  if (calls === 1) throw new Error('Сүлжээ удаан байна. Дахин оролдоно уу.');
  return { data: { id: 'ok' }, error: null };
});
assert.equal(recovered.error, null);
assert.equal(recovered.data?.id, 'ok');
assert.equal(calls, 2);

calls = 0;
const failed = await readAlbumQuery(async () => {
  calls += 1;
  return { data: null, error: { message: 'fetch failed' } };
});
assert.equal(failed.data, null);
assert.equal(failed.error?.message, 'fetch failed');
assert.equal(calls, 2);

calls = 0;
const schema = await readAlbumQuery(async () => {
  calls += 1;
  return { data: null, error: { code: '42703', message: 'column albums.expires_at does not exist' } };
});
assert.equal(schema.error?.code, '42703');
assert.equal(calls, 1);

const empty = await readAlbumQuery(async () => ({ data: null, error: null }));
assert.equal(empty.data, null);
assert.equal(empty.error, null);

console.log('album link ok');
