"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Boxes, Menu, X } from "lucide-react";

const LINKS = [
  { href: "/models/", label: "Models", match: (p: string) => p.startsWith("/models") },
  { href: "/packs/", label: "Packs", match: (p: string) => p.startsWith("/packs") },
  { href: "/animations/", label: "Animations", match: (p: string) => p.startsWith("/animations") },
  { href: "/games/", label: "Games", match: (p: string) => p.startsWith("/games") },
  // Shown as the call-to-action button on desktop, as a regular link in the mobile menu.
  { href: "/builder/", label: "Scene Builder", match: (p: string) => p.startsWith("/builder"), cta: true },
  { href: "/viewer/", label: "GLB Viewer", match: (p: string) => p.startsWith("/viewer") },
  { href: "/developers/", label: "Developers", match: (p: string) => p.startsWith("/developers") },
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="hidden items-center gap-1 text-sm lg:flex">
        {LINKS.filter((link) => !link.cta).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-3.5 py-1.5 transition-colors ${
              link.match(pathname) ? "bg-white/[0.07] text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {link.label}
          </Link>
        ))}
        <Link href="/builder/" className="ml-3 inline-flex items-center gap-1.5 rounded-full bg-fg px-4 py-1.5 font-medium text-bg transition hover:bg-white">
          <Boxes className="size-3.5" /> Open Builder
        </Link>
      </nav>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className="grid size-9 place-items-center rounded-lg border border-line text-muted lg:hidden"
      >
        {open ? <X className="size-4.5" /> : <Menu className="size-4.5" />}
      </button>

      {open && (
        <nav id="mobile-nav" className="absolute inset-x-0 top-16 border-b border-line bg-surface px-4 py-3 shadow-2xl shadow-black/60 lg:hidden">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2.5 text-sm ${link.match(pathname) ? "bg-white/[0.06] text-fg" : "text-muted"}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
