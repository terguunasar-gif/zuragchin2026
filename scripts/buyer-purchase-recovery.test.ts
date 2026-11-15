import assert from 'node:assert/strict';
import {
  emailRateSubject,
  groupPaidPurchases,
  groupPaidPurchasesByEmail,
  isSixDigitCode,
  normalizeEmail,
  normalizePhone,
  randomCode,
  retryAfterSeconds,
  timingSafeEqual,
  type PaidRow,
} from '../supabase/functions/buyer-purchases/logic.ts';

assert.equal(normalizePhone('99112233'), '99112233');
assert.equal(normalizePhone(' 9911 2233 '), '99112233');
assert.equal(normalizePhone('+97699112233'), '99112233');
assert.equal(normalizePhone('97699112233'), '99112233');
assert.equal(normalizePhone('9911223'), null);
assert.equal(normalizePhone('991122334'), null);
assert.equal(normalizePhone('123456789012'), null);

assert.equal(normalizeEmail(' Buyer@Example.COM '), 'buyer@example.com');
assert.equal(normalizeEmail('photo.fan+order@gmail.com'), 'photo.fan+order@gmail.com');
assert.equal(normalizeEmail(''), null);
assert.equal(normalizeEmail('not-an-email'), null);
assert.equal(normalizeEmail('a@localhost'), null);
assert.equal(normalizeEmail('a@b..com'), null);
assert.equal(emailRateSubject('buyer@example.com'), 'e:buyer@example.com');
assert.equal(/^\d{8}$/.test(emailRateSubject('buyer@example.com')), false);

assert.equal(isSixDigitCode('012345'), true);
assert.equal(isSixDigitCode('12345'), false);
assert.equal(isSixDigitCode('1234567'), false);
assert.equal(isSixDigitCode('12 3456'), false);

assert.equal(timingSafeEqual('abc', 'abc'), true);
assert.equal(timingSafeEqual('abc', 'abd'), false);
assert.equal(timingSafeEqual('abc', 'abcd'), false);
assert.equal(timingSafeEqual('', ''), true);

const code = randomCode();
assert.match(code, /^\d{6}$/);

const now = 1_000_000;
const hit = (ago: number) => now - ago;
assert.equal(retryAfterSeconds(now, [hit(10), hit(20), hit(30)], 60_000, 3), 0);
const wait = retryAfterSeconds(now, [hit(1_000), hit(2_000), hit(3_000), hit(4_000)], 60_000, 3);
assert.ok(wait > 50 && wait <= 60);

const row = (over: Partial<PaidRow>): PaidRow => ({
  qpay_invoice_id: '11111111-1111-1111-1111-111111111111',
  created_at: '2026-11-01T00:00:00.000Z',
  album_id: 'album-1',
  type: 'download',
  gross_amount: 5000,
  buyer_name: 'Болд',
  buyer_phone: '99112233',
  buyer_email: 'buyer@example.com',
  album_name: 'name',
  album_title: 'Хурим',
  share_link: '/album/wedding',
  ...over,
});

const orders = groupPaidPurchases('99112233', [
  row({ type: 'download', gross_amount: 5000, created_at: '2026-11-01T00:00:00.000Z' }),
  row({ type: 'print', gross_amount: 8000, created_at: '2026-11-01T00:00:01.000Z' }),
  row({
    qpay_invoice_id: '22222222-2222-2222-2222-222222222222',
    type: 'download',
    gross_amount: 3000,
    created_at: '2026-11-02T00:00:00.000Z',
    album_title: '',
    album_name: 'Наадам',
    share_link: 'naadam',
  }),
]);
assert.ok(orders);
assert.equal(orders.length, 2);
assert.equal(orders[0].invoiceId, '22222222-2222-2222-2222-222222222222');
assert.equal(orders[0].albumName, 'Наадам');
assert.equal(orders[0].albumLink, 'naadam');
assert.equal(orders[0].downloads, 1);
assert.equal(orders[1].downloads, 1);
assert.equal(orders[1].prints, 1);
assert.equal(orders[1].total, 13000);
assert.equal(orders[1].albumName, 'Хурим');
assert.equal(orders[1].albumLink, 'wedding');
assert.equal(orders[1].buyerName, 'Болд');
assert.equal('buyer_phone' in orders[0], false);
assert.equal('buyer_phone' in orders[1], false);

assert.equal(groupPaidPurchases('99112233', [row({ buyer_phone: '88001122' })]), null);
assert.deepEqual(groupPaidPurchases('99112233', [row({ qpay_invoice_id: '../etc' })]), []);
assert.deepEqual(groupPaidPurchases('99112233', []), []);

const byEmail = groupPaidPurchasesByEmail('buyer@example.com', [
  row({ type: 'download', gross_amount: 5000 }),
  row({ type: 'print', gross_amount: 2000, buyer_phone: '88001122' }),
]);
assert.ok(byEmail);
assert.equal(byEmail.length, 1);
assert.equal(byEmail[0].downloads, 1);
assert.equal(byEmail[0].prints, 1);
assert.equal(byEmail[0].total, 7000);
assert.equal('buyer_email' in byEmail[0], false);

const narrowed = groupPaidPurchasesByEmail('buyer@example.com', [
  row({ type: 'download' }),
  row({ type: 'print', buyer_phone: '88001122', qpay_invoice_id: '33333333-3333-3333-3333-333333333333' }),
], '99112233');
assert.equal(narrowed, null);
assert.equal(groupPaidPurchasesByEmail('buyer@example.com', [row({ buyer_email: 'other@example.com' })]), null);
assert.deepEqual(groupPaidPurchasesByEmail('buyer@example.com', [], '99112233'), []);

console.log('buyer-purchase-recovery logic ok');
