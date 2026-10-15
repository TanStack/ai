import { jsonModeSystemPrompt } from '@tanstack/ai-utils'
import { OPENROUTER_JSON_OBJECT_ONLY_MODELS } from '../model-meta'
import type { TextOptions } from '@tanstack/ai'

function stripOpenRouterModelVariant(model: string): string {
  const variantIndex = model.indexOf(':')
  return variantIndex === -1 ? model : model.slice(0, variantIndex)
}

/**
 * True when this OpenRouter call must send `json_object`. The caller set it
 * in `modelOptions` (`responseFormat` or `text.format`), or a routed model
 * (`model` or `modelOptions.models`) has `response_format` and not
 * `structured_outputs` in the catalog.
 */
export function openRouterUsesJsonObject(
  model: string,
  modelOptions: unknown,
): boolean {
  const record = (modelOptions ?? {}) as {
    responseFormat?: { type?: unknown }
    text?: { format?: { type?: unknown } }
    models?: unknown
  }
  if (
    record.responseFormat?.type === 'json_object' ||
    record.text?.format?.type === 'json_object'
  ) {
    return true
  }
  const fallbacks = Array.isArray(record.models) ? record.models : []
  return [model, ...fallbacks].some(
    (id) =>
      typeof id === 'string' &&
      OPENROUTER_JSON_OBJECT_ONLY_MODELS.has(stripOpenRouterModelVariant(id)),
  )
}

/** Add the schema as a system prompt, because JSON mode does not send it. */
export function withJsonModePrompt<
  TProviderOptions extends Record<string, any>,
>(
  options: TextOptions<TProviderOptions>,
  schema: unknown,
): TextOptions<TProviderOptions> {
  return {
    ...options,
    systemPrompts: [
      ...(options.systemPrompts ?? []),
      jsonModeSystemPrompt(schema),
    ],
  }
}
