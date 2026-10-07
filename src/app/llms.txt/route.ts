import { llmsTxt } from "@/lib/ai-catalog";

export const dynamic = "force-static";

/** Overview for AI assistants and agents (https://llmstxt.org): what the site has, licenses, how to load the files. */
export function GET() {
  return new Response(llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
