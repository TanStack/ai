/**
 * A single entry in `chat({ systemPrompts: [...] })`.
 *
 * Accepts a plain string (the common case) or a structured object that lets
 * providers attach typed metadata to the prompt — e.g. Anthropic
 * `cache_control` for prompt caching, future per-prompt safety overrides for
 * Gemini, etc.
 *
 * At the chat call site, `metadata` is narrowed by the adapter via
 * `~types['systemPromptMetadata']`. Providers that don't declare one inherit
 * the default `never`, which makes the field carry no meaningful value: TS
 * only accepts `undefined` there, and provider-foreign metadata that reaches
 * an adapter via JS / `as any` is silently dropped, never written to the
 * wire. For type-safe per-provider metadata, refer to the provider's
 * `<Provider>SystemPromptMetadata` interface (e.g. `AnthropicSystemPromptMetadata`).
 *
 * @example
 *   // The 90% case — plain strings work everywhere.
 *   systemPrompts: ['Be concise.', 'Cite sources.']
 *
 * @example
 *   // Provider-specific metadata via the object form. No `satisfies` cast
 *   // is needed — the adapter narrows the `metadata` field's type at the
 *   // call site so users get autocomplete and structural checking
 *   // automatically.
 *   import { anthropicText } from '@tanstack/ai-anthropic'
 *
 *   chat({
 *     adapter: anthropicText(),
 *     systemPrompts: [
 *       {
 *         content: 'Stable instructions — cache me.',
 *         metadata: { cache_control: { type: 'ephemeral' } },
 *       },
 *       'Volatile per-request instruction.',
 *     ],
 *   })
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
 *
 * Throws a `TypeError` (naming the offending index) if an object-form entry's
 * `content` isn't a string. Public API boundary — callers reaching this
 * function through `as any` / external JS would otherwise stream a literal
 * `"undefined"` into the model's system prompt with no signal.
 */
export function normalizeSystemPrompts<TMetadata = unknown>(
  // Accept the wide public shape (`SystemPrompt<unknown>`) regardless of the
  // caller's `TMetadata`. Adapters know their own metadata shape; the
  // generic narrows the *output* so adapter code can read `p.metadata.X`
  // without an additional cast.
  prompts: ReadonlyArray<SystemPrompt> | undefined,
): Array<NormalizedSystemPrompt<TMetadata>> {
  if (!prompts || prompts.length === 0) return []
  return prompts.map((p, i) => {
    if (typeof p === 'string') return { content: p }
    // Defence in depth: TypeScript narrows `p` to the object arm here, but
    // this function is a public API boundary that callers can reach via
    // plain JS or `as any`. Re-validate at runtime so we never stream a
    // literal `"undefined"` into the model.
    const candidate = p as unknown
    if (candidate === null || typeof candidate !== 'object') {
      throw new TypeError(
        `systemPrompts[${i}]: expected a string or { content, metadata? }, got ${candidate === null ? 'null' : typeof candidate}`,
      )
    }
    const { content } = candidate as { content?: unknown }
    if (typeof content !== 'string') {
      throw new TypeError(
        `systemPrompts[${i}]: content must be a string, got ${typeof content}`,
      )
    }
    return p as NormalizedSystemPrompt<TMetadata>
  })
}
