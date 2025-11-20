import { BetaWebFetchTool20250910 } from "@anthropic-ai/sdk/resources/beta";
import type { CacheControl } from "../text/text-provider-options";
import type { Tool } from "@tanstack/ai";

export type WebFetchTool = BetaWebFetchTool20250910


export function convertWebFetchToolToAdapterFormat(tool: Tool): WebFetchTool {
  const metadata = tool.metadata as { allowedDomains?: string[] | null; blockedDomains?: string[] | null; maxUses?: number | null; citations?: { enabled?: boolean } | null; maxContentTokens?: number | null; cacheControl?: CacheControl | null };
  return {
    name: "web_fetch",
    type: "web_fetch_20250910",
    allowed_domains: metadata.allowedDomains,
    blocked_domains: metadata.blockedDomains,
    max_uses: metadata.maxUses,
    citations: metadata.citations,
    max_content_tokens: metadata.maxContentTokens,
    cache_control: metadata.cacheControl || null,
  };
}

export function webFetchTool(config?: { allowedDomains?: string[] | null; blockedDomains?: string[] | null; maxUses?: number | null; citations?: { enabled?: boolean } | null; maxContentTokens?: number | null; cacheControl?: CacheControl | null }): Tool {
  return {
    type: "function",
    function: {
      name: "web_fetch",
      description: "",
      parameters: {}
    },
    metadata: {
      allowedDomains: config?.allowedDomains,
      blockedDomains: config?.blockedDomains,
      maxUses: config?.maxUses,
      citations: config?.citations,
      maxContentTokens: config?.maxContentTokens,
      cacheControl: config?.cacheControl
    }
  }
}