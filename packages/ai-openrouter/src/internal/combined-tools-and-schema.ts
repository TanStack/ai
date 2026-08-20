import { OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS } from '../combined-tools-and-schema-models'

type OpenRouterCombinedModelOptions = {
  models?: ReadonlyArray<string> | undefined
}

function stripOpenRouterModelVariant(model: string): string {
  const variantIndex = model.indexOf(':')
  return variantIndex === -1 ? model : model.slice(0, variantIndex)
}

export function openRouterSupportsCombinedToolsAndSchema(
  model: string,
  modelOptions?: OpenRouterCombinedModelOptions | undefined,
): boolean {
  const candidates = [model, ...(modelOptions?.models ?? [])].map(
    stripOpenRouterModelVariant,
  )

  return candidates.every((candidate) =>
    OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS.has(candidate),
  )
}
