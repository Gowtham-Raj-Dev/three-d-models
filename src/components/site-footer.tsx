import Link from "next/link";
import { HeartButton } from "@/components/heart-button";
import { Logo } from "@/components/site-header";
import { asset } from "@/lib/asset";
import { CODELOVE, CODELOVE_GUIDES, SITE } from "@/lib/site";

const COLUMNS = [
  {
    title: "Catalog",
    links: [
      { href: "/models/", label: "All models" },
      { href: "/models/category/god-of-war/", label: "God of War" },
      { href: "/models/category/skeletons/", label: "Skeletons" },
      { href: "/models/category/ghosts/", label: "Ghosts" },
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
      { href: "/tutorials/", label: "Scene Builder tutorials" },
      { href: "/developers/", label: "For developers & AI" },
      { href: "/license/", label: "Licensing" },
      { href: "/license/#attribution", label: "How to credit" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
];

/** Who runs the site, how to reach them and the policies — in the footer of every page. */
const ABOUT = [
  { href: "/about/", label: "About" },
  { href: "/contact/", label: "Contact" },
  { href: "/privacy/", label: "Privacy policy" },
  { href: "/terms/", label: "Terms of use" },
];

const heading = "mb-4 text-xs font-semibold tracking-[0.14em] text-subtle uppercase";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface/40 sm:mt-32">
      {/* Tablets give the brand its own row: three link columns beside it only fit from lg up. */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-4 pt-12 sm:px-6 sm:pt-14 lg:grid-cols-[1.6fr_1fr_1fr]">
        <div className="col-span-2 space-y-4 lg:col-span-1">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed text-muted">{SITE.description}</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h2 className={heading}>{col.title}</h2>
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
      {/* The main CodeLove site and its other tools: a full-width row so it doesn't leave a gap beside one tall column. */}
      <div className="mx-auto mt-12 grid max-w-7xl gap-10 border-t border-line px-4 pt-8 pb-12 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="grid gap-8">
          <nav aria-label={`${CODELOVE.name} network`}>
          <h2 className={heading}>{CODELOVE.name} network</h2>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm text-muted sm:grid-cols-3 lg:grid-cols-4">
            {[{ name: CODELOVE.name, url: CODELOVE.url }, ...CODELOVE.tools].map((site) => (
              <li key={site.url}>
                <a href={site.url} className="transition-colors hover:text-fg">
                  {site.name}
                </a>
              </li>
            ))}
          </ul>
          </nav>
          {/* Guides on the main site for using the models. */}
          <nav aria-label="Guides">
          <h2 className={heading}>Guides</h2>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm text-muted sm:grid-cols-3 lg:grid-cols-4">
            {Object.values(CODELOVE_GUIDES).map((guide) => (
              <li key={guide.url}>
                <a href={guide.url} className="transition-colors hover:text-fg">
                  {guide.name}
                </a>
              </li>
            ))}
          </ul>
          </nav>
        </div>
        {/* The parent brand. */}
        <div className="max-w-[260px] lg:justify-self-end">
          <a href={CODELOVE.url} aria-label={`${CODELOVE.name} — codelove.in`} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("/codelove/codelove-footer-on-dark.png")}
              alt={CODELOVE.name}
              width={704}
              height={144}
              loading="lazy"
              className="h-auto w-full max-w-[235px]"
            />
          </a>
          {/* What CodeLove is, in one line — same text on every CodeLove site. */}
          <p className="mt-4 text-sm leading-relaxed text-muted">
            CodeLove makes free web tools, apps and games for creators, students and developers — simple to use, no hidden
            fees.
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <nav aria-label="About this site" className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-2 px-4 pt-6 text-sm text-muted sm:px-6">
          {ABOUT.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-fg">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 pt-4 pb-6 text-xs leading-relaxed text-subtle sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p>
              © {new Date().getFullYear()} {SITE.brand} — site by {SITE.author}. Models are free under the MIT, CC0, public-domain and CC BY licenses —{" "}
              <Link href="/license/" className="text-muted underline underline-offset-2 hover:text-fg">
                licensing
              </Link>
              .
            </p>
            <p>Independent site — not affiliated with or endorsed by any model creator.</p>
          </div>
          <p className="inline-flex shrink-0 flex-wrap items-center gap-1.5 text-sm text-muted">
            Built with <HeartButton /> by{" "}
            <a
              href="https://gowtham.codelove.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-fg transition-colors hover:text-accent"
            >
              Gowtham
            </a>
            <span className="hidden text-muted/50 sm:inline">•</span>
            <a
              href="https://codelove.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-fg transition-colors hover:text-accent"
            >
              CodeLove
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
