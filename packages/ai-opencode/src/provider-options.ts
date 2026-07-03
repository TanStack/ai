import type { OpencodePermissionMode } from './process/permissions'

/**
 * Per-call provider options for the OpenCode adapter, passed via
 * `modelOptions` on `chat()`.
 */
export interface OpencodeTextProviderOptions {
  /**
   * Resume an existing OpenCode session. The adapter emits the session id of
   * every fresh run via a CUSTOM `opencode.session-id` stream event; thread
   * it back here to continue that session (only the latest user message is
   * sent — the harness already holds the prior context).
   */
  sessionId?: string
  /** Per-call override of the configured permission mode. */
  permissionMode?: OpencodePermissionMode
  /** Per-call override of the harness working directory. */
  directory?: string
}
