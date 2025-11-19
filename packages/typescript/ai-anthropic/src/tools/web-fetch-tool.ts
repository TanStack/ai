import type { CacheControl } from "../text/text-provider-options";
import type { Tool } from "@tanstack/ai";

export interface WebFetchTool {
  name: "web_fetch";
  type: "web_fetch_20250910";
  /**
 * If provided, only these domains will be included in results. Cannot be used alongside blocked_domains.
 */
  allowed_domains?: string[] | null;
  /**
   * If provided, these domains will be excluded from results. Cannot be used alongside allowed_domains.
   */
  blocked_domains?: string[] | null;
  /**
 * Maximum number of times the tool can be used in the API request.
 */
  max_uses?: number | null;
  /**
   * Citations configuration for fetched documents. Citations are disabled by default.
   */
  citations?: {
    enabled?: boolean
  } | null;
  /**
   * Maximum number of tokens used by including web page text content in the context. The limit is approximate and does not apply to binary content such as PDFs.

Required range: x > 0
   */
  max_content_tokens?: number | null;

  cache_control?: CacheControl | null
}

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