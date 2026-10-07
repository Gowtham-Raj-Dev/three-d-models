/** Brand and SEO settings — change these to rename the site or move it to another domain. */
export const SITE = {
  /** Site name in page titles, credits and metadata — all lowercase, like the domain. */
  name: "models.codelove.in",
  /** Short name in the header logo and on the installed app's home-screen icon. */
  shortName: "3D Models",
  /** Publisher name shown in credits, Open Graph and structured data. */
  brand: "models.codelove.in",
  /** Who made the site and its games. */
  author: "Gowtham",
  /** Production origin, no trailing slash. Override with NEXT_PUBLIC_SITE_URL. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://models.codelove.in").replace(/\/$/, ""),
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
    "free 3D models download",
    "free 3D assets",
    "free game assets",
    "3D models for Unity",
    "3D models for Blender",
    "3D models for Godot",
    "free 3D games online",
    "ad-free games",
    "models.codelove.in",
  ],
  locale: "en_US",
  themeColor: "#07070b",
};

/** Credit line on every game: in the game itself, on its page and in its metadata. */
export const GAME_CREDIT = `Created by ${SITE.author} · Published by ${SITE.brand}`;

/** Absolute URL on the production origin (for canonical links, Open Graph, sitemap, JSON-LD). */
export function absoluteUrl(path = "/"): string {
  return new URL(path, `${SITE.url}/`).toString();
}
