#!/bin/bash
# Builds Kolusu.apk with the plain Android SDK tools: aapt -> javac -> dx/d8 -> zipalign -> apksigner (no Gradle)
# The game itself must already be in assets/game/ (the top-level ../build.sh copies it there).
#
# Works with either
#   * Ubuntu/Debian packages:  sudo apt install aapt apksigner zipalign android-sdk-platform-23 dalvik-exchange default-jdk
#   * an Android Studio SDK:    export ANDROID_SDK=$HOME/Android/Sdk   (build-tools 30+ and any platform 23+)
set -e
cd "$(dirname "$0")"
SDK=${ANDROID_SDK:-${ANDROID_HOME:-/usr/lib/android-sdk}}
# platform jar: android-23 if present, else the newest installed platform
JAR=${ANDROID_PLATFORM_JAR:-$SDK/platforms/android-23/android.jar}
[ -f "$JAR" ] || JAR=$(ls -d "$SDK"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1)
[ -f "$JAR" ] || { echo "android.jar not found - set ANDROID_SDK"; exit 1; }
# build tools: Debian's folder, else the newest SDK build-tools, else whatever is on PATH
BT=${ANDROID_BUILD_TOOLS:-$SDK/build-tools/debian}
[ -d "$BT" ] || BT=$(ls -d "$SDK"/build-tools/*/ 2>/dev/null | sort -V | tail -1)
tool () { if [ -n "$BT" ] && [ -x "$BT/$1" ]; then echo "$BT/$1"; else command -v "$1"; fi; }
AAPT=$(tool aapt); ZIPALIGN=$(tool zipalign); APKSIGNER=$(tool apksigner); DX=$(tool dx || true); D8=$(tool d8 || true)
[ -d assets/game ] || { echo "assets/game missing - run ../build.sh"; exit 1; }

rm -rf build && mkdir -p build/gen build/obj build/dex
"$AAPT" package -f -m -J build/gen -M AndroidManifest.xml -S res -I "$JAR" --min-sdk-version 24 --target-sdk-version 34
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR" -classpath "$JAR" -d build/obj $(find src build/gen -name '*.java')
if [ -n "$DX" ]; then "$DX" --dex --output=build/dex/classes.dex build/obj
else "$D8" --lib "$JAR" --min-api 24 --output build/dex $(find build/obj -name '*.class'); fi
"$AAPT" package -f -M AndroidManifest.xml -S res -A assets -I "$JAR" --min-sdk-version 24 --target-sdk-version 34 -0 neu -F build/unsigned.apk
(cd build/dex && zip -q ../unsigned.apk classes.dex)
"$ZIPALIGN" -p -f 4 build/unsigned.apk build/aligned.apk
# KEEP kolusu.keystore: every update must be signed with this same key or phones refuse to install over the old version.
[ -f kolusu.keystore ] || keytool -genkeypair -keystore kolusu.keystore -storepass kolusu123 -keypass kolusu123 -alias kolusu -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Kolusu, O=Zrubix, C=IN" >/dev/null 2>&1
"$APKSIGNER" sign --ks kolusu.keystore --ks-pass pass:kolusu123 --key-pass pass:kolusu123 --ks-key-alias kolusu --min-sdk-version 24 --out Kolusu.apk build/aligned.apk
"$APKSIGNER" verify --print-certs Kolusu.apk | head -2
ls -la Kolusu.apk
