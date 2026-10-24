#!/usr/bin/env bash
# Generates the Android project from dist/ (run after npm run build). Used by .github/workflows/apk.yml;
# android/ is never committed, so every build starts from Capacitor's template plus native/res.
set -euo pipefail

test -f dist/index.html || { echo '::error::dist/index.html missing: run npm run build first'; exit 1; }
rm -rf android
npx cap add android
npx cap sync android

# Version: name from package.json, code from the CI run number (always increasing, so updates install).
VERSION_NAME="$(node -p "require('./package.json').version")"
VERSION_CODE="${GITHUB_RUN_NUMBER:-1}"
python3 - "$VERSION_NAME" "$VERSION_CODE" <<'PY'
import re, sys
from pathlib import Path
name, code = sys.argv[1], sys.argv[2]
p = Path('android/app/build.gradle')
s = p.read_text(encoding='utf-8')
s, a = re.subn(r'versionCode\s+\d+', f'versionCode {code}', s)
s, b = re.subn(r'versionName\s+"[^"]*"', f'versionName "{name}"', s)
if not (a and b): raise SystemExit('versionCode/versionName not found in android/app/build.gradle')
p.write_text(s, encoding='utf-8')
PY

# Launcher icons: replace Capacitor's with Nuance's (scripts/icons.mjs renders native/res).
cp -R native/res/. android/app/src/main/res/
mkdir -p android/app/src/main/res/values
cat > android/app/src/main/res/values/ic_launcher_background.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">#08090A</color></resources>
XML
test -f android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png
grep -q ic_launcher_foreground android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
test -f android/app/src/main/assets/public/index.html
echo "Android project ready: Nuance $VERSION_NAME ($VERSION_CODE)"
