/**
 * Models known to work with Claude Code. The harness accepts any Anthropic
 * model id (and the `opus` / `sonnet` / `haiku` aliases resolved by the CLI),
 * so this list exists for autocomplete — any string is accepted via the
 * `(string & {})` escape hatch in {@link ClaudeCodeModel}.
 */
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
