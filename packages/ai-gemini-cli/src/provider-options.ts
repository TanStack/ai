import type { AcpPermissionMode as GeminiCliPermissionMode } from '@tanstack/ai-acp'

/**
 * Per-call provider options for the Gemini CLI adapter, passed via
 * `modelOptions` on `chat()`.
 */
export interface GeminiCliTextProviderOptions {
  /**
   * Resume an existing Gemini CLI session. The adapter emits the session id
   * of every run via a CUSTOM `gemini-cli.session-id` stream event; thread
   * it back here to continue that session (only the latest user message is
   * sent — the harness already holds the prior context). If the installed
   * CLI doesn't support session loading, the adapter falls back to a fresh
   * session seeded with the flattened transcript.
   */
  sessionId?: string
  /** Per-call override of the configured permission mode. */
  permissionMode?: GeminiCliPermissionMode
  /** Per-call override of the harness working directory. */
  cwd?: string
  /** Per-call override of the configured ACP auth method id. */
  authMethodId?: string
}
