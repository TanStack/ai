import { jsonModeSystemPrompt } from '@tanstack/ai-utils'
import type { TextOptions } from '@tanstack/ai'

/** Caller set JSON mode on a Chat Completions or Responses body. */
export function explicitJsonObject(modelOptions: unknown): boolean {
  if (modelOptions == null || typeof modelOptions !== 'object') return false
  if ('response_format' in modelOptions) {
    const format = (modelOptions as { response_format?: { type?: unknown } })
      .response_format
    if (format?.type === 'json_object') return true
  }
  if ('text' in modelOptions) {
    const text = (modelOptions as { text?: { format?: { type?: unknown } } })
      .text
    if (text?.format?.type === 'json_object') return true
  }
  return false
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
