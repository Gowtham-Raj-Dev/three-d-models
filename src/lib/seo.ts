import type { Metadata } from "next";
import { SITE } from "@/lib/site";

const DEFAULT_IMAGE = { url: "/og/default.jpg", width: 1200, height: 630, alt: `${SITE.name} — free rigged 3D characters` };

/**
 * Per-page metadata: canonical URL, Open Graph and Twitter card. Next.js replaces (rather than
 * merges) the layout's openGraph/twitter objects, so every page builds the full set here.
 */
export function pageMetadata({
  title,
  description,
  path,
  image,
  absoluteTitle = false,
}: {
  title: string;
  description: string;
  /** Route path with trailing slash, e.g. "/models/". */
  path: string;
  image?: { url: string; alt: string };
  /** Use the title as-is instead of the "%s | 3D Models" template. */
  absoluteTitle?: boolean;
}): Metadata {
  const ogImage = image ? { ...image, width: 1200, height: 630 } : DEFAULT_IMAGE;
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE.name}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: SITE.locale,
      url: path,
      title: fullTitle,
      description,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [ogImage.url],
    },
  };
}
