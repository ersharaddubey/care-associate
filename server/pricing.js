// pricing.js - Hospital Helper hourly pricing
// Rule:
//  - Day rate: Rs 150/hr, Night rate: Rs 200/hr
//  - 24 hr ke baad har agle hr par rate Rs 10 kam hota jayega
//  - Rate kabhi Rs 120/hr se neeche nahi jayega (floor)
//  - Partial hour full hour maana jayega (round up)

const CONFIG = {
  dayRate: 150,
  nightRate: 200,
  floorRate: 120,
  stepDrop: 10,
  discountAfterHours: 24, // is hr count ke baad discount shuru
  dayStartHour: 6,        // 6:00 AM se day
  nightStartHour: 20,     // 8:00 PM se night
};

const HOUR_MS = 60 * 60 * 1000;

function isNight(date, cfg = CONFIG) {
  const h = date.getHours();
  return h >= cfg.nightStartHour || h < cfg.dayStartHour;
}

function calculatePrice(startTime, endTime, cfg = CONFIG) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start) || isNaN(end)) throw new Error('Invalid start or end time');
  if (end <= start) throw new Error('End time must be after start time');

  const totalHours = Math.ceil((end - start) / HOUR_MS);

  let total = 0;
  let dayHours = 0;
  let nightHours = 0;
  let discountedHours = 0;

  for (let i = 0; i < totalHours; i++) {
    const slot = new Date(start.getTime() + i * HOUR_MS);
    const night = isNight(slot, cfg);
    const base = night ? cfg.nightRate : cfg.dayRate;

    // 24 hr ke baad har hr par 10 Rs ghatao, floor tak
    const extraHours = Math.max(0, i - cfg.discountAfterHours + 1);
    const rate = Math.max(cfg.floorRate, base - cfg.stepDrop * extraHours);

    if (rate < base) discountedHours++;
    if (night) nightHours++; else dayHours++;
    total += rate;
  }

  return {
    totalHours,
    dayHours,
    nightHours,
    discountedHours,
    total,
    avgPerHour: Math.round((total / totalHours) * 100) / 100,
  };
}

module.exports = { calculatePrice, CONFIG };

// ---- Quick test: node pricing.js ----
if (require.main === module) {
  const t = (s, e) => console.log(s, '->', e, calculatePrice(s, e));
  t('2026-11-23T10:00:00', '2026-11-23T18:00:00'); // 8 hr day = 1200
  t('2026-11-23T08:00:00', '2026-11-24T08:00:00'); // 24 hr = 4100
  t('2026-11-23T08:00:00', '2026-11-26T08:00:00'); // 72 hr
}
