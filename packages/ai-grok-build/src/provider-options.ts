import type {
  AcpPermissionMode,
  AcpTransportPreference,
} from '@tanstack/ai-acp'
import type { GrokBuildAuthMode } from './auth'

export type GrokBuildProtocol = 'acp' | 'streaming-json'

export interface GrokBuildTextProviderOptions {
  sessionId?: string
  /** Per-call override of the harness working directory. */
  cwd?: string
  /** Per-call override of the max harness turns. */
  maxTurns?: number
  protocol?: GrokBuildProtocol
  /** ACP transport when `protocol` is `'acp'`. Defaults to `'auto'`. */
  transport?: AcpTransportPreference
  authMode?: GrokBuildAuthMode
  authMethodId?: string
  /** ACP permission policy for tool approvals. Defaults to `'bypassPermissions'`. */
  permissionMode?: AcpPermissionMode
  /** Port for in-sandbox `grok agent serve` when using WebSocket transport. */
  acpPort?: number
}
