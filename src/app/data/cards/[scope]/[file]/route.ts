import { CARD_PAGE, cardScope } from "@/lib/card-pages";
import { CATEGORIES, cardsJson, models, type ModelEntry } from "@/lib/catalog";

export const dynamic = "force-static";
export const dynamicParams = false;

/** "all" plus one scope per category, each in featured (catalog) order. */
const scopes = new Map<string, ModelEntry[]>([
  ["all", models],
  ...CATEGORIES.map((c): [string, ModelEntry[]] => [cardScope(c), models.filter((m) => m.category === c)]),
]);

/**
 * The gallery's card pages: `<n>.json` holds CARD_PAGE cards and is fetched one "Load more" at a time;
 * `full.json` holds the whole scope and is fetched only when a search, sort or filter needs it.
 */
export function generateStaticParams() {
  return [...scopes].flatMap(([scope, list]) => [
    { scope, file: "full.json" },
    ...Array.from({ length: Math.ceil(list.length / CARD_PAGE) }, (_, i) => ({ scope, file: `${i + 1}.json` })),
  ]);
}

export async function GET(_req: Request, { params }: { params: Promise<{ scope: string; file: string }> }) {
  const { scope, file } = await params;
  const list = scopes.get(scope);
  const page = Number(file.replace(/\.json$/, ""));
  if (!list || (file !== "full.json" && !(page >= 1))) return new Response("Not found", { status: 404 });
  const cards = file === "full.json" ? list : list.slice((page - 1) * CARD_PAGE, page * CARD_PAGE);
  return new Response(cardsJson(cards), { headers: { "Content-Type": "application/json" } });
}
