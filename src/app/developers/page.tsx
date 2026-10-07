import type { ReactNode } from "react";
import Link from "next/link";
import { Bot, FileJson, FileText, Map as MapIcon } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { JsonLd } from "@/components/json-ld";
import { Eyebrow } from "@/components/ui";
import { catalogJson, llmsFullTxt, llmsTxt, threeExample } from "@/lib/ai-catalog";
import { allCollections, formatBytes, formatNumber, models } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl, SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: "For Developers & AI Agents — Free 3D Model Catalog, GLB URLs, llms.txt",
  description: `Use ${formatNumber(models.length)} free 3D models in your games, apps and AI tools: direct GLB URLs that load from any site, the whole catalog in one file (llms.txt, llms-full.txt, catalog.json) and three.js code samples.`,
  path: "/developers/",
  keywords: ["free 3D models API", "3D model catalog JSON", "llms.txt", "free GLB models for AI", "three.js free models", "3D assets for AI agents", "free game assets URL"],
});

const size = (text: string) => formatBytes(Buffer.byteLength(text));

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2 mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {children}
    </section>
  );
}

/** A copyable code block; `wrap` for prose like the prompt, so it doesn't scroll sideways. */
function Code({ name, code, wrap = false }: { name: string; code: string; wrap?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="font-mono text-xs text-subtle">{name}</span>
        <CopyButton text={code} />
      </div>
      <pre className={`overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-muted ${wrap ? "whitespace-pre-wrap" : ""}`}>{code}</pre>
    </div>
  );
}

export default function DevelopersPage() {
  const example = allCollections().find((c) => c.key === "car-kit") ?? allCollections()[0];
  const files = [
    { icon: Bot, path: "/llms.txt", size: size(llmsTxt()), text: "Start here: what's on the site, licenses, how to load the files and an index of every collection." },
    { icon: FileText, path: "/llms-full.txt", size: size(llmsFullTxt()), text: "Every model in one Markdown file: name, page, .glb path, triangles, size and license notes." },
    { icon: FileJson, path: "/catalog.json", size: size(catalogJson()), text: "The same data as JSON for scripts: models, collections, licenses and animation clips." },
    {
      icon: FileText,
      path: `/llms/${example.key}.md`,
      size: `${allCollections().length} files`,
      text: "One collection per file with absolute URLs — every one is linked from /llms.txt.",
    },
    { icon: MapIcon, path: "/sitemap.xml", size: "", text: "Every page on the site, for crawlers." },
  ];
  const prompt = `Make a small three.js game in a single HTML file. Use free 3D models from ${SITE.brand}: read ${absoluteUrl("/llms.txt")} to pick models and get their .glb URLs, then load them with GLTFLoader and MeshoptDecoder.`;
  const search = [
    `const catalog = await fetch("${absoluteUrl("/catalog.json")}").then((r) => r.json());`,
    "",
    "// Low-poly trees, smallest first",
    'const trees = catalog.models.filter((m) => m.category === "Trees").sort((a, b) => a.triangles - b.triangles);',
    "const url = new URL(trees[0].glb, catalog.url).href; // absolute .glb URL",
  ].join("\n");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${SITE.brand} 3D model catalog`,
    description: `Catalog of ${formatNumber(models.length)} free 3D models (glTF 2.0 .glb) with download URLs, licenses, triangle counts and sizes.`,
    url: absoluteUrl("/developers/"),
    isAccessibleForFree: true,
    creator: { "@type": "Person", name: SITE.author },
    publisher: { "@type": "Organization", name: SITE.brand, url: absoluteUrl("/") },
    license: absoluteUrl("/license/"),
    distribution: [
      { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: absoluteUrl("/catalog.json") },
      { "@type": "DataDownload", encodingFormat: "text/markdown", contentUrl: absoluteUrl("/llms-full.txt") },
    ],
  };

  return (
    <div className="mx-auto max-w-5xl space-y-16 px-4 pt-8 sm:space-y-20 sm:px-6 sm:pt-12">
      <JsonLd data={jsonLd} />
      <header className="space-y-4">
        <Eyebrow>For developers &amp; AI</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Use the models in your games, apps and AI tools.</h1>
        <p className="max-w-3xl text-lg leading-relaxed text-muted">
          Every one of the {formatNumber(models.length)} models has a direct .glb URL — no sign-up, no API key — and can be
          loaded from any website. AI assistants and agents can read the whole catalog from one file instead of opening
          thousands of pages.
        </p>
      </header>

      <Section id="files" eyebrow="Catalog files" title="The whole library in a few files">
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {files.map(({ icon: Icon, path, size, text }) => (
            <li key={path} className="flex gap-4 bg-surface/60 px-5 py-4">
              <Icon className="mt-0.5 size-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <a href={path} className="font-mono text-sm break-all text-fg hover:text-accent">
                    {path}
                  </a>
                  {size && <span className="text-xs text-subtle tabular-nums">{size}</span>}
                </div>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          The .glb files, thumbnails and these catalog files can be fetched from any origin (CORS), so a web game can load
          models straight from {SITE.brand}. Files are glTF 2.0 binary with EXT_meshopt_compression and EXT_texture_webp.
        </p>
      </Section>

      <Section id="ai" eyebrow="AI assistants" title="Ask ChatGPT, Claude or Gemini to build with them">
        <p className="mb-5 max-w-3xl leading-relaxed text-muted">
          Paste this into any assistant that can open web pages — or into a coding agent like Claude Code or Cursor. It reads
          /llms.txt, picks models and writes the loading code with real URLs.
        </p>
        <Code name="prompt" code={prompt} wrap />
      </Section>

      <Section id="three" eyebrow="three.js" title="Load a model">
        <Code name="main.js" code={threeExample()} />
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Rigged characters play the shared animation clips: load a character and a clip from its set (female or male), then
          play the clip with <span className="font-mono text-fg">THREE.AnimationMixer</span> — the bone names match. See{" "}
          <Link href="/animations/" className="text-fg underline underline-offset-2 hover:text-accent">
            Animations
          </Link>
          .
        </p>
      </Section>

      <Section id="search" eyebrow="Scripts" title="Search the catalog in code">
        <Code name="search.js" code={search} />
      </Section>

      <Section id="license" eyebrow="Licensing" title="Free to use, even commercially">
        <p className="max-w-3xl leading-relaxed text-muted">
          Most models are CC0 or public domain — no credit needed. The rigged characters and animation clips are MIT: keep the
          license file with them. A few hairstyles are CC BY or CC BY-ND: credit the author. Each model&apos;s license is in
          catalog.json, on its page and inside the .glb file.{" "}
          <Link href="/license/" className="text-fg underline underline-offset-2 hover:text-accent">
            Full licensing
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
