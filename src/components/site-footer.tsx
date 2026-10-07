import Link from "next/link";
import { Logo } from "@/components/site-header";
import { SITE } from "@/lib/site";

const COLUMNS = [
  {
    title: "Catalog",
    links: [
      { href: "/models/", label: "All models" },
      { href: "/models/category/god-of-war/", label: "God of War" },
      { href: "/models/category/skeletons/", label: "Skeletons" },
      { href: "/models/category/bikes/", label: "Bikes" },
      { href: "/models/category/gaming/", label: "Gaming" },
      { href: "/models/category/characters/", label: "Characters" },
      { href: "/models/category/vehicles/", label: "Vehicles" },
      { href: "/models/category/buildings/", label: "Buildings" },
      { href: "/models/category/space/", label: "Space" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/packs/", label: "Download packs" },
      { href: "/animations/", label: "Animations" },
      { href: "/games/", label: "Games" },
      { href: "/developers/", label: "For developers & AI" },
      { href: "/license/", label: "Licensing" },
      { href: "/license/#attribution", label: "How to credit" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface/40 sm:mt-32">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-4 py-12 sm:px-6 sm:py-14 md:grid-cols-[1.6fr_1fr_1fr]">
        <div className="col-span-2 space-y-4 md:col-span-1">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed text-muted">{SITE.description}</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h2 className="mb-4 text-xs font-semibold tracking-[0.14em] text-subtle uppercase">{col.title}</h2>
            <ul className="space-y-2.5 text-sm text-muted">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs leading-relaxed text-subtle sm:px-6 md:flex-row md:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.brand} — site and games by {SITE.author}. Models are free under the MIT, CC0, public-domain and CC BY licenses —{" "}
            <Link href="/license/" className="text-muted underline underline-offset-2 hover:text-fg">
              licensing
            </Link>
            .
          </p>
          <p>Independent site — not affiliated with or endorsed by any model creator.</p>
        </div>
      </div>
    </footer>
  );
}
