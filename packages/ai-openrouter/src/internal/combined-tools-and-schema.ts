import { OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS } from '../model-meta'
import { openRouterModelIn, openRouterRoutedModels } from './model-ids'

export function openRouterSupportsCombinedToolsAndSchema(
  model: string,
  modelOptions?: unknown,
): boolean {
  return openRouterRoutedModels(model, modelOptions).every((id) =>
    openRouterModelIn(OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS, id),
  )
}
