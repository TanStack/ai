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

export const googleSearchRetrievalTool = (config?: GoogleSearchRetrievalTool) => {
  return {
    "googleSearchRetrieval": config || {}
  }
}