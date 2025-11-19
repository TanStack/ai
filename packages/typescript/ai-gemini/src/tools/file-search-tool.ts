import type { Tool } from "@tanstack/ai";

export interface FileSearchTool {
  /**
   * The names of the fileSearchStores to retrieve from. Example: fileSearchStores/my-file-search-store-123
   */
  fileSearchStoreNames: string[];
  /**
   *  Metadata filter to apply to the semantic retrieval documents and chunks.
   */
  metadataFilter?: string;
  /**
   *  The number of semantic retrieval chunks to retrieve.
   */
  topK?: number;
}

export function convertFileSearchToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as { fileSearchStoreNames: string[]; metadataFilter?: string; topK?: number };
  return {
    fileSearch: {
      fileSearchStoreNames: metadata.fileSearchStoreNames,
      metadataFilter: metadata.metadataFilter,
      topK: metadata.topK
    }
  };
}

export function fileSearchTool(config: { fileSearchStoreNames: string[]; metadataFilter?: string; topK?: number }): Tool {
  return {
    type: "function",
    function: {
      name: "file_search",
      description: "",
      parameters: {}
    },
    metadata: {
      fileSearchStoreNames: config.fileSearchStoreNames,
      metadataFilter: config.metadataFilter,
      topK: config.topK
    }
  }
}