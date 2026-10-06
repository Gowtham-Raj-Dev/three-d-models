// Gallery cards are served as small static JSON files, so the gallery downloads only what it shows.
// Kept free of catalog imports: the gallery (a client component) uses these helpers too.

/** Cards per gallery page — both the "Load more" step and the size of each /data/cards/<scope>/<n>.json file. */
export const CARD_PAGE = 30;

/** The folder a category's card files live in: "all" for every model, else the category as a slug. */
export function cardScope(category: string): string {
  return category === "All" ? "all" : category.toLowerCase().replace(/\s+/g, "-");
}

/** Page `page` (1-based) of a scope, in featured order. */
export function cardPageUrl(scope: string, page: number): string {
  return `/data/cards/${scope}/${page}.json`;
}

/** Every card in a scope — fetched only when a search, sort or filter needs the whole set. */
export function cardScopeUrl(scope: string): string {
  return `/data/cards/${scope}/full.json`;
}

/** Every card in one collection (collections are small: a few hundred models at most). */
export function collectionCardsUrl(key: string): string {
  return `/data/collections/${key}.json`;
}
