import {
  discoverSkillDirs,
  isSecretRef,
  resolveGitSkillDir,
  resolveHarnessCwd,
} from '@tanstack/ai-sandbox'
import type {
  BearerRef,
  HostToolBridge,
  SandboxHandle,
  SecretRef,
  WorkspaceProjection,
  WorkspaceSkill,
} from '@tanstack/ai-sandbox'

/** POSIX single-quote escape for embedding a value in a shell command. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

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

/** A grok-format streamable-HTTP MCP server entry with resolved headers. */
interface GrokMcpServer {
  url: string
  headers: Record<string, string>
}

function buildMcpServers(
  skills: Array<WorkspaceSkill>,
  resolveSecret: (ref: SecretRef) => string,
): Record<string, GrokMcpServer> | undefined {
  const servers: Record<string, GrokMcpServer> = {}
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
    servers[skill.name] = { url, headers }
  }
  return count > 0 ? servers : undefined
}

/** Extract the MCP server name from a `[mcp_servers.<name>]` table header. */
function mcpServerNameFromHeader(line: string): string | undefined {
  const match = /^\[mcp_servers\.([^\].]+)(?:\.headers)?\]\s*$/.exec(
    line.trim(),
  )
  return match?.[1]
}

function stripMcpServerSections(toml: string, names: Set<string>): string {
  const lines = toml.split('\n')
  const out: Array<string> = []
  let skipping = false

  for (const line of lines) {
    const trimmed = line.trim()
    const isTableHeader = trimmed.startsWith('[') && trimmed.endsWith(']')
    if (isTableHeader) {
      const serverName = mcpServerNameFromHeader(trimmed)
      if (serverName !== undefined) {
        if (names.has(serverName)) {
          skipping = true
          continue
        }
      }
      skipping = false
    }
    if (!skipping) out.push(line)
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

/** Render one grok `[mcp_servers.<name>]` block with optional headers table. */
function renderMcpServerBlock(name: string, server: GrokMcpServer): string {
  const lines: Array<string> = [
    `[mcp_servers.${name}]`,
    `url = ${tomlString(server.url)}`,
    'enabled = true',
  ]
  const headerEntries = Object.entries(server.headers)
  if (headerEntries.length > 0) {
    lines.push('', `[mcp_servers.${name}.headers]`)
    for (const [key, value] of headerEntries) {
      lines.push(`${key} = ${tomlString(value)}`)
    }
  }
  return lines.join('\n')
}

function mergeWorkspaceMcpIntoToml(
  existing: string,
  servers: Record<string, GrokMcpServer>,
): string {
  const stripped = stripMcpServerSections(
    existing,
    new Set(Object.keys(servers)),
  )
  const blocks = Object.entries(servers)
    .map(([name, server]) => renderMcpServerBlock(name, server))
    .join('\n\n')
  if (stripped.trim() === '') return `${blocks}\n`
  return `${stripped}\n\n${blocks}\n`
}

/** Render a streamable-HTTP MCP server entry for `.grok/config.toml`. */
export function renderGrokMcpToml(bridge: HostToolBridge): string {
  return renderMcpServerBlock(bridge.name, {
    url: bridge.url,
    headers: { Authorization: `Bearer ${bridge.token}` },
  })
}

export async function projectGrokMcpBridge(
  sandbox: SandboxHandle,
  cwd: string,
  bridge: HostToolBridge,
): Promise<void> {
  const grokDir = `${cwd}/.grok`
  await sandbox.fs.mkdir(grokDir)
  await sandbox.fs.write(`${grokDir}/config.toml`, renderGrokMcpToml(bridge))
}

async function projectMcpServers(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const servers = buildMcpServers(projection.skills, projection.resolveSecret)
  if (servers === undefined) return
  const target = `${projection.root}/.grok/config.toml`
  await handle.fs.mkdir(`${projection.root}/.grok`)

  let existing = ''
  if (await handle.fs.exists(target)) {
    try {
      existing = await handle.fs.read(target)
    } catch {
      // Unreadable config — start fresh so the MCP tables land cleanly.
    }
  }

  await handle.fs.write(target, mergeWorkspaceMcpIntoToml(existing, servers))
}

async function projectGitSkills(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const skillsDir = `${projection.root}/.grok/skills`
  let madeDir = false
  for (const skill of projection.skills) {
    if (skill.kind !== 'git') continue
    if (!madeDir) {
      await handle.fs.mkdir(skillsDir)
      madeDir = true
    }
    // Discover over virtual `/workspace` paths (handle.fs remaps). Remap only
    // for shell `ln`/`cp`, where absolute paths must match the real workdir.
    const source = skill.into ?? resolveGitSkillDir(projection.root, skill)
    const discovered = await discoverSkillDirs(handle, source)
    for (const { name, dir } of discovered) {
      const target = resolveHarnessCwd(handle, `${skillsDir}/${name}`)
      const realDir = resolveHarnessCwd(handle, dir)
      const lnCmd = `ln -s ${shellQuote(realDir)} ${shellQuote(target)}`
      const result = await handle.process.exec(lnCmd, { cwd: projection.root })
      if (result.exitCode !== 0) {
        const cpCmd = `cp -r ${shellQuote(realDir)} ${shellQuote(target)}`
        const copied = await handle.process.exec(cpCmd, {
          cwd: projection.root,
        })
        if (copied.exitCode !== 0) {
          console.warn(
            `[grok-build] failed to link gitSkill "${skill.repo}" into ${target}: ${copied.stderr.trim()}`,
          )
        }
      }
    }
  }
}

function projectAgentSkills(projection: WorkspaceProjection): void {
  for (const skill of projection.skills) {
    if (skill.kind !== 'agent-skill') continue
    console.warn(
      `[grok-build] agentSkill "${skill.name}" cannot be projected: Grok Build has no ` +
        'command to install a public skill by bare name. Provide it as a gitSkill ' +
        'instead. Skipping.',
    )
  }
}

function projectPlugins(projection: WorkspaceProjection): void {
  for (const name of projection.plugins) {
    console.warn(
      `[grok-build] plugin "${name}" cannot be projected: Grok Build has no plugin ` +
        'concept. Provide its functionality as a gitSkill or an MCP server ' +
        'instead. Skipping.',
    )
  }
}

export async function projectGrokWorkspace(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  // Always re-resolve and rewrite the secret-bearing MCP config so rotated
  // secrets re-apply and snapshots can't serve stale values.
  await projectMcpServers(handle, projection)

  // Gate only the safe, idempotent, non-secret operations on the marker.
  if (await handle.fs.exists(projection.markerPath)) return

  await projectGitSkills(handle, projection)
  projectAgentSkills(projection)
  projectPlugins(projection)

  await handle.fs.write(projection.markerPath, '')
}
