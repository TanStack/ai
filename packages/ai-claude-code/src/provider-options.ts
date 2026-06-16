type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

/**
 * Per-call provider options for the Claude Code adapter, passed via
 * `modelOptions` on `chat()`.
 */
export interface ClaudeCodeTextProviderOptions {
  /**
   * Resume an existing Claude Code session. The adapter emits the session id
   * of every run via a CUSTOM `claude-code.session-id` stream event; thread
   * it back here to continue that session (only the latest user message is
   * sent — the harness already holds the prior context).
   */
  sessionId?: string
  /**
   * When resuming, fork to a new session id instead of continuing the
   * original session.
   */
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
}
