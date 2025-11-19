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

export const fileSearchTool = (config: FileSearchTool) => {
  return {
    "fileSearch": config
  }
}