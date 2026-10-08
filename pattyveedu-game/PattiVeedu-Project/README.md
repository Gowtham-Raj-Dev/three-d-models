# பாட்டி வீடு · Patti Veedu · Grandma's House — full project (v10.4)

A first-person Tamil horror puzzle game set in a Chettinad mansion over five nights. It is built with
three.js (r128) in plain JavaScript, with no bundler and no framework. One `index.html` runs everywhere:
in a browser, inside the Android app, and inside the Windows app.

Developed by Gowtham · Zrubix

---

## தமிழில் சுருக்கமாக

| Folder | என்ன இருக்கு |
|---|---|
| `game/` | முழு game. `index.html`-ஐ Chrome-இல் திறந்தாலே விளையாடலாம். |
| `game/js/` | எல்லா code-உம் (கீழே பட்டியல்). |
| `game/assets-src/` | பாட்டி, வள்ளி model, texture, முடி, குரல், app logo இவற்றின் மூல files மற்றும் அவற்றை உருவாக்கும் Python scripts. |
| `game/tests/` | Headless browser test-கள்: முழு விளையாட்டு, AI வேகம், lag, scroll இல்லாத UI, screenshots. |
| `android/` | Android app (Java, Gradle இல்லை). **`kolusu.keystore`-ஐ பத்திரமாக வையுங்கள்.** இது இல்லாமல் போனில் update ஆகாது. |
| `desktop/` | Windows app (Neutralino). |
| `build.sh` | ஒரே command-இல் APK மற்றும் Windows zip இரண்டையும் உருவாக்கும். |

புதிய பதிப்பு உருவாக்க (Linux / WSL):

```bash
./build.sh 15 10.5      # versionCode 15, version 10.5  ->  out/PattiVeedu.apk, out/PattiVeedu-Windows.zip
```

ஒவ்வொரு புதிய Android பதிப்புக்கும் versionCode முந்தையதை விட **பெரிய எண்ணாக** இருக்க வேண்டும். 10.4-இன் versionCode 14.

---

## Run it

Open `game/index.html` in Chrome or Edge. It works straight from the disk because every model, texture
and sound is embedded in the `js/` files. You can force a layout with URL flags:

| URL | Layout |
|---|---|
| `index.html` | Picks phone or desktop layout from the device. |
| `index.html?desk` | Desktop layout with mouse and keyboard. |

To serve it over the network instead: `cd game && python3 -m http.server 8080`.

## Build the releases

You need Linux or WSL with:

- **Android:**
  - JDK and the Android build tools (`aapt`, `zipalign`, `apksigner`, plus `dx` or `d8`);
  - any `android.jar` from platform 23 or newer;
  - on Ubuntu: `sudo apt install default-jdk aapt apksigner zipalign android-sdk-platform-23 dalvik-exchange`;
  - or point `ANDROID_SDK` at an Android Studio SDK.
- **Windows build:** Node.js 18+ and `zip`. The Neutralino binaries are already in `desktop/bin/`.

```bash
./build.sh <versionCode> <versionName>     # both
ONLY=android ./build.sh 15 10.5            # just the APK
ONLY=windows ./build.sh 15 10.5            # just the Windows zip
```

What `build.sh` does:

1. **Copies the game.** `game/` goes into `android/assets/game/` and into `desktop/resources/`. For the Windows copy it also adds the `KOLUSU_DESKTOP` flag.
2. **Builds the APK.** It bumps the version in `android/AndroidManifest.xml`, then runs `android/build.sh`: aapt → javac → dx/d8 → zipalign → apksigner. Output: `out/PattiVeedu.apk`.
3. **Builds the Windows zip.**
   - Runs `npx neu build`.
   - Runs `desktop/seticon/seticon.js` to put Paatti's face icon and the version number into the `.exe`.
   - Zips `PattiVeedu.exe`, `resources.neu`, the README and the licences into `out/PattiVeedu-Windows.zip`.

**Signing:** the APK is signed with `android/kolusu.keystore` (alias `kolusu`, password `kolusu123`).
- Keep a backup of this file.
- Android installs an update over the old app only if it is signed with the same key.
- If the key is lost, players must uninstall the old version first.
- If you ever publish publicly, change the password and keep the keystore private.

## Code map (`game/js/`)

| File | What it does |
|---|---|
| `game.js` | Game loop and states. Lobby (the lantern approach, face scare and Valli). Player movement, interaction, puzzles, diary tabs, pager (no scrolling anywhere), save/continue, auto camera, settings, global button click sounds. |
| `world.js` | Builds the house: rooms, two-storey wing, basement, terrace, yards, doors, hiding spots, items, the clock, pallanguzhi and portrait puzzles. |
| `render.js` | Custom render engine: baked lighting, texture arrays, per-room culling. All shaders are compiled at boot, so there are no hitches in play. |
| `enemy.js` | Paatti. Real-human Rocketbox avatar, patrol, search and chase AI, hearing, knockout and get-up, arm poses, lantern grip, red eyes, voice lines, jumpscare. |
| `valli.js` | Valli, the little ghost girl (Rocketbox child avatar). |
| `hair.js` | Fits the real hair model onto Paatti and Valli: hides the bun or ponytail under it and scales it to the skull. |
| `items3d.js` | Detailed 3D items: keys, matchbox, bucket, bolt cutter, sickle, syringe, fuse, safe dial, kolusu. |
| `props.js`, `lamps3d.js` | Furniture and the 3D clay lamps used to count nights. |
| `yard.js` | Real 3D models in the yards (trees, coconut palms, banana plants, tulasi, rocks, ferns, dead trees, iron lanterns): parses `yard-models.js` at boot, darkens them for night and places them; the world merges them like any prop. `index.html?noyard` shows the old shapes, to compare. |
| `textures.js` | Procedural textures (floors, walls, kolam, paper and so on). |
| `audio.js` | All sound is synthesised with WebAudio: theme, footsteps, kolusu bells, stings, heartbeat, UI clicks, plus positional voice clips. |
| `i18n.js` | Tamil and English text, including credits. |
| `icons.js`, `touch.js` | UI icons and the phone touch controls. |
| `screen.js` | Full screen and rotate for mobile browsers: a full-screen button on the title screen and in the top bar, a "Turn the screen" button on the portrait prompt (full screen + landscape lock), and tips where the browser can't (iPhone Safari). Inside the website's play page it acts on the page around the game. Hidden in the Android and Windows apps. |

Embedded data files (generated; do not edit by hand):

| File | Contents |
|---|---|
| `paatti-rb.js` | Paatti's GLB. |
| `valli-rb.js` | Valli's GLB. |
| `hair-alyson.js` | The hair GLB, unmodified. |
| `yard-models.js` | The yard models from the Models.codelove.in library (CC0). |
| `voice-data.js` | Paatti's voice lines. |
| `meshopt_decoder.js` | MIT library used to decode the compressed hair mesh. |
| `GLTFLoader.js` | three.js glTF loader (MIT). |

## Asset sources (`game/assets-src/`)

Each script works from its own folder and writes the matching `game/js/*.js` file.

| Script | What it makes |
|---|---|
| `paint.py` then `build_glb.py` | Paatti. Repaints the Rocketbox `visitorF1.glb` (corpse skin, black hair, blood tears, dirty white dress), then packs `paatti-rb.glb` and `js/paatti-rb.js`. |
| `valli/paint_valli.py` then `valli/build_valli.py` | Valli. Built from the Rocketbox child `child_src.glb` and its `cf001_*` textures. |
| `yard/build_yard.mjs` | Yard models. Packs the picked library GLBs (Avatar Garden, Avatar Show, Halloween Bits) into `js/yard-models.js`, without the unused normal/roughness maps. Run with Node from inside the `3d-models` repo (it uses its `node_modules`). |
| `voice/proc.py` | Paatti's voice. Turns the eSpeak NG Tamil takes (`*_v.wav` voice and `*_w.wav` whisper) into the aged, echoing lines in `js/voice-data.js`. The line texts are in `voice/lines.json`. Needs `ffmpeg`. |
| `icon/make_icon.py` | App logo. Takes the render `icon/icon-src.png` and writes every icon size: Android, Windows `.ico`, desktop, favicon and splash. Re-render the face with `node game/tests/iconshot.js`. |

Python needs `numpy`, `scipy` and `Pillow`.

## Tests (`game/tests/`)

```bash
cd game/tests && npm install            # installs Playwright (uses its Chromium)
node play10.js      # full playthrough to the true ending
node ai10.js        # Paatti's AI cost per frame
node perf10.js      # draw calls, shader compiles (must stay equal), hitch test
node mob.js 727 319 m ta     # every screen at phone size, checks nothing scrolls or overflows (ta / en)
node scare.js | ko2.js | chase2.js | valli-test.js | jtest.js | lobby3.js | clicktest.js
```

Screenshots go to `game/tests/shots/`.

## Licences

Everything is listed in `game/THIRD_PARTY.txt` and on the in-game Credits screen. In short:

- **Characters:**
  - Paatti and Valli bodies: Microsoft Rocketbox avatars (MIT, © Microsoft Corporation).
  - Animation clips: Mesh2Motion (CC0).
  - Hair: "P8 Alyson- Hair Black reduced polys" by backdoor3d (**CC BY-ND 4.0**). It must stay credited and **unmodified**: the model may be placed and scaled, but not recoloured or reshaped.
- **Yard models:** trees, palms, plants, rocks, dead trees and lanterns from the Models.codelove.in library, all CC0.
- **Engine and code libraries:** three.js (MIT); meshoptimizer decoder (MIT).
- **Voice:** eSpeak NG.
- **Fonts and icons:** OFL and Apache fonts; game-icons.net (CC BY 3.0).
