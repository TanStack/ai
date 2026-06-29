/**
 * Grok Build workspace projector.
 *
 * Grok reads MCP servers from `<cwd>/.grok/config.toml` (project scope), not a
 * `--mcp-config` file like Claude Code. The host tool-bridge is written there
 * on every run so the bearer token stays fresh.
 */
import type {
  HostToolBridge,
  SandboxHandle,
  WorkspaceProjection,
} from '@tanstack/ai-sandbox'

/** Escape a string for use as a double-quoted TOML basic string. */
function tomlString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

/** Render a streamable-HTTP MCP server entry for `.grok/config.toml`. */
export function renderGrokMcpToml(bridge: HostToolBridge): string {
  return `[mcp_servers.${bridge.name}]
url = ${tomlString(bridge.url)}
enabled = true

[mcp_servers.${bridge.name}.headers]
Authorization = ${tomlString(`Bearer ${bridge.token}`)}
`
}

/**
 * Write the host tool-bridge into `<cwd>/.grok/config.toml` for the next
 * headless `grok` invocation. Re-written every run so rotated bearer tokens
 * apply immediately.
 */
export async function projectGrokMcpBridge(
  sandbox: SandboxHandle,
  cwd: string,
  bridge: HostToolBridge,
): Promise<void> {
  const grokDir = `${cwd}/.grok`
  await sandbox.fs.mkdir(grokDir)
  await sandbox.fs.write(`${grokDir}/config.toml`, renderGrokMcpToml(bridge))
}

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
