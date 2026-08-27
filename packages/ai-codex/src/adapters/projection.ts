import {
  discoverSkillDirs,
  isSecretRef,
  resolveGitSkillDir,
  resolveHarnessCwd,
} from '@tanstack/ai-sandbox'
import type {
  BearerRef,
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

/** A codex-format streamable-HTTP MCP server entry with resolved headers. */
interface CodexMcpServer {
  url: string
  headers: Record<string, string>
}

function buildMcpServers(
  skills: Array<WorkspaceSkill>,
  resolveSecret: (ref: SecretRef) => string,
): Record<string, CodexMcpServer> | undefined {
  const servers: Record<string, CodexMcpServer> = {}
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

function renderMcpToml(servers: Record<string, CodexMcpServer>): string {
  const blocks: Array<string> = []
  const mcpServers = Object.entries(servers)
  for (const [name, server] of mcpServers) {
    const lines: Array<string> = [
      `[mcp_servers.${name}]`,
      `url = ${tomlString(server.url)}`,
    ]
    const headerEntries = Object.entries(server.headers)
    if (headerEntries.length > 0) {
      const inline = headerEntries
        .map(([key, value]) => `${tomlString(key)} = ${tomlString(value)}`)
        .join(', ')
      lines.push(`http_headers = { ${inline} }`)
    }
    blocks.push(lines.join('\n'))
  }
  return `${blocks.join('\n\n')}\n`
}

async function projectMcpServers(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const servers = buildMcpServers(projection.skills, projection.resolveSecret)
  if (servers === undefined) return
  const target = `${projection.root}/.codex/config.toml`
  await handle.fs.mkdir(`${projection.root}/.codex`)
  await handle.fs.write(target, renderMcpToml(servers))
}

async function projectGitSkills(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const skillsDir = `${projection.root}/.codex/skills`
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
            `[codex] failed to link gitSkill "${skill.repo}" into ${target}: ${copied.stderr.trim()}`,
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
      `[codex] agentSkill "${skill.name}" cannot be projected: Codex has no ` +
        'command to install a public skill by bare name. Provide it as a gitSkill ' +
        'instead. Skipping.',
    )
  }
}

function projectPlugins(projection: WorkspaceProjection): void {
  for (const name of projection.plugins) {
    console.warn(
      `[codex] plugin "${name}" cannot be projected: Codex has no plugin ` +
        'concept. Provide its functionality as a gitSkill or an MCP server ' +
        'instead. Skipping.',
    )
  }
}

export async function projectCodexWorkspace(
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
