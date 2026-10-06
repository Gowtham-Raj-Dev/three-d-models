# Rocketbox source files (`vendor/`)

The `vendor/` folder is **not** in this repository (it is ~11 GB and git-ignored). The site does **not** need it —
every converted model, thumbnail and animation is already committed in `public/`.

You only need it to **rebuild the Rocketbox models** (`npm run models:build`).

## Download link

**Microsoft Rocketbox Avatar Library:** <https://github.com/microsoft/Microsoft-Rocketbox>

License: MIT, © 2020 Microsoft — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Download it (recommended)

```bash
npm run models:fetch
```

This puts the files in `vendor/Microsoft-Rocketbox/`. It downloads only what the build needs (~3.5 GB download,
~11 GB on disk), not the full ~24 GB repo. Needs `git` installed.

## Download it by hand

Same result as `npm run models:fetch`, run from the project folder:

```bash
git clone --filter=blob:none --no-checkout --depth 1 --branch master https://github.com/microsoft/Microsoft-Rocketbox.git vendor/Microsoft-Rocketbox
cd vendor/Microsoft-Rocketbox
git sparse-checkout init --no-cone
```

Copy the `SPARSE` list from [scripts/fetch-rocketbox.mjs](scripts/fetch-rocketbox.mjs) into
`vendor/Microsoft-Rocketbox/.git/info/sparse-checkout` (one line each), then:

```bash
git checkout -B master origin/master
```

## After downloading

```bash
npm run models:build     # only builds what's missing; add -- --force to rebuild all
npm run models:og
```

You can delete `vendor/` again when the build is done.

## Other build caches (`.cache/`)

`.cache/` is also git-ignored and safe to delete. The scripts download it again by themselves:

| Folder | Re-created by | Downloads from |
| --- | --- | --- |
| `.cache/build` | `npm run models:build` | `vendor/` (above) |
| `.cache/library` | `npm run library:build` | Kenney, KayKit, Polygonal Mind, NASA |
| `.cache/custom-downloads` | `node scripts/build-custom-assets.mjs` | URLs inside that script |

**Exception — `.cache/hair-raw` is not re-downloaded.** It holds the six Sketchfab hairstyle downloads that
`node scripts/build-hair-models.mjs` builds into `public/library/hair`. Sketchfab needs a login, so if it is deleted,
download them again by hand from the links in that script (the built models in `public/` don't need it).
