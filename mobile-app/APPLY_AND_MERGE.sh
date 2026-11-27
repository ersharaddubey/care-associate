#!/bin/bash
set -e
cd "$(dirname "$0")/.."
echo "==> Pull main"
git checkout main
git pull origin main

echo "==> Apply booking Pay button fixes in mobile-app/App.js"
cd mobile-app
python3 << 'PY'
from pathlib import Path
import re
p = Path('App.js')
c = p.read_text()
c = c.replace("{bookingType === 'hourly' && <>        <View", "{bookingType === 'hourly' && <><View")
c = c.replace('{price && <>', '{!!date && <>', 1)
c = re.sub(
    r"title=\{payBusy \? 'Opening secure payment\.\.\.' :[^}]+\}",
    "title={payBusy ? 'Opening secure payment...' : (user ? 'Pay & confirm booking' : 'Log in & Pay & confirm booking')}",
    c, count=1)
c = c.replace(
    "{bookingType === 'token' ? <Text style={s.muted}>Token booking • No duration • ₹250 fixed</Text> : <Text style={s.muted}>{price.totalHours} hours • Day ₹150/hr • Night ₹200/hr</Text>}",
    "{!price ? <Text style={s.muted}>Calculating price… (need city + date + time)</Text> : bookingType === 'token' ? <Text style={s.muted}>Token booking • No duration • ₹250 fixed</Text> : <Text style={s.muted}>{price.totalHours} hours • Day ₹150/hr • Night ₹200/hr</Text>}",
    1)
c = c.replace(
    "<Text style={s.price}>Base price (before any valid coupon): ₹{price.baseAmount ?? price.total}</Text>",
    "{!!price && <Text style={s.price}>Base price (before any valid coupon): ₹{price.baseAmount ?? price.total}</Text>}",
    1)
p.write_text(c)
print('App.js updated')
PY

cd ..
git add mobile-app/App.js
git commit -m "Fix: always show Pay button after date; clear CTA label; Text fragment" || echo "(nothing new to commit)"
git push origin main
echo "==> Done. Merged to main."
echo "Then: cd mobile-app && npx expo start -c"
