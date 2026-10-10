# Patti Veedu — Android (native, no Gradle)

A small Java Activity (`src/com/zrubix/kolusu/MainActivity.java`) hosts the WebGL game from `assets/game/` in a WebView:
fullscreen immersive, landscape lock, back button = pause, vibration bridge (`window.KolusuNative`).
App icon: adaptive icon in `res/mipmap-anydpi-v26` (Paatti's face on #140303), legacy PNGs in `res/mipmap-*`.

Build from the project root: `./build.sh <versionCode> <versionName>` (copies `game/` into `assets/game/` first),
or run `./build.sh` here once `assets/game/` is filled.

**Keep `kolusu.keystore`** (alias `kolusu`, password `kolusu123`). Updates must be signed with the same key to install over the old version.
