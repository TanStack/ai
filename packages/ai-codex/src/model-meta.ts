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
