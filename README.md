# 3D Models — models.codelove.in

A free 3D model library: thousands of models — rigged characters (with 20 animation clips), animals, vehicles,
buildings, furniture, food, nature, trees and space — from five permissively licensed sources. Browse, preview in real-time
3D and download — free for personal and commercial use.

Built with Next.js 16 (App Router, TypeScript, static export), Tailwind CSS v4, three.js and React Three Fiber.

## Sources

| Source | License | Content | Data |
| --- | --- | --- | --- |
| Microsoft Rocketbox | MIT (© 2020 Microsoft) | 115 rigged humans, 25 animals, 20 animation clips | `src/data/catalog.json` (`npm run models:build`) |
| Kenney | CC0 | 50 low-poly kits: cars, city, furniture, food, nature, space, game kits | `src/data/library.json` (`npm run library:build`) |
| KayKit | CC0 | City builder, furniture, restaurant, dungeon, space, characters | same |
| Polygonal Mind | CC0 | Stylized environments, architecture, props | same |
| NASA 3D Resources | Public domain | Spacecraft, rovers, satellites, planets | same |

## Pages

| Route | What it shows |
| --- | --- |
| `/` | Hero with a live model picker, categories, popular picks, featured packs, animations teaser, FAQ |
| `/models/` | Full catalog: category / collection / gender / role filters, search, sorting, "Load more" (`?category=…&collection=…&q=…`) |
| `/models/[slug]/` | Model page: 3D viewer (+ animations for rigged characters), downloads, specs, per-source license. `#customize` opens the color editor |
| `/packs/` | Every collection as a downloadable .zip, grouped by category |
| `/animations/` | Animation library: live preview on a female/male character, female + male downloads |
| `/builder/` | Full-screen scene builder (no site header/footer): compose scenes from any library part — templates, multi-select, copy/paste, array + scatter, animations, lights, projects saved in the browser, keyboard shortcuts (`?`), side panels that hide (Alt+[ / Alt+]) and resize (drag their inner edge), and **AI scene** (Gemini builds or edits a whole scene from a prompt). Exports one `.glb` (all animations combined into one looping clip), a zip pack or a PNG |
| `/viewer/` | GLB viewer: open a local `.glb` (or a sample) — preview, embedded animations, stats, recolor, download. Files never leave the browser |
| `/games/` | Games grid (3 per row) — every game is built only from library models. Registry: `src/lib/games.ts`, each game describes itself in `src/components/games/<slug>/manifest.ts` |
| `/games/[slug]/` | Game details: cover, description, how to play, controls, shortcuts and every library model the game uses |
| `/games/<slug>/play/` | The full-screen game (no site header/footer): Skate Rush (endless runner), Saucer Siege (tower defense), Cannon Cove (naval action), Crypt Knight (action roguelite), Order Up! (cooking), Hex Haven (puzzle), Sky Hop (3D platformer), Turbo Karts (kart racing), Siege Smash (physics puzzle, cannon-es), Beat Street (rhythm), Putt Paradise (mini golf), Kingdom Clash (base-building strategy: Town Hall 1–5, heroes, 100-stage campaign). One route file per game so each page bundles only its own game |
| `/license/` | Licensing per source (MIT / CC0 / NASA), how to credit, license by collection |

The gallery renders its first page (30 cards) on the server and never downloads the whole catalog just to browse:
each "Load more" fetches the next page, `/data/cards/<all|category>/<n>.json`. Only a search, a non-featured sort or
the Characters gender/role filters fetch the whole category (`/data/cards/<all|category>/full.json`), and picking a
collection fetches just that collection (`/data/collections/<key>.json`). Page size: `CARD_PAGE` in
`src/lib/card-pages.ts`. Pack file lists are served as `/data/packs/<collection>.json` and fetched only when a pack is
downloaded.

### Downloads

- **Model only** — the single `.glb`. The license and credit are embedded in the file's glTF `asset` block
  (`asset.copyright` + `asset.extras.licenseText`), so even a bare file carries the notice.
- **Complete pack** — `.zip` with the model (plus every animation clip for Rocketbox characters), the license file,
  `ATTRIBUTION.txt` and a `README.txt`.
- **Collection packs** (`/packs/`) — one `.zip` per collection, plus all animation clips.

Zips are built in the browser (`src/lib/zip.ts`, streamed with fflate), so the repo stores each model only once.

### Games

Shared building blocks live in `src/components/games/shared/`:

- `assets.ts` — model loading with byte-accurate streaming progress (sizes come from the catalog), a few downloads at a time, cached for the session; `makeProto` / `Pool` for placing and recycling models.
- `audio.ts` — one WebAudio graph: music and sound-effect buses (toggled with M / N, remembered), reverb, echo, limiter, synth helpers for effects.
- `music.ts` + `songs.ts` — a step sequencer with synthesized instruments; each game has its own song with intensity layers (menu → play → intense).
- Kingdom Clash instead plays recorded music (`kingdom-clash/soundtrack.ts`, MP3s in `public/games/kingdom-clash/music/`): "Thatched Villagers", "Master of the Feast", "Clash Defiant" and "Five Armies" by Kevin MacLeod (incompetech.com), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — credited in the game's Settings.
- `ui.tsx` — loading screen, how-to-play sheet, shortcuts (Esc/P pause, M music, N sound, H help, F fullscreen), buttons, modals, stores.
- `loaders.tsx` — each game's own loading screen look, drawn over its cover art: a progress bar from the game's world (Kingdom Clash's crown bar, Turbo Karts' start lights, Cannon Cove's map route…), status lines in its voice and an optional ambient effect.
- Each game has its own look: a theme in `src/components/games/themes.ts` (panel material, buttons, HUD chips, titles — used through the `g-*` classes in `globals.css`) and its own font pair in `src/lib/game-fonts.ts`.

No audio or image files are used by the games apart from the library models and each game's cover (`public/games/<slug>/cover.webp`).

**Coming soon:** Castaway (survival crafting), Nova Strike (rail shooter), Night Heist (stealth) and Sky Courier (flight) are unfinished. Their manifests set `comingSoon: true`, so they appear under "Coming soon" on `/games/`, have a teaser details page (noindex, not in the sitemap) and their `/play/` route shows a placeholder without importing the game's code. To release one, finish its code, add its cover, drop `comingSoon` and switch its route back to `<PlayPage game={GAME} Player={...} />`.

**Landscape phones:** games can use the `land:` Tailwind variant (`(orientation: landscape) and (max-height: 540px)`,
defined in `globals.css`) or `usePhoneLandscape()` from `shared/ui.tsx`. Kingdom Clash has its own landscape HUD: one
slim top band (village + settings left, builders centre, resources right), the building panel between Raid and
Army/Shop, two-column army, campaign and result screens.

### Kingdom Clash for Android

`android/kingdom-clash/` is a small native app (plain Java, no Capacitor, no AndroidX): one full-screen WebView locked to
landscape (immersive, screen kept on, notch padded) that plays the game from files packed inside the APK, so it works
offline. The page is served from `https://appassets.androidplatform.net/` (`AssetServer.java`), so localStorage keeps the
village between launches. The page knows it runs in the app from `KingdomClashApp/<version>` in the user agent
(`src/components/games/shared/native-app.ts`): the fullscreen and Back buttons are hidden, the Android back button closes
panels / pauses battles (`window.__nativeBack`), and the app going to the background mutes it and pauses a battle.

```bash
npm run build            # the static site → out/
npm run android:build    # packs the game from out/, renders icons (android/kingdom-clash/art/*.svg), runs Gradle
```

`android:build` writes `public/downloads/kingdom-clash.apk` + `kingdom-clash.json` (version, size, SHA-256); the game's
page shows **Download for Android** when they exist, so commit both and run `npm run build` again (or let Vercel build).
Needs JDK 17 and the Android SDK (`ANDROID_HOME`). For a new release bump `versionCode` and `versionName` in
`android/kingdom-clash/app/build.gradle`.

Signing: `android/kingdom-clash/release.jks` + `keystore.properties` (git-ignored). **Back them up privately** — every
update must be signed with the same key, or phones refuse to install it over the old version.

### Skate Rush on YouTube Playables

`npm run playables:build` builds Skate Rush as a stand-alone page for [YouTube Playables](https://developers.google.com/youtube/gaming/playables)
(no Next.js, every path relative, ~7.7 MB): `dist-playables/skate-rush/` and `dist-playables/skate-rush-playables.zip`
for upload. Its `index.html` loads YouTube's SDK before the game, and the game follows the SDK's rules
(`src/components/games/shared/playables.ts`): firstFrameReady / gameReady, pause, resume and mute only from YouTube,
progress in YouTube's cloud save (never localStorage), best score with sendScore, no full-screen or rotate buttons.
Test it with `npx serve dist-playables/skate-rush` (the SDK does nothing outside YouTube) and YouTube's Playables test suite.

The trailer on its page (`public/games/skate-rush/trailer-1080.mp4` 1080p 60 fps for desktops and full screen,
`trailer.mp4` 720p for phones, `trailer-poster.webp`) is recorded from the game: `node scripts/record-skate-trailer.mjs`
with `npm run dev` running, ffmpeg (`FFMPEG=path/to/ffmpeg`) and [kokoro-js](https://www.npmjs.com/package/kokoro-js)
for the announcer (`npm i kokoro-js` in any folder, `KOKORO=that/node_modules/kokoro-js/dist/kokoro.js`; `VOICE=` picks
another Kokoro voice). It steps the game frame by frame on a virtual clock while the autopilot plays, draws the captions,
renders the game's music and every sound effect of the run offline, and mixes in the voice-over (music ducked under it,
-14 LUFS) — re-run it whenever the game's look changes.

### Custom colors

Every model page has a **Customize colors** button (viewer toolbar, download box and mobile dock) that opens a
full-screen editor (`src/components/editor/`); `/viewer/` uses the same editor for uploaded files. Click a part on the
model or pick it from the list, change its color, and download a `.glb` that looks the same in any glTF app.

`src/lib/recolor.ts` finds the editable parts:

- **Material colors** (e.g. Kenney nature kit: `woodBark`, `leafsGreen`) — saved as the material's `baseColorFactor`.
  On a photo-textured material (Rocketbox, NASA) the color tints the texture.
- **Palette textures** (Kenney `colormap` kits, KayKit) — one material whose small texture is a grid of gradient
  swatches. The texture is flood-filled into swatches and each swatch the model uses becomes a part; recoloring keeps
  the swatch's shading. A texture only counts as a palette if ≥ 97% of triangles sit inside a single swatch.

`src/lib/glb.ts` writes the edits into the original file: the JSON is patched and the binary chunk is copied byte for
byte, except that an edited palette is re-encoded as PNG. Meshopt/Draco geometry, animations, skins and the embedded
license are untouched.

Uploaded files can use meshopt, Draco or KTX2 compression; the Draco and Basis decoders are self-hosted in
`public/decoders/` (copied from three.js by `npm run decoders` — re-run after upgrading three).

### AI scenes

The builder's **AI scene** button (Alt+I) turns a prompt like "a theme park with roller coasters" into a scene —
as a **new project**, or as an **edit of the open project** ("replace the benches with lamps, remove the trees on the
left and put a roller coaster there, make it night"). In edit mode Gemini gets an inventory of the scene (every part by
name with where it stands, kits and their scales, rides, walkers, lights) and a coarse map of built, walkable and free
ground. Its `changes` remove, replace, move, scale, turn or re-animate existing parts — picked by name, family
(`nature-kit/tree*`), group (`people`, `walkers`, `trains`, `rides`, `lights`), area and a random share — before new
parts are added around them; it can also change the lighting and ground. One Ctrl+Z undoes the whole edit.

1. Gemini picks kits from the library for the idea (`kitsRequest` in `src/lib/builder/ai.ts`).
2. Gemini writes a compact layout plan — landmarks (with places people visit), rows (paths, fences, lamps), floor
   fills, rings, scatters, coaster rides, walkers and lights (`layoutRequest`).
3. `buildAiScene` (`src/lib/builder/ai-build.ts`) expands the plan: kit scales, overlap-free scattering on a spatial
   hash, real clip names for actions (walk, dance, cheer…), object / triangle budgets per size (Small 40 m → Huge
   220 m). Coaster rides are assembled piece by piece (`src/lib/builder/coaster.ts`) on free ground.

**Moving parts.** A scene item can carry a `motion` (`src/lib/builder/types.ts`): a closed route relative to the
item, a speed, stops (wait time + what to look at) and a clip to play while waiting. Coaster trains ride their track's
real centre line — up the ramps, round the corners, upside down through loopings — and wait at the station; walkers
follow the walkway graph (`src/lib/builder/nav.ts`, built from path lines and plazas) from place to place, stop, then
walk on. All loops share one period, so the scene loops seamlessly. The editor plays them on a shared clock
(`src/lib/builder/motion.ts`); export bakes routes into position/rotation keys and splices walk + stop clips, so a
`.glb` plays what the editor shows (files with many walkers get large — about 0.3 MB per walker). Select a moving part
to see its route; the inspector sets its speed or stops it.

The **Remix** button re-lays the last AI plan with a new random seed (new routes and scatter) without calling Gemini.

Calls go from the browser straight to the Gemini API. The model list comes from the key itself; "Auto" tries the
models that answer reliably on the free tier first and switches when one is busy (Pro models need a paid key).
Visitors can always click **Use your own key** (free from [aistudio.google.com/apikey](https://aistudio.google.com/apikey));
it is stored only in their browser.

### Importing the library

```bash
npm run library:build                                  # all sources (resumable; saves after each source)
npm run library:build -- --source kenney,kaykit        # selected sources
npm run library:build -- --source kenney --only car-kit
npm run models:og                                      # refresh share images (incl. per-category images)
```

Each source module (`scripts/library/sources/*.mjs`) downloads its files into `.cache/library/`; models are optimized
to single-file GLB (`scripts/library/common.mjs`) and given a thumbnail rendered in headless Chrome
(`scripts/library/thumbs.mjs` — set `CHROME_PATH` if Chrome/Edge isn't found).

## Configuration

Brand name, domain, description and keywords live in **`src/lib/site.ts`**.

| Env var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Production origin (default `https://models.codelove.in`) — used for canonical URLs, sitemap, Open Graph, JSON-LD |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Optional Google Search Console verification code |
| `NEXT_PUBLIC_BASE_PATH` | Only when hosting under a sub-path (not needed for the subdomain) |
| `NEXT_PUBLIC_GEMINI_API_KEY` | Default key for the builder's AI scenes. Keep it in `.env.development.local` (loaded by `npm run dev` only). Setting it for `next build` puts it in the public JavaScript, where anyone can copy it and use your quota — on the live site visitors can use their own key instead |

## SEO

- Per-page titles, descriptions, keywords and canonical URLs (`src/lib/seo.ts`)
- Landing pages per category (`/models/category/<slug>/`) and per collection (`/models/collection/<key>/`) — crawlable links to every model, with search keywords in `CATEGORY_INFO` (`src/lib/catalog.ts`)
- Game credits: "Created by Gowtham · Published by Models.codelove.in" (`GAME_CREDIT` in `src/lib/site.ts`) on every game's title, loading and how-to-play screens, its page, and its metadata / `VideoGame` JSON-LD
- Open Graph + Twitter cards with a 1200×630 share image per model (`public/og/`, rendered by `npm run models:og`)
- `sitemap.xml` (all pages + model images), `robots.txt`, `manifest.webmanifest`
- Structured data (JSON-LD): `WebSite` + search action, `FAQPage`, `CollectionPage`/`ItemList`, `3DModel`, `BreadcrumbList`
- Favicon set from `src/app/icon.svg`: SVG icon, `favicon.ico`, Apple touch icon, PWA icons (`npm run icons`)

Google Search Console: the site is verified with `public/googlefa1d1cdbc2c7df2a.html` (keep that file). Submit `https://models.codelove.in/sitemap.xml` under Sitemaps.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

The converted models are already committed in `public/`, so the site works right after `npm install`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Static production build → `out/` |
| `npm run start` | Serve the built `out/` folder locally |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript checks |
| `npm run models:fetch` | Pull the Rocketbox repo into `vendor/` (sparse clone of only what the build needs) |
| `npm run models:build` | Convert FBX/TGA → GLB/WebP, write `public/models`, `public/thumbs`, `public/animations` and `src/data/catalog.json` |
| `npm run models:og` | Render the social share images in `public/og/` |
| `npm run models:stamp` | Embed the MIT license into every existing `.glb` and refresh file sizes in the catalog |
| `npm run icons` | Render `favicon.ico`, Apple touch icon and PWA icons from `src/app/icon.svg` |
| `npm run decoders` | Copy three.js's Draco + Basis decoders into `public/decoders/` (for the GLB viewer) |
| `npm run android:build` | Build the Kingdom Clash Android APK from `out/` → `public/downloads/kingdom-clash.apk` (`--pack-only` skips Gradle) |
| `npm run playables:build` | Build Skate Rush for YouTube Playables → `dist-playables/skate-rush-playables.zip` |

### Regenerating the models

The upstream repository is ~24 GB on disk (mostly 2K TGA textures and 3ds Max sources). `models:fetch` does a shallow,
blob-less **sparse** clone that only downloads the FBX files, preview images, colour/normal/opacity textures and the
curated animation clips (~3.5 GB transfer, ~11 GB on disk). Then:

```bash
npm run models:fetch
npm run models:build              # only builds what's missing; add -- --force to rebuild all
npm run models:og
```

The pipeline (`scripts/build-models.mjs`):

1. Decodes the TGA textures (`scripts/lib/tga.mjs`), downsizes them to 1024 px (`TEXTURE_SIZE` env var), and
   converts grayscale bump maps (animals) into normal maps.
2. Converts FBX → glTF with FBX2glTF.
3. Optimizes with glTF Transform: removes vertex colours, fixes materials (non-metallic, alpha-tested hair), WebP
   textures, meshopt compression, and writes the copyright into `asset.copyright`.
4. Converts the curated Biped animations, keeping bone rotations + root motion (made loopable in place).

`vendor/` and `.cache/` are git-ignored; you can delete them after building. Download links and steps to get them
back: [VENDOR.md](VENDOR.md).

## Deploying to models.codelove.in

Locally, `next build` produces a fully static site in `out/` (for `npm start` and the Android app build); Firebase App
Hosting builds the same code as a Next.js server. Size check (full library):

- Repository: ~650 MB, ~14,000 asset files in `public/` (every file well under GitHub's 100 MB limit).
- Build: ~4 minutes; `out/` is ~2.3 GB / ~54,000 files (728 MB of `public/` assets + ~6,900 model pages at ~230 KB each).

**Firebase App Hosting (current host)** — project `d-models-bfb95`, backend `three-d-models` in `asia-southeast1`
(Singapore), live at https://three-d-models--d-models-bfb95.asia-southeast1.hosted.app. The backend is connected to
the GitHub repo, so every push to `main` builds and rolls out the site (~10–15 minutes; Firebase console → App Hosting →
`three-d-models` → Rollouts). There is no deploy command — just `git push`.

- App Hosting runs the site as a Next.js server on Cloud Run. Its adapter sets `NEXT_PRIVATE_STANDALONE=true`, and
  `next.config.ts` then skips `output: "export"` (a static export fails there with
  `.next/standalone/.next/routes-manifest.json` not found).
- `apphosting.yaml` scales to zero when idle and caps the backend at 4 instances (1 GiB each).
- The project is on the Blaze plan (pay as you go, after the monthly no-cost amounts).
- Custom domain: App Hosting → `three-d-models` → Settings → Domains → add `models.codelove.in`, then add the records
  Firebase shows at the DNS provider for `codelove.in` (replacing the Vercel CNAME).
- Analytics: `src/components/firebase-analytics.tsx` starts Google Analytics for Firebase on the published site only
  (not in `next dev`, on localhost, or in the Android app). The web config is in `src/lib/firebase.ts` — those values
  are public identifiers, not secrets.
- The earlier static Firebase Hosting site (`d-models-bfb95.web.app`) is disabled.
- On a low-memory PC, build locally with fewer workers: `CIRCLE_NODE_TOTAL=4 npm run build` (3 workers instead of CPUs − 1).

**Vercel via Git (alternative)** — Git deployments have no limit on output files; builds must finish in 45 minutes.
1. Push the repository to GitHub under your **personal account** (Vercel Hobby can't connect repos owned by a GitHub
   organization).
2. In Vercel: Add New → Project → import the repo (framework preset: Next.js, defaults are fine). Every push to `main`
   deploys production; every other branch / pull request gets a preview URL.
3. Project → Settings → Domains → add `models.codelove.in`.
4. At your DNS provider for `codelove.in`, add a **CNAME** record: name `models`, value = the target Vercel shows
   (usually `cname.vercel-dns.com`).

Don't add `NEXT_PUBLIC_GEMINI_API_KEY` to Vercel's environment variables (it would be public — see Configuration).
Vercel uses the Node.js version in `engines.node` in `package.json` (22.x).
Don't deploy with `vercel` CLI uploads (15,000 source-file / 100 MB limits on Hobby) — use the Git integration.

**Not suitable at this size:** GitHub Pages (1 GB site limit — larger deploys fail) and Cloudflare Pages (20,000-file
limit). To use them you would need to drop library sources (`src/data/library.json` + `public/library/<source>`) —
moving `public/library` to separate storage isn't enough, because the ~6,650 library model pages alone are over 1 GB.

## Project structure

```
scripts/                 model fetch + conversion, share images, icons
public/models/*.glb      converted models (+ LICENSE.md)
public/animations/*.glb  animation clips (+ LICENSE.md)
public/thumbs/*.webp     gallery thumbnails
public/og/*.jpg          social share images
src/data/catalog.json    generated metadata for every model
src/lib/                 catalog access, site config, SEO helpers
src/app/                 pages, sitemap, robots, manifest, icons
src/components/viewer/   three.js / React Three Fiber viewer
```

## License

The 3D models, textures and animations are from the Microsoft Rocketbox Avatar Library, **Copyright (c) 2020
Microsoft**, released under the **MIT License** — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This site is
independent and is not affiliated with or endorsed by Microsoft.
#   t h r e e - d - m o d e l s 
 
 