#!/bin/bash
set -e
cd "$(dirname "$0")/.."
git checkout main
git pull origin main
cd mobile-app
python3 << 'PY'
from pathlib import Path
import re
p = Path('App.js')
c = p.read_text()
if "from './theme'" not in c:
    c = c.replace("import {\n  View, Text,", "import { C, s } from './theme';\nimport {\n  View, Text,", 1)
c = re.sub(r"const C = \{[^}]+\};\n", "", c, count=1)
if 'const s = StyleSheet.create' in c:
    start = c.find('const s = StyleSheet.create')
    end = c.rfind('});')
    if start > 0 and end > start:
        c = c[:start] + c[end+3:]
p.write_text(c)
print('App.js now uses theme.js')
PY
cd ..
git add mobile-app/theme.js mobile-app/App.js mobile-app/MERGE_THEME.sh 2>/dev/null || git add mobile-app/
git commit -m "UI: wire soft glass theme into App.js" || true
git push origin main
echo "Done. npx expo start -c"
