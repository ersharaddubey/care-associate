const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRange } = require('../index');
const { calculatePrice, calculateTokenPrice } = require('../pricing');

test('accepts a valid future booking range', () => {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  const [parsedStart, parsedEnd] = parseRange(start.toISOString(), end.toISOString());
  assert.equal(parsedStart.getTime(), start.getTime());
  assert.equal(parsedEnd.getTime(), end.getTime());
});

test('rejects invalid dates and non-positive ranges', () => {
  assert.throws(() => parseRange('not-a-date', new Date().toISOString()), /Invalid date or time/);
  const start = new Date(Date.now() + 60 * 60 * 1000);
  assert.throws(() => parseRange(start.toISOString(), start.toISOString()), /End time must be after start time/);
});

test('rejects bookings in the past and too far in advance', () => {
  const past = new Date(Date.now() - 60 * 60 * 1000);
  assert.throws(() => parseRange(past.toISOString(), new Date(past.getTime() + 60 * 60 * 1000).toISOString()), /past/);
  const future = new Date(Date.now() + 101 * 24 * 60 * 60 * 1000);
  assert.throws(() => parseRange(future.toISOString(), new Date(future.getTime() + 60 * 60 * 1000).toISOString()), /3 months/);
});

test('allows bookings up to 240 hours and rejects longer bookings', () => {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  assert.doesNotThrow(() => parseRange(start.toISOString(), new Date(start.getTime() + 240 * 60 * 60 * 1000).toISOString()));
  assert.throws(() => parseRange(start.toISOString(), new Date(start.getTime() + 241 * 60 * 60 * 1000).toISOString()), /240 hours/);
});

test('calculates approved day and night hourly payable prices', () => {
  assert.equal(calculatePrice('2026-11-23T10:00:00', '2026-11-23T18:00:00').baseAmount, 1200);
  assert.equal(calculatePrice('2026-11-23T10:00:00', '2026-11-23T18:00:00').discountAmount, 400);
  assert.equal(calculatePrice('2026-11-23T10:00:00', '2026-11-23T18:00:00').total, 800);
  assert.equal(calculatePrice('2026-11-23T20:00:00', '2026-11-24T06:00:00').total, 1250);
  assert.equal(calculatePrice('2026-11-23T08:00:00', '2026-11-24T08:00:00').total, 2650);
});

test('calculates the fixed token booking amount without duration', () => {
  assert.deepEqual(calculateTokenPrice(), {
    bookingType: 'token', totalHours: 0, dayHours: 0, nightHours: 0,
    baseAmount: 250, discountAmount: 100, total: 150, payable: 150,
  });
});
