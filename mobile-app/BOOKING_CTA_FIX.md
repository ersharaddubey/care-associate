# Booking CTA fix (apply to mobile-app/App.js)

## Root cause
JavaScript operator precedence: `user ? '' : 'Log in & ' + 'Pay & confirm booking'` evaluates as `user ? '' : ('Log in & Pay & confirm booking')`.
When the patient is **logged in**, the Pay button title becomes an **empty string**, so it looks like there is no booking button.

## Required edits in `mobile-app/App.js`

### 1. Pay button title (search for `Pay & confirm booking`)
```js
// BEFORE (broken when logged in)
title={payBusy ? 'Opening secure payment...' : (user ? '' : 'Log in & ') + 'Pay & confirm booking'}

// AFTER (correct parentheses)
title={payBusy ? 'Opening secure payment...' : ((user ? '' : 'Log in & ') + 'Pay & confirm booking')}
```

### 2. Service tile onPress (search for `onOpenService ? onOpenService`)
```js
// BEFORE
onPress={() => onOpenService ? onOpenService(sv.id) : setF({ ...f, service: sv.id })}

// AFTER — select service and open detail
onPress={() => { setF({ ...f, service: sv.id }); if (onOpenService) onOpenService(sv.id); }}
```

### 3. ServiceDetail Book Now label
```js
// BEFORE
<Btn title="Book Now" onPress={() => onContinue(service.id)} />

// AFTER
<Btn title="Select this service & continue booking" onPress={() => onContinue(service.id)} />
```

### 4. Hint under service grid
After the service grid (`</View>` of `s.svcGrid`), add:
```js
<Text style={s.muted}>Tap a service above to review details, or fill the form below to book directly.</Text>
```

Apply these on `main`, commit, and merge.
