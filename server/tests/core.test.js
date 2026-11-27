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

test('calculates full day and night base prices without an automatic discount', () => {
  const day = calculatePrice('2026-11-23T10:00:00', '2026-11-23T18:00:00');
  assert.equal(day.baseAmount, 1200);
  assert.equal(day.discountAmount, 0);
  assert.equal(day.total, 1200);
  assert.equal(day.payable, 1200);

  const night = calculatePrice('2026-11-23T20:00:00', '2026-11-24T06:00:00');
  assert.equal(night.baseAmount, 2000);
  assert.equal(night.discountAmount, 0);
  assert.equal(night.total, 2000);

  const mixed = calculatePrice('2026-11-23T08:00:00', '2026-11-24T08:00:00');
  assert.equal(mixed.dayHours, 14);
  assert.equal(mixed.nightHours, 10);
  assert.equal(mixed.total, 4100);
});

test('calculates token booking at the full fixed base amount without a coupon', () => {
  assert.deepEqual(calculateTokenPrice(), {
    bookingType: 'token', totalHours: 0, dayHours: 0, nightHours: 0,
    baseAmount: 250, discountAmount: 0, total: 250, payable: 250,
  });
});
