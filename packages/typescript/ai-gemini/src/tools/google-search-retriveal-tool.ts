import { GoogleSearchRetrieval } from "@google/genai";
import type { Tool } from "@tanstack/ai";

export type GoogleSearchRetrievalTool = GoogleSearchRetrieval


export function convertGoogleSearchRetrievalToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as GoogleSearchRetrievalTool;
  return {
    googleSearchRetrieval: metadata.dynamicRetrievalConfig ? { dynamicRetrievalConfig: metadata.dynamicRetrievalConfig } : {}
  };
}

export function googleSearchRetrievalTool(config?: GoogleSearchRetrievalTool): Tool {
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