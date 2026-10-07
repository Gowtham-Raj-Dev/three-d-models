import { llmsFullTxt } from "@/lib/ai-catalog";

export const dynamic = "force-static";

/** Every model on the site in one Markdown file, so an agent can search it without crawling the model pages. */
export function GET() {
  return new Response(llmsFullTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
