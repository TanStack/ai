import type { OpencodePermissionMode } from './process/permissions'

export interface OpencodeTextProviderOptions {
  sessionId?: string
  /** Per-call override of the configured permission mode. */
  permissionMode?: OpencodePermissionMode
  /** Per-call override of the harness working directory. */
  directory?: string
}
