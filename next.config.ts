import type { NextConfig } from "next";

// Set NEXT_PUBLIC_BASE_PATH=/repo-name when hosting under a sub-path (e.g. GitHub Pages project sites).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";

const nextConfig: NextConfig = {
  // Fully static site: `next build` writes plain HTML/JS/assets to `out/`, deployable anywhere.
  output: "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
