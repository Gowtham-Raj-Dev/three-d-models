#!/bin/bash
# Builds both releases from game/:
#   out/PattiVeedu.apk           Android (signed with android/kolusu.keystore)
#   out/PattiVeedu-Windows.zip   Windows (Neutralino exe + resources.neu)
# usage: ./build.sh <versionCode> <versionName>     e.g.  ./build.sh 15 10.5
# Each new Android release needs a HIGHER versionCode than the last one (10.4 used 14).
# Skip one side with ONLY=android or ONLY=windows.
set -e
cd "$(dirname "$0")"; ROOT=$PWD
VC=${1:?versionCode, e.g. 15}; VN=${2:?versionName, e.g. 10.5}
mkdir -p out

copy_game () { # $1 = destination folder
  rm -rf "$1/js" "$1/fonts" "$1/index.html" "$1/three.min.js" "$1/THIRD_PARTY.txt"; mkdir -p "$1/js" "$1/fonts"
  cp game/index.html game/three.min.js game/THIRD_PARTY.txt "$1/"; cp game/fonts/* "$1/fonts/"; cp game/js/*.js "$1/js/"
}

if [ "$ONLY" != "windows" ]; then
  echo "== Android $VN ($VC)"
  rm -rf android/assets/game; mkdir -p android/assets/game; copy_game android/assets/game
  sed -i -E "s/android:versionCode=\"[0-9]+\"/android:versionCode=\"$VC\"/; s/android:versionName=\"[0-9.]+\"/android:versionName=\"$VN\"/" android/AndroidManifest.xml
  bash android/build.sh | tail -1
  cp android/Kolusu.apk out/PattiVeedu.apk
fi

if [ "$ONLY" != "android" ]; then
  echo "== Windows $VN"
  R=desktop/resources; mkdir -p $R; copy_game $R; cp desktop/icon.png $R/icon.png
  python3 - "$ROOT/game/index.html" "$ROOT/$R/index.html" <<'PY'
import sys
s = open(sys.argv[1], encoding='utf-8').read(); a = '<script>window.KOLUSU_MOBILE = !(window.KOLUSU_DESKTOP'
assert s.count(a) == 1, 'desktop flag anchor not found in index.html'
open(sys.argv[2], 'w', encoding='utf-8').write(s.replace(a, '<script>window.KOLUSU_DESKTOP = true;</script>\n' + a))
PY
  sed -i -E "s/\"version\": \"[0-9.]+\"/\"version\": \"$VN.0\"/" desktop/neutralino.config.json
  (cd desktop && [ -d node_modules ] || npm install --silent)
  (cd desktop && { [ -f bin/neutralino-win_x64.exe ] || npx neu update; } && npx neu build >/dev/null && echo "neu build ok")
  (cd desktop/seticon && { [ -d node_modules ] || npm install --silent; })
  W=out/win/PattiVeedu; rm -rf out/win; mkdir -p $W
  node desktop/seticon/seticon.js desktop/dist/PattiVeedu/PattiVeedu-win_x64.exe $W/PattiVeedu.exe "$VN"
  cp desktop/dist/PattiVeedu/resources.neu $W/resources.neu
  cp game/THIRD_PARTY.txt $W/THIRD_PARTY.txt
  python3 - "$ROOT/desktop/windows-README.txt" "$ROOT/$W/README.txt" "$VN" <<'PY'
import re, sys
s = open(sys.argv[1], encoding='utf-8-sig').read()
s = re.sub(r"Grandma's House\) [0-9.]+ — Windows", "Grandma's House) " + sys.argv[3] + " — Windows", s)
open(sys.argv[2], 'w', encoding='utf-8-sig').write(s)
PY
  (cd out/win && rm -f ../PattiVeedu-Windows.zip && zip -qr ../PattiVeedu-Windows.zip PattiVeedu)
fi
ls -la out/
