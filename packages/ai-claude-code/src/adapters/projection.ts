/**
 * Claude Code workspace projector — the reference implementation the other
 * harness projectors (codex, gemini-cli, opencode) mirror.
 *
 * `withSandbox` surfaces a portable `WorkspaceProjection` (skills, plugins, a
 * secret resolver, and a one-time marker path) via a capability. Each harness
 * adapter reads it in its `chatStream` setup and projects those inputs into the
 * CLI's native format. For Claude Code that means:
 *
 *   - MCP servers   → a project-scoped `.mcp.json` at the workspace root.
 *   - gitSkill repos → linked under `.claude/skills/<basename>`.
 *   - agentSkill     → no reliable claude primitive pulls a public skill by
 *                      bare name, so we warn and skip rather than invent one.
 *   - plugins        → `claude plugin install <name>` (best-effort).
 *
 * Projection is idempotent: a marker file under the workspace guards it, so a
 * resumed sandbox re-projects only when the marker is absent (the marker is
 * never snapshotted, so secret-bearing files are always re-written fresh).
 *
 * External-convention caveat: the `.mcp.json` location/shape, the skills dir,
 * and the plugin-install command are verified against the installed `claude`
 * CLI. Where claude has no clean primitive (agentSkill by bare name) we no-op
 * with a warning instead of fabricating a command.
 */
import { isSecretRef, resolveGitSkillDir } from '@tanstack/ai-sandbox'
import type {
  SandboxHandle,
  SecretRef,
  WorkspaceProjection,
  WorkspaceSkill,
} from '@tanstack/ai-sandbox'

/** Structural shape of a `bearer(ref)` marker (`@tanstack/ai-sandbox`'s BearerRef). */
interface BearerMarker {
  readonly __bearerRef: SecretRef
}

/** POSIX single-quote escape for embedding a value in a shell command. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Last path segment of a `gitSkill` clone dir, used as the skills-dir name. */
function basenameOf(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '')
  return segments[segments.length - 1] ?? path
}

/** True when `value` is a `bearer(ref)` marker created by `@tanstack/ai-sandbox`. */
function isBearerMarker(value: unknown): value is BearerMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    isSecretRef((value as { __bearerRef?: unknown }).__bearerRef)
  )
}

/**
 * Resolve a single MCP header value: a `SecretRef` resolves to its plaintext, a
 * `bearer(ref)` marker resolves to `Bearer <plaintext>`, and a plain string is
 * passed through unchanged.
 */
function resolveHeaderValue(
  value: string | SecretRef,
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

/**
 * Build claude's project-scoped MCP config from the `{ kind: 'mcp' }` skills,
 * resolving every header value (SecretRef / bearer / string). Returns
 * `undefined` when there are no MCP skills so the caller can skip the write.
 */
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
    for (const [name, value] of Object.entries(rawHeaders)) {
      headers[name] = resolveHeaderValue(value, resolveSecret)
    }
    const rawUrl = skill.config['url']
    const url = typeof rawUrl === 'string' ? rawUrl : ''
    mcpServers[skill.name] = { type: 'http', url, headers }
  }
  return count > 0 ? { mcpServers } : undefined
}

/**
 * Write the project-scoped `.mcp.json` with resolved secrets. This file lives
 * only in the running sandbox (never snapshotted); it is re-written whenever
 * the marker is absent, so resumed snapshots always get fresh secrets.
 */
async function projectMcpServers(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const config = buildMcpConfig(projection.skills, projection.resolveSecret)
  if (config === undefined) return
  const target = `${projection.root}/.mcp.json`
  await handle.fs.write(target, JSON.stringify(config, null, 2))
}

/**
 * Ensure each cloned `gitSkill` repo is available under claude's project skills
 * dir (`<root>/.claude/skills/<basename>`) via a symlink, falling back to a
 * recursive copy on platforms without `ln -s`.
 */
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
    const source = skill.into ?? resolveGitSkillDir(projection.root, skill)
    const target = `${skillsDir}/${basenameOf(source)}`
    const lnCmd = `ln -s ${shellQuote(source)} ${shellQuote(target)}`
    const result = await handle.process.exec(lnCmd, { cwd: projection.root })
    if (result.exitCode !== 0) {
      const cpCmd = `cp -r ${shellQuote(source)} ${shellQuote(target)}`
      const copied = await handle.process.exec(cpCmd, { cwd: projection.root })
      if (copied.exitCode !== 0) {
        console.warn(
          `[claude-code] failed to link gitSkill "${skill.repo}" into ${target}: ${copied.stderr.trim()}`,
        )
      }
    }
  }
}

/**
 * `agentSkill` references a public skill by bare name. Claude Code has no
 * primitive to fetch a skill from a bare name (skills resolve from local
 * `.claude/skills/` dirs and plugin marketplaces), so we warn and skip rather
 * than fabricate a command.
 */
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

/**
 * Install each declared plugin via `claude plugin install <name>`. Plugin
 * installs are best-effort: a failure (no marketplace, network, …) warns but
 * never throws, so a missing plugin can't break the run.
 */
async function projectPlugins(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  for (const name of projection.plugins) {
    const cmd = `claude plugin install ${shellQuote(name)}`
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

/**
 * Project a `WorkspaceProjection` into the Claude Code sandbox. Idempotent: a
 * marker file under the workspace short-circuits re-projection, so this is safe
 * to call on every `chatStream` (only the first run after create/restore does
 * work).
 *
 * @param handle     - The sandbox handle (`fs` + `process`).
 * @param projection - The portable workspace inputs from `withSandbox`.
 */
export async function projectClaudeWorkspace(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  if (await handle.fs.exists(projection.markerPath)) return

  await projectMcpServers(handle, projection)
  await projectGitSkills(handle, projection)
  projectAgentSkills(projection)
  await projectPlugins(handle, projection)

  await handle.fs.write(projection.markerPath, '')
}
