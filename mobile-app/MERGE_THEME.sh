#!/bin/bash
# Merge soft-glass theme into main (run on your Mac)
set -e
cd "$(dirname "$0")/.."
git fetch origin
git checkout main
git pull origin main
git merge origin/ui/soft-glass-theme -m "Merge soft glass UI theme" || true

cd mobile-app
# Wire theme into App.js if not already
if ! grep -q "from './theme'" App.js 2>/dev/null; then
  python3 << 'PY'
from pathlib import Path
import re
p = Path('App.js')
c = p.read_text()
if "from './theme'" not in c:
    c = c.replace(
        "import {\n  View, Text,",
        "import { C, s } from './theme';\nimport {\n  View, Text,",
        1,
    )
# Replace color const
c = re.sub(r"const C = \{[^}]+\};\n", "", c, count=1)
# Remove trailing StyleSheet if present (styles come from theme)
# Keep local StyleSheet if still needed for missing keys - theme has full set
if 'const s = StyleSheet.create' in c:
    start = c.find('const s = StyleSheet.create')
    # remove from start to last });
    end = c.rfind('});')
    if start > 0 and end > start:
        c = c[:start] + c[end+3:]
p.write_text(c)
print('App.js wired to theme.js')
PY
fi

cd ..
git add mobile-app/
git status
git commit -m "UI: soft glass theme — circular drawer, pills, frosted cards" || echo "nothing to commit"
git push origin main
echo "Done. cd mobile-app && npx expo start -c"
