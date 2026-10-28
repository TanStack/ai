/**
 * Resolve a VIRTUAL sandbox cwd (e.g. `/workspace`) to the path a harness CLI
 * or ACP session must use on the real filesystem.
 *
 * Provider handles map virtual paths for spawn/exec/fs; harness-facing APIs
 * interpret cwd literally (`grok --cwd`, ACP `newSession`, opencode HTTP
 * `directory`, …).
 */
import * as path from 'node:path'
import { DEFAULT_WORKSPACE_ROOT } from './bootstrap'
import type { SandboxHandle } from './contracts'

function mapVirtualWorkspacePath(virtualCwd: string, realRoot: string): string {
  if (virtualCwd === DEFAULT_WORKSPACE_ROOT) return realRoot
  if (virtualCwd.startsWith(`${DEFAULT_WORKSPACE_ROOT}/`)) {
    const rel = virtualCwd.slice(DEFAULT_WORKSPACE_ROOT.length + 1)
    return realRoot === DEFAULT_WORKSPACE_ROOT
      ? `${DEFAULT_WORKSPACE_ROOT}/${rel}`
      : path.posix.join(realRoot, rel)
  }
  return virtualCwd
}

export function resolveHarnessCwd(
  handle: SandboxHandle,
  virtualCwd: string = DEFAULT_WORKSPACE_ROOT,
): string {
  if (handle.provider === 'local-process') {
    return mapVirtualWorkspacePath(virtualCwd, handle.id)
  }

  const root = handle.workspaceRoot
  if (root !== undefined && root !== DEFAULT_WORKSPACE_ROOT) {
    return mapVirtualWorkspacePath(virtualCwd, root)
  }

  return virtualCwd
}
