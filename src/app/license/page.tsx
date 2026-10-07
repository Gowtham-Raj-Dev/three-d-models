import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Eyebrow } from "@/components/ui";
import { allCollections, catalog, formatNumber, models, SOURCES, type SourceKey } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Licensing — Free for Personal & Commercial Use (MIT, CC0, Public Domain, CC BY)",
  description: `Licensing for all ${formatNumber(models.length)} free 3D models: MIT (rigged characters and animations), CC0, public domain and CC BY (hairstyles, credit the author). Commercial use allowed.`,
  path: "/license/",
});

const readLicense = (file: string) => fs.readFileSync(path.join(process.cwd(), "public", file), "utf8").replace(/\r\n/g, "\n").trim();

/** The page shows the license terms; the copyright notice itself ships inside every download. */
const withoutCopyright = (text: string) => text.replace(/^Copyright \(c\).*\n+/m, "");

const LICENSES = [
  {
    id: "mit",
    badge: "MIT",
    title: "MIT License",
    sources: ["mit"] as SourceKey[],
    summary:
      "The rigged human characters and animals, and all animation clips. Their copyright notice is included in every download — inside each .glb and in the LICENSE.txt of each .zip.",
    rules: [
      "Commercial use, modification and redistribution allowed",
      "Keep the copyright notice and license text with the files (every download includes them)",
      "Provided as-is, without warranty",
    ],
    file: SOURCES.mit.licenseFile,
  },
  {
    id: "cc0",
    badge: "CC0",
    title: "CC0 1.0 — public domain",
    sources: ["cc0"] as SourceKey[],
    summary: "Vehicles, buildings, furniture, food, nature, props and stylized characters.",
    rules: ["Use for anything, including commercial projects", "No attribution required", "Provided as-is, without warranty"],
    file: SOURCES.cc0.licenseFile,
  },
  {
    id: "public-domain",
    badge: "PD",
    title: "Public domain",
    sources: ["public-domain"] as SourceKey[],
    summary: "Spacecraft, rovers, satellites, planets and astronaut gear.",
    rules: ["Free to use, including commercially", "Don't use insignia or logos shown on the models to imply endorsement", "Other rights may apply to identifiable people or third-party marks"],
    file: SOURCES["public-domain"].licenseFile,
  },
  {
    id: "cc-by",
    badge: "CC BY",
    title: "CC BY 4.0 — credit the author",
    sources: ["cc-by"] as SourceKey[],
    summary: "Hairstyles by Sketchfab artists. Each model page names the author and links the original; the credit is also inside each .glb and in ATTRIBUTION.txt.",
    rules: ["Commercial use, modification and redistribution allowed", "Credit the author and link the license", "Say if you changed the model"],
    file: SOURCES["cc-by"].licenseFile,
  },
  {
    id: "cc-by-nd",
    badge: "CC BY-ND",
    title: "CC BY-ND 4.0 — credit, no changes",
    sources: ["cc-by-nd"] as SourceKey[],
    summary: "Hairstyles by Sketchfab artists that may be shared only unmodified. Each model page names the author and links the original.",
    rules: ["Commercial use allowed", "Credit the author and link the license", "Share only unmodified copies (changes are fine for your own use)"],
    file: SOURCES["cc-by-nd"].licenseFile,
  },
];

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2 mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {children}
    </section>
  );
}

export default function LicensePage() {
  const collections = allCollections();
  const countFor = (sources: SourceKey[]) => models.filter((m) => sources.includes(m.source)).length;
  const presentLicenses = LICENSES.filter((l) => countFor(l.sources) > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-16 px-4 pt-8 sm:space-y-20 sm:px-6 sm:pt-12">
      <header className="space-y-4">
        <Eyebrow>Licensing</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Free to use — even commercially.</h1>
        <p className="max-w-3xl text-lg leading-relaxed text-muted">
          Every one of the {formatNumber(models.length)} models on {SITE.name} is free to use, including commercially. Almost
          all are MIT, CC0 or public domain; a few hairstyles are CC BY or CC BY-ND, which ask you to credit their author.
          Each model page shows its exact license, and every download carries it — inside the .glb file and as a text file
          in each .zip.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {presentLicenses.map((l) => (
          <a key={l.id} href={`#${l.id}`} className="rounded-2xl border border-line bg-surface/60 p-6 transition hover:border-line-strong">
            <span className="inline-flex rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">{l.badge}</span>
            <h2 className="mt-3 font-medium">{l.title}</h2>
            <p className="mt-1 text-sm text-muted">{formatNumber(countFor(l.sources))} models</p>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              {l.rules.map((r) => (
                <li key={r} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" /> {r}
                </li>
              ))}
            </ul>
          </a>
        ))}
      </section>
      <p className="-mt-10 text-xs text-subtle">This summary is for convenience only and is not legal advice — the license texts below are what apply.</p>

      {presentLicenses.map((l) => {
        const text = withoutCopyright(readLicense(l.file));
        return (
          <Section key={l.id} id={l.id} eyebrow={l.badge} title={l.title}>
            <p className="mb-5 leading-relaxed text-muted">{l.summary}</p>
            <div className="rounded-2xl border border-line bg-surface">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <span className="font-mono text-xs text-subtle">{l.file.split("/").pop()}</span>
                <CopyButton text={text} label="Copy license" />
              </div>
              <pre className="max-h-[420px] overflow-auto p-5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-muted">{text}</pre>
            </div>
          </Section>
        );
      })}

      <Section id="attribution" eyebrow="How to credit" title="Attribution">
        <div className="space-y-4 leading-relaxed text-muted">
          <p>
            Every .zip contains the license file(s) and an <span className="font-mono text-fg">ATTRIBUTION.txt</span> listing
            each model and its license.
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              <span className="text-fg">MIT:</span> keep the copyright notice and MIT text that come with the files — e.g. in your
              credits or a third-party notices file.
            </li>
            <li>
              <span className="text-fg">CC0:</span> no credit required.
            </li>
            <li>
              <span className="text-fg">Public domain:</span> no credit required; don&apos;t use insignia or logos shown on the
              models to suggest anyone endorses your work.
            </li>
            <li>
              <span className="text-fg">CC BY / CC BY-ND:</span> credit the author with the line from the model page or
              ATTRIBUTION.txt (title, author, link) and link the license. CC BY-ND models may be shared only unmodified.
            </li>
          </ul>
        </div>
      </Section>

      <Section id="collections" eyebrow={`${collections.length} collections`} title="License by collection">
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Collection</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Models</th>
                <th className="px-4 py-3 font-medium">License</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {collections.map((c) => (
                <tr key={c.key} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5">
                    <Link href={`/models/collection/${c.key}/`} className="text-fg hover:text-accent">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">{c.category}</td>
                  <td className="px-4 py-2.5 text-xs text-muted tabular-nums">{c.count}</td>
                  <td className="space-x-1 px-4 py-2.5">
                    {c.sources.map((s) => (
                      <span key={s} className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-emerald-300">
                        {SOURCES[s].licenseName}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-subtle">
          Animation clips ({catalog.animations.length}) belong to the rigged character library and use the MIT License.
        </p>
      </Section>
    </div>
  );
}
