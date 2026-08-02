/**
 * Models known to work with Codex. The harness accepts any OpenAI model id
 * its backend supports, so this list exists for autocomplete — any string is
 * accepted via the `(string & {})` escape hatch in {@link CodexModel}.
 */
export const CODEX_MODELS = [
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5.1',
] as const

export type KnownCodexModel = (typeof CODEX_MODELS)[number]

/** Any model id accepted by Codex; known ids get autocomplete. */
export type CodexModel = KnownCodexModel | (string & {})
