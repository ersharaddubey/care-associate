# Apply this fix in mobile-app/App.js (local)

## 1. Text error root cause (Book tab, default hourly)

Search for:
```
{bookingType === 'hourly' && <>        <View
```

Change to (NO spaces after <>):
```
{bookingType === 'hourly' && <><View
```

Those spaces become a text node under View → `Text strings must be rendered within a <Text> component`.

## 2. Empty Pay button when logged in

Search for:
```
(user ? '' : 'Log in & ') + 'Pay & confirm booking'
```

Change to:
```
((user ? '' : 'Log in & ') + 'Pay & confirm booking')
```

## Local commands

```bash
cd ~/Desktop/care-associate
git pull origin main
cd mobile-app
# edit App.js as above, then:
npx expo start -c
```
