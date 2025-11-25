import type {
  AIAdapter,
  SummarizationOptions,
  SummarizationResult,
  ExtractModelsFromAdapter,
} from "../types";

/**
 * Standalone summarize function with type inference from adapter
 */
export async function summarize<
  TAdapter extends AIAdapter<any, any, any, any, any>
>(
  options: Omit<SummarizationOptions, "model"> & {
    adapter: TAdapter;
    model: ExtractModelsFromAdapter<TAdapter>;
    text: string;
  }
): Promise<SummarizationResult> {
  const { adapter, model, ...restOptions } = options;

  return adapter.summarize({
    ...restOptions,
    model: model as string,
  });
}
