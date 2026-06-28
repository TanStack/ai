/**
 * Per-call provider options for the Grok Build adapter, passed via
 * `modelOptions` on `chat()`.
 */
export interface GrokBuildTextProviderOptions {
  /**
   * Resume an existing Grok Build session. The adapter emits the session id
   * of every run via a CUSTOM `grok-build.session-id` stream event; thread
   * it back here to continue that session (only the latest user message is
   * sent — the harness already holds the prior context).
   */
  sessionId?: string
  /** Per-call override of the harness working directory. */
  cwd?: string
  /** Per-call override of the max harness turns. */
  maxTurns?: number
}
