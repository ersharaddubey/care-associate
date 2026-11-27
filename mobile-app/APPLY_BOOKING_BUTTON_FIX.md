# Booking form: no Pay button after filling form

## Causes
1. Entire step 5 + Pay button was wrapped in `{price && ...}` — if city empty or `/price` API fails, **button never appears**.
2. Logged-in Pay title could become empty string (operator precedence) — looks like no button.
3. Fragment `{bookingType === 'hourly' && <>        <View` whitespace caused Text crash (tree may not finish rendering).

## Local fix (Mac)

```bash
cd ~/Desktop/care-associate
git pull origin main
cd mobile-app

# Quick patch (keeps your other local edits)
python3 << 'PY'
from pathlib import Path
import re
p = Path('App.js')
c = p.read_text()
c = c.replace("{bookingType === 'hourly' && <>        <View", "{bookingType === 'hourly' && <><View")
# Show step 5 whenever date is chosen (not only when price loaded)
c = c.replace('{price && <>', '{!!date && <>', 1)
# Never-empty pay label
c = re.sub(
    r"title=\{payBusy \? 'Opening secure payment\.\.\.' :[^}]+\}",
    "title={payBusy ? 'Opening secure payment...' : (user ? 'Pay & confirm booking' : 'Log in & Pay & confirm booking')}",
    c,
    count=1,
)
# Guard price fields when price still null
c = c.replace(
    "{bookingType === 'token' ? <Text style={s.muted}>Token booking • No duration • ₹250 fixed</Text> : <Text style={s.muted}>{price.totalHours} hours • Day ₹150/hr • Night ₹200/hr</Text>}",
    "{!price ? <Text style={s.muted}>Calculating price… (need city + date + time)</Text> : bookingType === 'token' ? <Text style={s.muted}>Token booking • No duration • ₹250 fixed</Text> : <Text style={s.muted}>{price.totalHours} hours • Day ₹150/hr • Night ₹200/hr</Text>}",
    1,
)
c = c.replace(
    "<Text style={s.price}>Base price (before any valid coupon): ₹{price.baseAmount ?? price.total}</Text>",
    "{!!price && <Text style={s.price}>Base price (before any valid coupon): ₹{price.baseAmount ?? price.total}</Text>}",
    1,
)
p.write_text(c)
print('OK')
PY

npx expo start -c
```

## Must fill for price + button
- Hospital name
- **City** (required for `/price` and availability)
- Date on calendar
- Time (HH:MM)

Then scroll to bottom: **Pay & confirm booking**.
