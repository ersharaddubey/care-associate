#!/usr/bin/env python3
"""Run from mobile-app/: python3 apply-soft-theme.py"""
from pathlib import Path
import re

p = Path('App.js')
c = p.read_text()

# Palette
c = re.sub(
    r"const C = \{[^}]+\};",
    "const C = { p: '#3B82B8', pDark: '#1E3A5F', pSoft: '#D6E8F5', bg: '#D8E2EC', card: '#F4F8FC', mute: '#6B7C8F', err: '#C62828', line: '#C5D4E3', text: '#1A2B3C', success: '#2A9D8F', mint: '#7EC8C0', ice: '#E8F4FA', lavender: '#B8C4E8' };",
    c, count=1)

# MenuIcon circular
c = c.replace(
    "const color = active ? '#1769AA' : '#526b68';",
    "const color = active ? C.p : '#7A8B9C';",
)
c = c.replace(
    "borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? '#e4f3ef' : '#f3f7f6'",
    "borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? C.pSoft : 'rgba(255,255,255,0.55)'",
)

# Soften key style values if still old
replacements = [
    ("backgroundColor: '#123F67'", "backgroundColor: C.pDark"),
    ("borderRadius: 20, padding: 16, marginVertical: 8, borderWidth: 1, borderColor: '#D2DEE9'",
     "borderRadius: 24, padding: 16, marginVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)'"),
    ("borderRadius: 14, marginVertical: 5", "borderRadius: 99, marginVertical: 6"),
    ("backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5EDF5'",
     "backgroundColor: 'rgba(255,255,255,0.96)', borderTopWidth: 0"),
]
for a,b in replacements:
    c = c.replace(a, b)

p.write_text(c)
print('Theme palette + partial styles applied. For full drawer redesign, copy App.themed.js over App.js')
print('Then: npx expo start -c')
