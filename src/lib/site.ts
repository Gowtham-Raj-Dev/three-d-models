/** Brand and SEO settings — change these to rename the site or move it to another domain. */
export const SITE = {
  name: "3D Models",
  /** Production origin, no trailing slash. Override with NEXT_PUBLIC_SITE_URL. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://modals.codelove.in").replace(/\/$/, ""),
  tagline: "Free 3D models",
  description:
    "Thousands of free 3D models — rigged characters, animals, cars, buildings, furniture, food, nature, trees and space. Preview in real-time 3D and download GLB in one click, free for personal and commercial use.",
  keywords: [
    "free 3D models",
    "free 3D characters",
    "rigged 3D characters",
    "rigged 3D models",
    "free GLB models",
    "glTF models",
    "3D avatars",
    "game characters",
    "VR avatars",
    "three.js models",
    "3D people",
    "3D animals",
    "character animations",
    "MIT license 3D models",
    "CC0 3D models",
    "free car 3D models",
    "free building 3D models",
    "free furniture 3D models",
    "free tree 3D models",
    "low poly 3D models",
  ],
  locale: "en_US",
  themeColor: "#07070b",
};

/** Absolute URL on the production origin (for canonical links, Open Graph, sitemap, JSON-LD). */
export function absoluteUrl(path = "/"): string {
  return new URL(path, `${SITE.url}/`).toString();
}
