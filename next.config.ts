import type { NextConfig } from "next";

// Set NEXT_PUBLIC_BASE_PATH=/repo-name when hosting under a sub-path (e.g. GitHub Pages project sites).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";

// Firebase App Hosting's Next.js adapter sets this before `next build`: it needs a standalone server build, not `out/`.
const appHosting = process.env.NEXT_PRIVATE_STANDALONE === "true";

// Models, thumbnails and the catalog files (/llms.txt, /catalog.json…) may be fetched from any site, so other
// people's web games and AI tools can load them straight from here.
const CORS_PATHS = [
  "/library/:path*",
  "/models/:file.glb",
  "/animations/:path*",
  "/thumbs/:path*",
  "/licenses/:path*",
  "/data/:path*",
  "/llms/:path*",
  "/llms.txt",
  "/llms-full.txt",
  "/catalog.json",
];

// Next.js serves public/ files with `max-age=0`, so every model, clip and thumbnail went back to Cloud Run and was
// downloaded again on each visit. App Hosting's CDN is cleared on every rollout, so it can keep them for a year;
// browsers keep them for a week, in case a file is replaced under the same name.
const LONG_CACHE_PATHS = [
  "/library/:path*",
  "/models/:file.glb",
  "/animations/:path*",
  "/thumbs/:path*",
  "/og/:path*",
  "/decoders/:path*",
  "/video/:path*",
];
const LONG_CACHE = "public, max-age=604800, s-maxage=31536000, stale-while-revalidate=86400";

const nextConfig: NextConfig = {
  // Fully static site: `next build` writes plain HTML/JS/assets to `out/`, deployable anywhere.
  output: appHosting ? undefined : "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // A static export can't set headers or redirect (its host has to), so only the App Hosting server build does.
  ...(appHosting && {
    // The games moved to their own site: /games/skate-rush/ is now games.codelove.in/skate-rush/.
    // Their files (covers, trailers…) kept the /games/ folder there and take no trailing slash, so they go first.
    redirects: async () => [
      { source: "/games/:file(.+\\.[a-zA-Z0-9]+)", destination: "https://games.codelove.in/games/:file", permanent: true },
      { source: "/games", destination: "https://games.codelove.in/", permanent: true },
      { source: "/games/:path*", destination: "https://games.codelove.in/:path*/", permanent: true },
    ],
    headers: async () => [
      ...CORS_PATHS.map((source) => ({ source, headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] })),
      ...LONG_CACHE_PATHS.map((source) => ({ source, headers: [{ key: "Cache-Control", value: LONG_CACHE }] })),
    ],
  }),
};

export default nextConfig;
