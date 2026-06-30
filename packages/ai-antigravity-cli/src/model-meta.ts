/**
 * Models known to work with Antigravity CLI. The harness accepts any Gemini model
 * id (and the `auto` / `pro` / `flash` aliases resolved by the CLI), so this
 * list exists for autocomplete — any string is accepted via the
 * `(string & {})` escape hatch in {@link AntigravityCliModel}.
 */
export const ANTIGRAVITY_CLI_MODELS = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'auto',
  'pro',
  'flash',
] as const

export type KnownAntigravityCliModel = (typeof ANTIGRAVITY_CLI_MODELS)[number]

/** Any model id accepted by Antigravity CLI; known ids get autocomplete. */
export type AntigravityCliModel = KnownAntigravityCliModel | (string & {})
