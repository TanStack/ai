import type { CacheControl } from "../text/text-provider-options";

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