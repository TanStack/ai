type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

export interface ClaudeCodeTextProviderOptions {
  sessionId?: string
  forkSession?: boolean
  /** Per-call override of the configured max harness turns. */
  maxTurns?: number
  /** Per-call override of the configured permission mode. */
  permissionMode?: PermissionMode
  /** Per-call override of the allowed built-in tool list. */
  allowedTools?: Array<string>
  /** Per-call override of the disallowed built-in tool list. */
  disallowedTools?: Array<string>
  /** Per-call override of the harness working directory. */
  cwd?: string
  authMode?: 'host' | 'api-key'
}
