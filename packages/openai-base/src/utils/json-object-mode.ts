import type { StructuredOutputMode } from '@tanstack/ai'

/** Fields the JSON-mode decision reads. Wider than `TextOptions<T>` so both call sites pass. */
export type JsonObjectModeInput = {
  model: string
  structuredOutputMode?: StructuredOutputMode
  modelOptions?: unknown
}

/**
 * True when a schema-bearing call must send JSON mode (`json_object`)
 * instead of strict `json_schema`.
 *
 * `explicit` is a caller wire override (`response_format` or `text.format`).
 * `auto` is the adapter's catalog answer for `structuredOutputMode: 'auto'`.
 */
export function requestUsesJsonObject(input: {
  mode: StructuredOutputMode | undefined
  explicit: boolean
  auto: boolean
}): boolean {
  if (input.explicit || input.mode === 'json_object') return true
  if (input.mode === 'auto') return input.auto
  return false
}

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
