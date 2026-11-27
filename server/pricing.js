// Base pricing: discounts are applied only after a valid coupon is submitted.
const CONFIG = {
  dayRate: 150,
  nightRate: 200,
  tokenBase: 250,
  dayStartHour: 6,
  nightStartHour: 20,
};

const HOUR_MS = 60 * 60 * 1000;

function isNight(date, cfg = CONFIG) {
  const hour = date.getHours();
  return hour >= cfg.nightStartHour || hour < cfg.dayStartHour;
}

function calculateTokenPrice() {
  return {
    bookingType: 'token',
    totalHours: 0,
    dayHours: 0,
    nightHours: 0,
    baseAmount: CONFIG.tokenBase,
    discountAmount: 0,
    total: CONFIG.tokenBase,
    payable: CONFIG.tokenBase,
  };
}

function calculatePrice(startTime, endTime, cfg = CONFIG) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid start or end time');
  }
  if (end <= start) throw new Error('End time must be after start time');

  const totalHours = Math.ceil((end - start) / HOUR_MS);
  let baseAmount = 0;
  let dayHours = 0;
  let nightHours = 0;

  for (let i = 0; i < totalHours; i += 1) {
    const slot = new Date(start.getTime() + i * HOUR_MS);
    if (isNight(slot, cfg)) {
      nightHours += 1;
      baseAmount += cfg.nightRate;
    } else {
      dayHours += 1;
      baseAmount += cfg.dayRate;
    }
  }

  const total = baseAmount;
  const discountAmount = 0;
  return {
    bookingType: 'hourly',
    totalHours,
    dayHours,
    nightHours,
    baseAmount,
    discountAmount,
    total,
    payable: total,
    dayRate: cfg.dayRate,
    nightRate: cfg.nightRate,
    avgPerHour: Math.round((total / totalHours) * 100) / 100,
  };
}

module.exports = { calculatePrice, calculateTokenPrice, isNight, CONFIG };
