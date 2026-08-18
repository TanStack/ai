/**
 * Per-call provider options for the Grok Build adapter, passed via
 * `modelOptions` on `chat()`.
 */
import type {
  AcpPermissionMode,
  AcpTransportPreference,
} from '@tanstack/ai-acp'
import type { GrokBuildAuthMode } from './auth'

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
   * Harness wire protocol. Defaults to `'acp'`. A durable sandbox run
   * (durability wired, no explicit protocol) uses `'streaming-json'` so the
   * run can journal and recover.
   */
  protocol?: GrokBuildProtocol
  /** ACP transport when `protocol` is `'acp'`. Defaults to `'auto'`. */
  transport?: AcpTransportPreference
  /**
   * `'host'` skips ACP authenticate (use `grok login`).
   * `'api-key'` calls authenticate with `xai.api_key`.
   * Not inferred from the sandbox.
   */
  authMode?: GrokBuildAuthMode
  /**
   * Explicit ACP auth method. Wins over {@link authMode}.
   */
  authMethodId?: string
  /** ACP permission policy for tool approvals. Defaults to `'bypassPermissions'`. */
  permissionMode?: AcpPermissionMode
  /** Port for in-sandbox `grok agent serve` when using WebSocket transport. */
  acpPort?: number
}
