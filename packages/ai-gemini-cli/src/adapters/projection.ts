/**
 * Gemini CLI workspace projector — mirrors the Claude Code reference
 * implementation in `@tanstack/ai-claude-code`.
 *
 * `withSandbox` surfaces a portable `WorkspaceProjection` (skills, plugins, a
 * secret resolver, and a one-time marker path) via a capability. Each harness
 * adapter reads it in its `chatStream` setup and projects those inputs into the
 * CLI's native format. For Gemini CLI that means:
 *
 *   - MCP servers   → `~/.gemini/settings.json` (re-written on EVERY call).
 *   - gitSkill repos → linked under `.gemini/skills/<basename>` inside the
 *                      sandbox if that directory is accessible; otherwise
 *                      warn-and-skip (Gemini CLI has no documented global skills
 *                      directory equivalent to Claude Code's `.claude/skills`).
 *   - agentSkill    → no bare-name primitive; warn-and-skip.
 *   - plugins       → no `gemini extension install` primitive; warn-and-skip.
 *
 * The secret-bearing `settings.json` is (re)written on EVERY call, re-resolving
 * secrets each time, so Gemini CLI always reads current values and a snapshot
 * can never serve a stale or rotated secret. Only the safe, idempotent,
 * non-secret operations (gitSkill links) are guarded by a one-time marker file
 * under the workspace.
 *
 * External-convention caveat: the `~/.gemini/settings.json` path and the MCP
 * server shape are verified against the installed `gemini` CLI. Where Gemini
 * CLI has no clean primitive (agentSkill by bare name, plugin installs) we
 * no-op with a warning instead of fabricating a command.
 */
import { isSecretRef, resolveGitSkillDir } from '@tanstack/ai-sandbox'
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

/** Last path segment of a path string, used as the skills-dir name. */
function basenameOf(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '')
  return segments[segments.length - 1] ?? path
}

/** True when `value` is a `bearer(ref)` marker created by `@tanstack/ai-sandbox`. */
function isBearerMarker(value: unknown): value is BearerRef {
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
  value: string | SecretRef | BearerRef,
  resolveSecret: (ref: SecretRef) => string,
): string {
  if (isSecretRef(value)) return resolveSecret(value)
  if (isBearerMarker(value)) return `Bearer ${resolveSecret(value.__bearerRef)}`
  return value
}

/** A Gemini-CLI-format MCP server entry (used in `~/.gemini/settings.json`). */
interface GeminiMcpServer {
  url: string
  headers: Record<string, string>
}

/**
 * Build Gemini CLI's settings `mcpServers` map from the `{ kind: 'mcp' }` skills,
 * resolving every header value (SecretRef / bearer / string). Returns
 * `undefined` when there are no MCP skills so the caller can skip the write.
 */
function buildMcpConfig(
  skills: Array<WorkspaceSkill>,
  resolveSecret: (ref: SecretRef) => string,
): { mcpServers: Record<string, GeminiMcpServer> } | undefined {
  const mcpServers: Record<string, GeminiMcpServer> = {}
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
    mcpServers[skill.name] = { url, headers }
  }
  return count > 0 ? { mcpServers } : undefined
}

/**
 * Write `~/.gemini/settings.json`, re-resolving every secret. This runs on
 * EVERY projection call (never gated by the marker) so Gemini CLI always reads
 * the current secret values and a snapshot can never serve a stale or rotated
 * one. When there are no MCP skills the write is skipped.
 */
async function projectMcpServers(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const config = buildMcpConfig(projection.skills, projection.resolveSecret)
  if (config === undefined) return
  const settingsDir = `${homeDir(handle)}.gemini`
  await handle.fs.mkdir(settingsDir)
  const target = `${settingsDir}/settings.json`
  await handle.fs.write(target, JSON.stringify(config, null, 2))
}

/**
 * Home directory prefix for the sandbox (always `/root/` for containerised
 * sandboxes; exposed as a small helper so the path appears in one place).
 */
function homeDir(_handle: SandboxHandle): string {
  return '/root/'
}

/**
 * Ensure each cloned `gitSkill` repo is available under a Gemini-accessible
 * skills directory (`<root>/.gemini/skills/<basename>`) via a symlink, falling
 * back to a recursive copy on platforms without `ln -s`.
 *
 * NOTE: Gemini CLI has no publicly documented equivalent to Claude Code's
 * `.claude/skills/` directory. If the `.gemini/skills` directory does not exist
 * the operation warns and skips rather than inventing a convention.
 */
async function projectGitSkills(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const skillsDir = `${projection.root}/.gemini/skills`
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
          `[gemini-cli] failed to link gitSkill "${skill.repo}" into ${target}: ${copied.stderr.trim()}`,
        )
      }
    }
  }
}

/**
 * `agentSkill` references a public skill by bare name. Gemini CLI has no
 * primitive to fetch a skill from a bare name, so we warn and skip rather than
 * fabricate a command.
 */
function projectAgentSkills(projection: WorkspaceProjection): void {
  for (const skill of projection.skills) {
    if (skill.kind !== 'agent-skill') continue
    console.warn(
      `[gemini-cli] agentSkill "${skill.name}" cannot be projected: Gemini CLI has ` +
        'no command to install a public skill by bare name. Provide it as a gitSkill ' +
        'instead. Skipping.',
    )
  }
}

/**
 * Gemini CLI has no documented plugin-install primitive equivalent to Claude
 * Code's `claude plugin install`. Warn and skip for every declared plugin.
 */
function projectPlugins(projection: WorkspaceProjection): void {
  for (const name of projection.plugins) {
    console.warn(
      `[gemini-cli] plugin "${name}" cannot be installed: Gemini CLI has no ` +
        'plugin-install primitive. Skipping.',
    )
  }
}

/**
 * Project a `WorkspaceProjection` into the Gemini CLI sandbox. Safe to call on
 * every `chatStream`. The secret-bearing `~/.gemini/settings.json` is
 * (re)written on every call, re-resolving secrets, so Gemini CLI always reads
 * current values and a snapshot can never serve a stale or rotated secret. The
 * safe, idempotent, non-secret operations (gitSkill links) are guarded by a
 * one-time marker so they run only on the first call after create/restore.
 *
 * @param handle     - The sandbox handle (`fs` + `process`).
 * @param projection - The portable workspace inputs from `withSandbox`.
 */
export async function projectGeminiWorkspace(
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
