# Soft glass UI theme (music-dashboard style)

Matches soft blue-gray glass cards, circular drawer avatar, pill buttons, rounded bottom nav.

## Apply on Mac

```bash
cd ~/Desktop/care-associate
git pull origin main
cd mobile-app

# Download themed App.js from artifacts OR run the python theme patch below after copying styles from this branch's companion files.
```

Palette:
- bg `#D8E2EC` soft blue-gray
- primary `#3B82B8`
- dark sidebar `#1E3A5F`
- cards frosted white, radius 24
- buttons/chips/nav items radius 99 (pills)
- drawer dark, circular logo avatar, pill menu items

After applying themed `App.js`:
```bash
npx expo start -c
```
