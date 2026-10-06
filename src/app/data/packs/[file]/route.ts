import { allCollections, animationsPack, collectionPack } from "@/lib/catalog";

export const dynamic = "force-static";
export const dynamicParams = false;

/** One manifest per pack, fetched by the download button only when clicked. */
export function generateStaticParams() {
  return [...allCollections().map((c) => ({ file: `${c.key}.json` })), { file: "animations.json" }];
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const key = file.replace(/\.json$/, "");
  const pack = key === "animations" ? animationsPack() : collectionPack(key);
  if (!pack) return new Response("Not found", { status: 404 });
  return Response.json(pack);
}
