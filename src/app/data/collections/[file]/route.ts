import { allCollections, cardsJson, getCollection } from "@/lib/catalog";

export const dynamic = "force-static";
export const dynamicParams = false;

/** Every card in one collection, fetched by the gallery only when that collection is picked. */
export function generateStaticParams() {
  return allCollections().map((c) => ({ file: `${c.key}.json` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const collection = getCollection(file.replace(/\.json$/, ""));
  if (!collection) return new Response("Not found", { status: 404 });
  return new Response(cardsJson(collection.models), { headers: { "Content-Type": "application/json" } });
}
