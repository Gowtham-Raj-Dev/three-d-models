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

const nextConfig: NextConfig = {
  // Fully static site: `next build` writes plain HTML/JS/assets to `out/`, deployable anywhere.
  output: appHosting ? undefined : "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // A static export can't set headers (its host has to), so only the App Hosting server build sends them.
  ...(appHosting && {
    headers: async () =>
      CORS_PATHS.map((source) => ({ source, headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] })),
  }),
};

export default nextConfig;
