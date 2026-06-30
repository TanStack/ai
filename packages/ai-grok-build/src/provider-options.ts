/**
 * Per-call provider options for the Grok Build adapter, passed via
 * `modelOptions` on `chat()`.
 */
import type { AcpPermissionMode, AcpTransportPreference } from '@tanstack/ai-acp'

export type GrokBuildProtocol = 'acp' | 'streaming-json'

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
  /**
   * Harness wire protocol. Defaults to `'acp'`. Use `'streaming-json'` for the
   * legacy headless NDJSON path.
   */
  protocol?: GrokBuildProtocol
  /** ACP transport when `protocol` is `'acp'`. Defaults to `'auto'`. */
  transport?: AcpTransportPreference
  /**
   * ACP auth method (`xai.api_key` | `grok.com`). Omitted → auto from env keys.
   */
  authMethodId?: string
  /** ACP permission policy for tool approvals. Defaults to `'bypassPermissions'`. */
  permissionMode?: AcpPermissionMode
  /** Port for in-sandbox `grok agent serve` when using WebSocket transport. */
  acpPort?: number
}
