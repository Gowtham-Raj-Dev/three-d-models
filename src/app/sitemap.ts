import type { MetadataRoute } from "next";
import { allCollections, CATEGORIES, categorySlug, countBy, models } from "@/lib/catalog";
import { games } from "@/lib/games";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/models/"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...CATEGORIES.filter((c) => countBy(c) > 0).map((c) => ({
      url: absoluteUrl(`/models/category/${categorySlug(c)}/`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
      images: [absoluteUrl(`/og/category-${categorySlug(c)}.jpg`)],
    })),
    ...allCollections().map((c) => ({
      url: absoluteUrl(`/models/collection/${c.key}/`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: absoluteUrl("/games/"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...games
      .filter((g) => !g.comingSoon)
      .flatMap((g) => [
        {
          url: absoluteUrl(`/games/${g.slug}/`),
          lastModified: now,
          changeFrequency: "monthly" as const,
          priority: 0.8,
          images: [absoluteUrl(g.cover)],
        },
        { url: absoluteUrl(`/games/${g.slug}/play/`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 },
      ]),
    { url: absoluteUrl("/packs/"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/developers/"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/animations/"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/builder/"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/viewer/"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/license/"), lastModified: now, changeFrequency: "yearly", priority: 0.4 },
  ];
  return [
    ...pages,
    ...models.map((m) => ({
      url: absoluteUrl(`/models/${m.slug}/`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      images: m.thumb ? [absoluteUrl(m.thumb.src)] : undefined,
    })),
  ];
}
