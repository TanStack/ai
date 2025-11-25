import type {
  AIAdapter,
  EmbeddingOptions,
  EmbeddingResult,
  ExtractModelsFromAdapter,
} from "../types";

/**
 * Standalone embedding function with type inference from adapter
 */
export async function embedding<
  TAdapter extends AIAdapter<any, any, any, any, any>
>(
  options: Omit<EmbeddingOptions, "model"> & {
    adapter: TAdapter;
    model: ExtractModelsFromAdapter<TAdapter>;
  }
): Promise<EmbeddingResult> {
  const { adapter, model, ...restOptions } = options;
  return adapter.createEmbeddings({
    ...restOptions,
    model: model as string,
  });
}
