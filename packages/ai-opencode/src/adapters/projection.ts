import { isSecretRef, resolveGitSkillDir } from '@tanstack/ai-sandbox'
import type {
  BearerRef,
  SandboxHandle,
  SecretRef,
  WorkspaceProjection,
  WorkspaceSkill,
} from '@tanstack/ai-sandbox'

/** True when `value` is a `bearer(ref)` marker created by `@tanstack/ai-sandbox`. */
function isBearerMarker(value: unknown): value is BearerRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    isSecretRef((value as { __bearerRef?: unknown }).__bearerRef)
  )
}

function resolveHeaderValue(
  value: string | SecretRef | BearerRef,
  resolveSecret: (ref: SecretRef) => string,
): string {
  if (isSecretRef(value)) return resolveSecret(value)
  if (isBearerMarker(value)) return `Bearer ${resolveSecret(value.__bearerRef)}`
  return value
}

/** An OpenCode `remote`-type MCP server entry (mirrors OPENCODE_CONFIG_CONTENT shape). */
interface OpencodeMcpServer {
  type: 'remote'
  url: string
  enabled: boolean
  headers: Record<string, string>
}

function buildMcpSection(
  skills: Array<WorkspaceSkill>,
  resolveSecret: (ref: SecretRef) => string,
): Record<string, OpencodeMcpServer> | undefined {
  const mcp: Record<string, OpencodeMcpServer> = {}
  let count = 0
  for (const skill of skills) {
    if (skill.kind !== 'mcp') continue
    count += 1
    const headers: Record<string, string> = {}
    const rawHeaders = skill.config.headers ?? {}
    const headerEntries = Object.entries(rawHeaders)
    for (const [name, value] of headerEntries) {
      headers[name] = resolveHeaderValue(value, resolveSecret)
    }
    const rawUrl = skill.config['url']
    const url = typeof rawUrl === 'string' ? rawUrl : ''
    mcp[skill.name] = { type: 'remote', url, enabled: true, headers }
  }
  return count > 0 ? mcp : undefined
}

async function projectMcpServers(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const mcpSection = buildMcpSection(
    projection.skills,
    projection.resolveSecret,
  )
  if (mcpSection === undefined) return

  const target = `${projection.root}/opencode.json`

  // Read the existing file if present so we can preserve non-mcp settings.
  let existing: Record<string, unknown> = {}
  if (await handle.fs.exists(target)) {
    try {
      const raw = await handle.fs.read(target)
      const parsed: unknown = JSON.parse(raw)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        existing = parsed as Record<string, unknown>
      }
    } catch {
      // Unreadable or invalid JSON — start fresh so the MCP config lands cleanly.
    }
  }

  const merged = { ...existing, mcp: mcpSection }
  await handle.fs.write(target, JSON.stringify(merged, null, 2))
}

function projectGitSkills(projection: WorkspaceProjection): void {
  for (const skill of projection.skills) {
    if (skill.kind !== 'git') continue
    const dir = skill.into ?? resolveGitSkillDir(projection.root, skill)
    console.warn(
      `[opencode] gitSkill "${skill.repo}" cloned to ${dir} but OpenCode has no ` +
        'recognised skills directory to link it into. The skill is available at that ' +
        'path — add an AGENTS.md reference to it manually if needed. Skipping.',
    )
  }
}

function projectAgentSkills(projection: WorkspaceProjection): void {
  for (const skill of projection.skills) {
    if (skill.kind !== 'agent-skill') continue
    console.warn(
      `[opencode] agentSkill "${skill.name}" cannot be projected: OpenCode has no ` +
        'command to install a public skill by bare name. Provide it as a gitSkill ' +
        'instead. Skipping.',
    )
  }
}

function projectPlugins(projection: WorkspaceProjection): void {
  for (const name of projection.plugins) {
    console.warn(
      `[opencode] plugin "${name}" cannot be installed: OpenCode has no plugin ` +
        'install command. Skipping.',
    )
  }
}

export async function projectOpencodeWorkspace(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  // Always re-resolve and rewrite the secret-bearing MCP config so rotated
  // secrets re-apply and snapshots can't serve stale values.
  await projectMcpServers(handle, projection)

  // Gate only the safe, idempotent, non-secret operations on the marker.
  if (await handle.fs.exists(projection.markerPath)) return

  projectGitSkills(projection)
  projectAgentSkills(projection)
  projectPlugins(projection)

  await handle.fs.write(projection.markerPath, '')
}
