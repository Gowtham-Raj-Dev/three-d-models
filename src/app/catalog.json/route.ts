import { catalogJson } from "@/lib/ai-catalog";

export const dynamic = "force-static";

/** Every model, collection, license and animation clip as JSON, for scripts and AI agents. */
export function GET() {
  return new Response(catalogJson(), { headers: { "Content-Type": "application/json" } });
}
