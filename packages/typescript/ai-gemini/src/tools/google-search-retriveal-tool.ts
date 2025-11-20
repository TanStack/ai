import type { Tool } from "@tanstack/ai";

export interface GoogleSearchRetrievalTool {
  dynamicRetrievalConfig?: {
    /**
     * The mode of the predictor to be used in dynamic retrieval.
     */
    mode: "MODE_UNSPECIFIED" | "MODE_DYNAMIC";
    /**
     * The threshold to be used in dynamic retrieval. If not set, a system default value is used.
     */
    dynamicThreshold?: number;
  }
}

export function convertGoogleSearchRetrievalToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as { dynamicRetrievalConfig?: { mode: "MODE_UNSPECIFIED" | "MODE_DYNAMIC"; dynamicThreshold?: number } };
  return {
    googleSearchRetrieval: metadata.dynamicRetrievalConfig ? { dynamicRetrievalConfig: metadata.dynamicRetrievalConfig } : {}
  };
}

export function googleSearchRetrievalTool(config?: { dynamicRetrievalConfig?: { mode: "MODE_UNSPECIFIED" | "MODE_DYNAMIC"; dynamicThreshold?: number } }): Tool {
  return {
    type: "function",
    function: {
      name: "google_search_retrieval",
      description: "",
      parameters: {}
    },
    metadata: {
      dynamicRetrievalConfig: config?.dynamicRetrievalConfig
    }
  }
}