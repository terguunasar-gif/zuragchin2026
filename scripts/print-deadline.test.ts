import assert from 'node:assert/strict';
import {
  dateInputToDeadlineIso, deadlineDateInput, defaultPrintDeadlineIso, endOfDay, printOrdersOpen,
} from '../src/lib/printDeadline.ts';

assert.equal(printOrdersOpen(null), true);
assert.equal(printOrdersOpen(undefined), true);
assert.equal(printOrdersOpen(''), true);
assert.equal(printOrdersOpen('not-a-date'), true);
assert.equal(printOrdersOpen('2000-01-01T00:00:00.000Z', Date.parse('2026-01-01')), false);
assert.equal(printOrdersOpen('2999-01-01T00:00:00.000Z', Date.parse('2026-01-01')), true);
assert.equal(printOrdersOpen('2026-06-01T23:59:59.000Z', Date.parse('2026-06-01T23:59:59.000Z')), true);

const day = endOfDay(new Date('2026-06-01T08:00:00'), 3);
assert.equal(day.getDate(), 4);
assert.equal(day.getHours(), 23);

const iso = defaultPrintDeadlineIso('2026-06-01');
const back = deadlineDateInput(iso);
assert.equal(back, deadlineDateInput(endOfDay(new Date('2026-06-01T12:00:00'), 7).toISOString()));
assert.equal(dateInputToDeadlineIso(''), null);
assert.ok(dateInputToDeadlineIso('2026-06-08')?.includes('T'));
assert.equal(printOrdersOpen(dateInputToDeadlineIso('2026-06-08'), Date.parse('2026-06-08T12:00:00')), true);

console.log('print deadline ok');
