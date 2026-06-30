/**
 * Grok Build workspace projector — mirrors the codex reference
 * (`packages/ai-codex/src/adapters/projection.ts`).
 *
 * `withSandbox` surfaces a portable `WorkspaceProjection` (skills, plugins, a
 * secret resolver, and a one-time marker path) via a capability. Each harness
 * adapter reads it in its `chatStream` setup and projects those inputs into the
 * CLI's native format. For Grok Build that means:
 *
 *   - MCP servers   → `[mcp_servers.<name>]` tables in `<root>/.grok/config.toml`
 *                     (TOML), matching the shape `projectGrokMcpBridge` uses for
 *                     the host tool-bridge. Workspace projection MERGES only its
 *                     own `mcp_servers` entries so an existing bridge table (or
 *                     other non-workspace servers) is preserved — unlike codex,
 *                     where the bridge is passed via CLI `--config` flags instead
 *                     of sharing the same file.
 *   - gitSkill repos → linked under `<root>/.grok/skills/<basename>` via symlink,
 *                      falling back to recursive copy.
 *   - agentSkill     → no grok primitive pulls a public skill by bare name, so
 *                      we warn-and-skip rather than invent one.
 *   - plugins        → Grok Build has no plugin concept, so we warn-and-skip.
 *
 * The secret-bearing MCP config is (re)written on EVERY call, re-resolving
 * secrets each time, so grok always reads current values and a snapshot can
 * never serve a stale or rotated secret. Only the safe, idempotent, non-secret
 * operations (gitSkill links, agentSkill / plugin handling) are guarded by a
 * one-time marker file under the workspace.
 *
 * Grok specifics (verified against the grok config schema):
 *   - Grok reads `[mcp_servers.<name>]` from `<cwd>/.grok/config.toml`, with a
 *     streamable-HTTP server taking `url`, `enabled`, and optional nested
 *     `[mcp_servers.<name>.headers]` tables. We write resolved header values
 *     directly so a rotated secret re-applies on every projection.
 *   - AGENTS.md is written universally by bootstrap (grok reads it natively),
 *     so it is NOT rewritten here.
 */
import { isSecretRef, resolveGitSkillDir } from '@tanstack/ai-sandbox'
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

/** A grok-format streamable-HTTP MCP server entry with resolved headers. */
interface GrokMcpServer {
  url: string
  headers: Record<string, string>
}

/**
 * Build grok's `mcp_servers` map from the `{ kind: 'mcp' }` skills, resolving
 * every header value (SecretRef / bearer / string). Returns `undefined` when
 * there are no MCP skills so the caller can skip the write.
 */
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
    for (const [name, value] of Object.entries(rawHeaders)) {
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

/**
 * Remove `[mcp_servers.<name>]` and `[mcp_servers.<name>.headers]` blocks for the
 * given server names, preserving every other table and top-level key.
 */
function stripMcpServerSections(toml: string, names: Set<string>): string {
  const lines = toml.split('\n')
  const out: Array<string> = []
  let skipping = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const serverName = mcpServerNameFromHeader(trimmed)
      if (serverName !== undefined && names.has(serverName)) {
        skipping = true
        continue
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

/**
 * Merge workspace MCP server entries into an existing `.grok/config.toml`,
 * replacing only the named `mcp_servers` tables and leaving bridge (and other)
 * servers intact.
 */
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
 * Write grok's `<root>/.grok/config.toml`, re-resolving every secret. This runs
 * on EVERY projection call (never gated by the marker) so grok always reads the
 * current secret values and a snapshot can never serve a stale or rotated one.
 * Existing `mcp_servers` entries (e.g. the host tool-bridge) are preserved via
 * merge. When there are no MCP skills the write is skipped.
 */
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

/**
 * Ensure each cloned `gitSkill` repo is available under grok's project skills
 * dir (`<root>/.grok/skills/<basename>`) via a symlink, falling back to a
 * recursive copy on platforms without `ln -s`.
 */
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
    const source = skill.into ?? resolveGitSkillDir(projection.root, skill)
    const target = `${skillsDir}/${basenameOf(source)}`
    const lnCmd = `ln -s ${shellQuote(source)} ${shellQuote(target)}`
    const result = await handle.process.exec(lnCmd, { cwd: projection.root })
    if (result.exitCode !== 0) {
      const cpCmd = `cp -r ${shellQuote(source)} ${shellQuote(target)}`
      const copied = await handle.process.exec(cpCmd, { cwd: projection.root })
      if (copied.exitCode !== 0) {
        console.warn(
          `[grok-build] failed to link gitSkill "${skill.repo}" into ${target}: ${copied.stderr.trim()}`,
        )
      }
    }
  }
}

/**
 * `agentSkill` references a public skill by bare name. Grok Build has no
 * primitive to fetch a skill from a bare name, so we warn and skip rather than
 * fabricate a command.
 */
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

/**
 * Grok Build has no plugin concept, so declared plugins cannot be projected. We
 * warn once per plugin and skip rather than throw.
 */
function projectPlugins(projection: WorkspaceProjection): void {
  for (const name of projection.plugins) {
    console.warn(
      `[grok-build] plugin "${name}" cannot be projected: Grok Build has no plugin ` +
        'concept. Provide its functionality as a gitSkill or an MCP server ' +
        'instead. Skipping.',
    )
  }
}

/**
 * Project a `WorkspaceProjection` into the Grok Build sandbox. Safe to call on
 * every `chatStream`. The secret-bearing MCP config is (re)written on every
 * call, re-resolving secrets, so grok always reads current values and a snapshot
 * can never serve a stale or rotated secret. The safe, idempotent, non-secret
 * operations (gitSkill links, agentSkill / plugin handling) are guarded by a
 * one-time marker so they run only on the first call after create/restore.
 *
 * @param handle     - The sandbox handle (`fs` + `process`).
 * @param projection - The portable workspace inputs from `withSandbox`.
 */
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
