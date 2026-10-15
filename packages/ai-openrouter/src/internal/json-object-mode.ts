import { jsonModeSystemPrompt } from '@tanstack/ai-utils'
import { OPENROUTER_JSON_OBJECT_ONLY_MODELS } from '../model-meta'
import { openRouterModelIn, openRouterRoutedModels } from './model-ids'
import type { TextOptions } from '@tanstack/ai'

/**
 * True when this OpenRouter call must send `json_object`. The caller set it
 * in `modelOptions` (`responseFormat` or `text.format`), or a routed model
 * (`model` with its `variant`, or `modelOptions.models`) has
 * `response_format` and not `structured_outputs` in the catalog.
 */
export function openRouterUsesJsonObject(
  model: string,
  modelOptions: unknown,
): boolean {
  const record = (modelOptions ?? {}) as {
    responseFormat?: { type?: unknown }
    text?: { format?: { type?: unknown } }
  }
  if (
    record.responseFormat?.type === 'json_object' ||
    record.text?.format?.type === 'json_object'
  ) {
    return true
  }
  return openRouterRoutedModels(model, modelOptions).some((id) =>
    openRouterModelIn(OPENROUTER_JSON_OBJECT_ONLY_MODELS, id),
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
