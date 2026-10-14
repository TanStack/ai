import type { StructuredOutputMode } from '@tanstack/ai'
import { OPENROUTER_JSON_OBJECT_ONLY_MODELS } from '../model-meta'

function stripOpenRouterModelVariant(model: string): string {
  const variantIndex = model.indexOf(':')
  return variantIndex === -1 ? model : model.slice(0, variantIndex)
}

/** Caller format type and `modelOptions.models` fallbacks, when present. */
export function openRouterFormatRequest(modelOptions: unknown): {
  requestedType: string | undefined
  fallbackModels: ReadonlyArray<string> | undefined
} {
  if (modelOptions == null || typeof modelOptions !== 'object') {
    return { requestedType: undefined, fallbackModels: undefined }
  }
  const record = modelOptions as {
    responseFormat?: { type?: unknown }
    text?: { format?: { type?: unknown } }
    models?: unknown
  }
  const responseType = record.responseFormat?.type
  const textType = record.text?.format?.type
  const requestedType =
    typeof responseType === 'string'
      ? responseType
      : typeof textType === 'string'
        ? textType
        : undefined
  const fallbackModels = Array.isArray(record.models)
    ? record.models.filter((id): id is string => typeof id === 'string')
    : undefined
  return { requestedType, fallbackModels }
}

/**
 * True when this OpenRouter request must send `response_format: json_object`.
 * `auto` is true when any routed model is in the catalog set that has
 * `response_format` and not `structured_outputs`.
 */
export function openRouterUsesJsonObject(input: {
  mode: StructuredOutputMode | undefined
  requestedType: string | undefined
  model: string
  fallbackModels?: ReadonlyArray<string> | undefined
}): boolean {
  if (input.mode === 'json_object' || input.requestedType === 'json_object') {
    return true
  }
  if (input.mode !== 'auto') return false
  const candidates = [input.model, ...(input.fallbackModels ?? [])].map(
    stripOpenRouterModelVariant,
  )
  return candidates.some((id) => OPENROUTER_JSON_OBJECT_ONLY_MODELS.has(id))
}
