/**
 * A tool that performs web searches.
 * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-web_search
 */
export interface WebSearchTool {
  type: "web_search" | "web_search_2025_08_26"
  /**
   * A filter to apply.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-web_search-filters
   */
  filters?: {
    /**
     * A list of allowed domains to restrict the search results to.
     * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-web_search
     * @example ["example.com", "another-example.com"]
     * @default []
     */
    allowed_domains?: string[];
  },
  /**
   * High level guidance for the amount of context window space to use for the search. One of low, medium, or high. medium is the default.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-web_search-search_context_size
   * @default "medium"
   */
  search_context_size?: "low" | "medium" | "high";
  /**
   * Approximate user location
   */
  user_location?: UserLocation
}

export interface UserLocation {

  /**
   * Free text input for the city of the user, e.g. San Francisco.
   */
  city?: string;
  /**
   * Free text input for the region of the user, e.g. California.
   */
  region?: string;
  /**
   * The two-letter ISO country code of the user, e.g. US.
   */
  country?: string;
  /**
   * The IANA timezone of the user, e.g. America/Los_Angeles.
   * https://timeapi.io/documentation/iana-timezones
   */
  timezone?: string;

  // type?: "approximate"
}