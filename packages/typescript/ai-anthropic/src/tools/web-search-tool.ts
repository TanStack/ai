import { CacheControl } from "../text/text-provider-options";

export interface WebSearchTool {
  name: "web_search";
  type: "web_search_20250305";
  /**
   * If provided, only these domains will be included in results. Cannot be used alongside blocked_domains.
   */
  allowed_domains?: string[] | null;
  /**
   * If provided, these domains will be excluded from results. Cannot be used alongside allowed_domains.
   */
  blocked_domains?: string[] | null;
  cache_control?: CacheControl | null
  /**
   * Maximum number of times the tool can be used in the API request.
   */
  max_uses?: number | null;
  /**
   * Parameters for the user's location. Used to provide more relevant search results.
   */
  user_location?: {
    type: "approximate",
    /**
     * The city where the user is located. Between 1-255 characters.
     */
    city?: string | null;
    /**
     * The two letter ISO country code of the user.
     * Length of 2 characters.
     */
    country?: string | null;
    /**
     * The region (state, province, etc) where the user is located.
     * Length between 1-255 characters.
     */
    region?: string | null;
    /**
     * The timezone of the user, in IANA format (e.g. "America/Los_Angeles").
     * Length between 1-255 characters.
     */
    timezone?: string | null;
  } | null;
}

export const validateDomains = (tool: WebSearchTool) => {
  if (tool.allowed_domains && tool.blocked_domains) {
    throw new Error("allowed_domains and blocked_domains cannot be used together.");
  }
}

export const validateUserLocation = (userLocation: WebSearchTool["user_location"]) => {
  if (userLocation) {
    if (userLocation.city && (userLocation.city.length < 1 || userLocation.city.length > 255)) {
      throw new Error("user_location.city must be between 1 and 255 characters.");
    }
    if (userLocation.country && userLocation.country.length !== 2) {
      throw new Error("user_location.country must be exactly 2 characters.");
    }
    if (userLocation.region && (userLocation.region.length < 1 || userLocation.region.length > 255)) {
      throw new Error("user_location.region must be between 1 and 255 characters.");
    }
    if (userLocation.timezone && (userLocation.timezone.length < 1 || userLocation.timezone.length > 255)) {
      throw new Error("user_location.timezone must be between 1 and 255 characters.");
    }
  }
}