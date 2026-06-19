/**
 * Codex workspace projector — mirrors the claude-code reference
 * (`packages/ai-claude-code/src/adapters/projection.ts`).
 *
 * `withSandbox` surfaces a portable `WorkspaceProjection` (skills, plugins, a
 * secret resolver, and a one-time marker path) via a capability. Each harness
 * adapter reads it in its `chatStream` setup and projects those inputs into the
 * CLI's native format. For Codex that means:
 *
 *   - MCP servers   → `[mcp_servers.<name>]` tables in `~/.codex/config.toml`
 *                     (TOML), reusing the same `mcp_servers.*` key shape the
 *                     adapter already uses to wire the host tool-bridge.
 *   - gitSkill repos → linked under codex's skills dir when one exists; Codex
 *                      has no documented project skills dir, so we warn-and-skip.
 *   - agentSkill     → no codex primitive pulls a public skill by bare name, so
 *                      we warn-and-skip rather than invent one.
 *   - plugins        → Codex has no plugin concept, so we warn-and-skip.
 *
 * The secret-bearing MCP config is (re)written on EVERY call, re-resolving
 * secrets each time, so codex always reads current values and a snapshot can
 * never serve a stale or rotated secret. Only the safe, idempotent, non-secret
 * operations (gitSkill links, agentSkill / plugin handling) are guarded by a
 * one-time marker file under the workspace.
 *
 * Codex specifics (verified against the codex config schema):
 *   - Codex reads `[mcp_servers.<name>]` from `~/.codex/config.toml`, with a
 *     streamable-HTTP server taking `url` plus optional `http_headers`
 *     (a literal header table). We write resolved header values directly into
 *     `http_headers` so a rotated secret re-applies on every projection.
 *   - AGENTS.md is written universally by bootstrap (codex reads it natively),
 *     so it is NOT rewritten here.
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

/** Last path segment of a `gitSkill` clone dir, used as the skills-dir name. */
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

/**
 * Build codex's `mcp_servers` map from the `{ kind: 'mcp' }` skills, resolving
 * every header value (SecretRef / bearer / string). Returns `undefined` when
 * there are no MCP skills so the caller can skip the write.
 */
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
    for (const [name, value] of Object.entries(rawHeaders)) {
      headers[name] = resolveHeaderValue(value, resolveSecret)
    }
    const rawUrl = skill.config['url']
    const url = typeof rawUrl === 'string' ? rawUrl : ''
    servers[skill.name] = { url, headers }
  }
  return count > 0 ? servers : undefined
}

/**
 * Render codex's `[mcp_servers.<name>]` config in TOML. Each server emits a
 * `url` and, when it has headers, an inline `http_headers` table of resolved
 * literal values (matching the `mcp_servers.*` key shape the adapter already
 * uses for the host tool-bridge).
 */
function renderMcpToml(servers: Record<string, CodexMcpServer>): string {
  const blocks: Array<string> = []
  for (const [name, server] of Object.entries(servers)) {
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

/**
 * Write codex's `~/.codex/config.toml`, re-resolving every secret. This runs on
 * EVERY projection call (never gated by the marker) so codex always reads the
 * current secret values and a snapshot can never serve a stale or rotated one.
 * When there are no MCP skills the write is skipped.
 */
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

/**
 * Ensure each cloned `gitSkill` repo is available under codex's project skills
 * dir (`<root>/.codex/skills/<basename>`) via a symlink, falling back to a
 * recursive copy on platforms without `ln -s`. Codex has no documented skills
 * dir; if linking fails we warn rather than throw.
 */
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
    const source = skill.into ?? resolveGitSkillDir(projection.root, skill)
    const target = `${skillsDir}/${basenameOf(source)}`
    const lnCmd = `ln -s ${shellQuote(source)} ${shellQuote(target)}`
    const result = await handle.process.exec(lnCmd, { cwd: projection.root })
    if (result.exitCode !== 0) {
      const cpCmd = `cp -r ${shellQuote(source)} ${shellQuote(target)}`
      const copied = await handle.process.exec(cpCmd, { cwd: projection.root })
      if (copied.exitCode !== 0) {
        console.warn(
          `[codex] failed to link gitSkill "${skill.repo}" into ${target}: ${copied.stderr.trim()}`,
        )
      }
    }
  }
}

/**
 * `agentSkill` references a public skill by bare name. Codex has no primitive to
 * fetch a skill from a bare name, so we warn and skip rather than fabricate a
 * command.
 */
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

/**
 * Codex has no plugin concept, so declared plugins cannot be projected. We warn
 * once per plugin and skip rather than throw.
 */
function projectPlugins(projection: WorkspaceProjection): void {
  for (const name of projection.plugins) {
    console.warn(
      `[codex] plugin "${name}" cannot be projected: Codex has no plugin ` +
        'concept. Provide its functionality as a gitSkill or an MCP server ' +
        'instead. Skipping.',
    )
  }
}

/**
 * Project a `WorkspaceProjection` into the Codex sandbox. Safe to call on every
 * `chatStream`. The secret-bearing MCP config is (re)written on every call,
 * re-resolving secrets, so codex always reads current values and a snapshot can
 * never serve a stale or rotated secret. The safe, idempotent, non-secret
 * operations (gitSkill links, agentSkill / plugin handling) are guarded by a
 * one-time marker so they run only on the first call after create/restore.
 *
 * @param handle     - The sandbox handle (`fs` + `process`).
 * @param projection - The portable workspace inputs from `withSandbox`.
 */
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
