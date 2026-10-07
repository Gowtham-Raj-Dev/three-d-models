import { collectionMarkdown } from "@/lib/ai-catalog";
import { allCollections, getCollection } from "@/lib/catalog";

export const dynamic = "force-static";
export const dynamicParams = false;

/** One collection's models as Markdown with absolute URLs, linked from /llms.txt. */
export function generateStaticParams() {
  return allCollections().map((c) => ({ file: `${c.key}.md` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const collection = getCollection(file.replace(/\.md$/, ""));
  if (!collection) return new Response("Not found", { status: 404 });
  return new Response(collectionMarkdown(collection), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
