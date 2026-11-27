# Booking CTA fix applied guidance

## Critical one-liner in App.js (Pay button)

Replace:
```
title={payBusy ? 'Opening secure payment...' : (user ? '' : 'Log in & ') + 'Pay & confirm booking'}
```

With:
```
title={payBusy ? 'Opening secure payment...' : ((user ? '' : 'Log in & ') + 'Pay & confirm booking')}
```

Or import helper:
```
import { payConfirmTitle } from './bookingCta';
// ...
title={payConfirmTitle(payBusy, user)}
```

Without the extra parentheses, logged-in patients see a blank Pay button.
