export const CLAUDE_CODE_MODELS = [
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'opus',
  'sonnet',
  'haiku',
] as const

export type KnownClaudeCodeModel = (typeof CLAUDE_CODE_MODELS)[number]

/** Any Claude model id accepted by Claude Code; known ids get autocomplete. */
export type ClaudeCodeModel = KnownClaudeCodeModel | (string & {})
