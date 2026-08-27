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

/** A claude-format HTTP MCP server entry. */
interface ClaudeMcpServer {
  type: 'http'
  url: string
  headers: Record<string, string>
}

function buildMcpConfig(
  skills: Array<WorkspaceSkill>,
  resolveSecret: (ref: SecretRef) => string,
): { mcpServers: Record<string, ClaudeMcpServer> } | undefined {
  const mcpServers: Record<string, ClaudeMcpServer> = {}
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
    mcpServers[skill.name] = { type: 'http', url, headers }
  }
  return count > 0 ? { mcpServers } : undefined
}

async function projectMcpServers(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const config = buildMcpConfig(projection.skills, projection.resolveSecret)
  if (config === undefined) return
  const target = `${projection.root}/.mcp.json`
  await handle.fs.write(target, JSON.stringify(config, null, 2))
}

async function projectGitSkills(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const skillsDir = `${projection.root}/.claude/skills`
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
            `[claude-code] failed to link gitSkill "${skill.repo}" into ${target}: ${copied.stderr.trim()}`,
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
      `[claude-code] agentSkill "${skill.name}" cannot be projected: Claude Code has ` +
        'no command to install a public skill by bare name. Provide it as a gitSkill ' +
        'or a plugin instead. Skipping.',
    )
  }
}

async function projectPlugins(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  for (const name of projection.plugins) {
    const cmd = `claude plugin install ${shellQuote(name)} --scope project`
    try {
      const result = await handle.process.exec(cmd, { cwd: projection.root })
      if (result.exitCode !== 0) {
        console.warn(
          `[claude-code] "claude plugin install ${name}" exited ${result.exitCode}: ${result.stderr.trim()}`,
        )
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(
        `[claude-code] failed to install plugin "${name}": ${message}`,
      )
    }
  }
}

export async function projectClaudeWorkspace(
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
  await projectPlugins(handle, projection)

  await handle.fs.write(projection.markerPath, '')
}
