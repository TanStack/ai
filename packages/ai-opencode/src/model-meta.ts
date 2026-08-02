/**
 * Models known to work with OpenCode. OpenCode is provider-agnostic — it
 * resolves any `provider/model` id its configured providers support (via the
 * Vercel AI SDK + Models.dev), so this list exists for autocomplete. Any
 * string is accepted via the `(string & {})` escape hatch in
 * {@link OpencodeModel}.
 *
 * Models are addressed as `provider_id/model_id` (e.g.
 * `anthropic/claude-sonnet-4-5`); the adapter splits on the first `/`.
 */
export const OPENCODE_MODELS = [
  'anthropic/claude-opus-4-5',
  'anthropic/claude-sonnet-4-5',
  'openai/gpt-5.2',
  'openai/gpt-5.1-codex',
  'google/gemini-3-pro-preview',
  'opencode/claude-sonnet-4-5',
  'opencode/gpt-5.1-codex',
] as const

export type KnownOpencodeModel = (typeof OPENCODE_MODELS)[number]

/** Any `provider/model` id accepted by OpenCode; known ids get autocomplete. */
export type OpencodeModel = KnownOpencodeModel | (string & {})
