/**
 * A single entry in `chat({ systemPrompts: [...] })`.
 *
 * Accepts a plain string (the common case) or a structured object that lets
 * providers attach typed metadata to the prompt — e.g. Anthropic
 * `cache_control` for prompt caching, future per-prompt safety overrides for
 * Gemini, etc.
 *
 * Adapters that don't recognise a given metadata field silently ignore it, so
 * the object form is portable across providers. For type-safe per-provider
 * metadata, narrow `TMetadata` via the provider's `<Provider>SystemPromptMetadata`
 * interface (e.g. `AnthropicSystemPromptMetadata`).
 *
 * @example
 *   // The 90% case — plain strings work everywhere.
 *   systemPrompts: ['Be concise.', 'Cite sources.']
 *
 * @example
 *   // Provider-specific metadata via the object form.
 *   import type { AnthropicSystemPromptMetadata } from '@tanstack/ai-anthropic'
 *
 *   systemPrompts: [
 *     {
 *       content: 'Stable instructions — cache me.',
 *       metadata: { cache_control: { type: 'ephemeral' } } satisfies AnthropicSystemPromptMetadata,
 *     },
 *     'Volatile per-request instruction.',
 *   ]
 */
export type SystemPrompt<TMetadata = unknown> =
  | string
  | {
      content: string
      metadata?: TMetadata
    }

/**
 * Normalised shape adapters see after the chat layer turns string entries
 * into `{ content }` objects. Adapters call `normalizeSystemPrompts` once at
 * the top of their option-mapping pipeline so the rest of the code only has
 * to handle one shape.
 */
export interface NormalizedSystemPrompt<TMetadata = unknown> {
  content: string
  metadata?: TMetadata
}

/**
 * Normalise the public `systemPrompts` shape (`Array<string | { content, metadata? }>`)
 * to a homogenous `Array<{ content, metadata? }>`. Adapters use this so they
 * don't have to type-narrow string vs object inline.
 *
 * Returns an empty array (never `undefined`) so callers can chain `.map` /
 * `.join` without an extra null check.
 */
export function normalizeSystemPrompts<TMetadata = unknown>(
  // Accept the wide public shape (`SystemPrompt<unknown>`) regardless of the
  // caller's `TMetadata`. Adapters know their own metadata shape; the
  // generic narrows the *output* so adapter code can read `p.metadata.X`
  // without an additional cast.
  prompts: ReadonlyArray<SystemPrompt> | undefined,
): Array<NormalizedSystemPrompt<TMetadata>> {
  if (!prompts || prompts.length === 0) return []
  return prompts.map((p) =>
    typeof p === 'string'
      ? { content: p }
      : (p as NormalizedSystemPrompt<TMetadata>),
  )
}
