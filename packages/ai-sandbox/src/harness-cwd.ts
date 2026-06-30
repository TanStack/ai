/**
 * Resolve a VIRTUAL sandbox cwd (e.g. `/workspace`) to the path a harness CLI
 * or ACP session must use on the real filesystem.
 *
 * Provider handles already map virtual paths for spawn/exec/fs; harness-facing
 * APIs interpret cwd literally (`grok --cwd`, ACP `newSession`, opencode HTTP
 * `directory`, …). On local-process `/workspace` is virtual — the real root is
 * the host temp dir (`handle.id`).
 */
import * as path from 'node:path'
import { DEFAULT_WORKSPACE_ROOT } from './bootstrap'
import type { SandboxHandle } from './contracts'

export function resolveHarnessCwd(
  handle: SandboxHandle,
  virtualCwd: string = DEFAULT_WORKSPACE_ROOT,
): string {
  if (handle.provider !== 'local-process') return virtualCwd

  if (virtualCwd === DEFAULT_WORKSPACE_ROOT) return handle.id
  if (virtualCwd.startsWith(`${DEFAULT_WORKSPACE_ROOT}/`)) {
    const rel = virtualCwd.slice(DEFAULT_WORKSPACE_ROOT.length + 1)
    return path.join(handle.id, rel)
  }
  return virtualCwd
}