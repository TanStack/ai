import { UserLocation } from "./web-search-tool";

export interface WebSearchPreviewTool {
  type: "web_search_preview" | "web_search_preview_2025_03_11";
  /**
   * High level guidance for the amount of context window space to use for the search. 
   * @default "medium"
   */
  search_context_size?: "low" | "medium" | "high";
  user_location?: UserLocation
}