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
# Medical blue theme

Palette (see `theme.js`):
- primary `#1A66B8`, deep `#0F4C8A`, pale tint `#E6F0FB`
- canvas `#EEF3F9`, cards white (radius 20), inputs `#F3F7FC`
- text `#14233A`, muted `#5B6B80`, lines `#DCE5F0`
- accents: amber `#E8A70F` / cream `#FDF1D6`, blush `#F7E3E8`
- drawer step colours: `#2F7FC1 #1F64A8 #12808C #2A6A9E #3580B5` (all readable with white numbers)

Run: `npx expo start -c`
