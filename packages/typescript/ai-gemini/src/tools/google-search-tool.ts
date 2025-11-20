import type { Tool } from "@tanstack/ai";

export interface GoogleSearchTool {
  timeRangeFilter?: {
    startTime?: string; // ISO 8601 format
    endTime?: string;   // ISO 8601 format
  }
}

export function convertGoogleSearchToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as { timeRangeFilter?: { startTime?: string; endTime?: string } };
  return {
    googleSearch: metadata.timeRangeFilter ? { timeRangeFilter: metadata.timeRangeFilter } : {}
  };
}

export function googleSearchTool(config?: { timeRangeFilter?: { startTime?: string; endTime?: string } }): Tool {
  return {
    type: "function",
    function: {
      name: "google_search",
      description: "",
      parameters: {}
    },
    metadata: {
      timeRangeFilter: config?.timeRangeFilter
    }
  }
}