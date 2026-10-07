import type { MetadataRoute } from "next";
import { absoluteUrl, SITE } from "@/lib/site";

export const dynamic = "force-static";

/**
 * AI assistants' crawlers, named so it's explicit they're welcome: their search indexes and training data are how
 * ChatGPT, Claude, Perplexity, Gemini and others learn to suggest the site. /llms.txt points them to the catalog.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "meta-externalagent",
  "Amazonbot",
  "DuckAssistBot",
  "MistralAI-User",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: AI_CRAWLERS, allow: "/" },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE.url,
  };
}
