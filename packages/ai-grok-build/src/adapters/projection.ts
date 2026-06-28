/**
 * Grok Build workspace projector.
 *
 * Minimal implementation: touch the marker so repeated projections are skipped.
 * MCP/tool bridging is handled per-run by the adapter (fresh bearer each time).
 */
import type { SandboxHandle, WorkspaceProjection } from '@tanstack/ai-sandbox'

/**
 * Idempotently mark the workspace as projected.
 */
export async function projectGrokWorkspace(
  sandbox: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const proj = projection as { root?: string; markerPath?: string }
  const root = proj.root || '/workspace'
  const marker = proj.markerPath || `${root}/.tanstack-grok-projection`

  try {
    const exists = await sandbox.fs.exists(marker)
    if (exists) return
  } catch {
    // advisory
  }

  try {
    await sandbox.fs.write(marker, String(Date.now()))
  } catch {
    // ignore
  }
}
