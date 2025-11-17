export const validateMaxNumResults = (maxNumResults: number | undefined) => {
  if (maxNumResults && (maxNumResults < 1 || maxNumResults > 50)) {
    throw new Error("max_num_results must be between 1 and 50.");
  }
};

interface FileSearchFilter {
  key: string;
  type: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "in" | "nin";
  value: string | number | boolean | Array<string | number | boolean>;
}
/**
 * File Search Tool by OpenAI
 */
export interface FileSearchTool {
  type: "file_search";
  /**
   * The IDs of the vector stores to search.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-file_search-vector_store_ids
   */
  vector_store_ids: string[];
  /**
   * The maximum number of results to return. This number should be between 1 and 50
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-file_search-max_num_results
   */
  max_num_results?: number;
  /**
   * Ranking options for search.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-file_search-ranking_options
   */
  ranking_options?: {
    /**
     * Weights that control how reciprocal rank fusion balances semantic embedding matches versus sparse keyword matches when hybrid search is enabled.
     * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-file_search-ranking_options-hybrid_search
     */
    hybrid_search?: {
      /**
       * The weight of the embedding in the reciprocal ranking fusion.
       * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-file_search-ranking_options-hybrid_search-embedding_weight
       */
      embedding_weight: number;
      /**
       * The weight of the text in the reciprocal ranking fusion.
       * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-file_search-ranking_options-hybrid_search-text_weight
       */
      text_weight: number;
    };
    /**
     * The ranker to use for the file search.
     * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-file_search-ranking_options-ranker
     */
    ranker?: string;
    /**
     * The score threshold for the file search, a number between 0 and 1. Numbers closer to 1 will attempt to return only the most relevant results, but may return fewer results.
     * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-file_search-ranking_options-score_threshold
     */
    score_threshold?: number;
  },
  /**
   * A filter to apply.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-file_search-filters
   */
  filters?: FileSearchFilter | FileSearchFilter[];

}