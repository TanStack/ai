/**
 * OpenCode workspace projector — mirrors the Claude Code reference
 * implementation at `packages/ai-claude-code/src/adapters/projection.ts`.
 *
 * `withSandbox` surfaces a portable `WorkspaceProjection` (skills, plugins, a
 * secret resolver, and a one-time marker path) via a capability. This adapter
 * reads it in `chatStream` setup and projects workspace inputs into OpenCode's
 * native format:
 *
 *   - MCP servers   → `opencode.json` at the workspace root (mcp section).
 *                     Written on EVERY call (never marker-gated) so rotated
 *                     secrets always re-apply.
 *   - gitSkill repos → OpenCode has no recognised skills directory; we
 *                      warn-and-skip rather than invent a path.
 *   - agentSkill    → no bare-name primitive in opencode; warn-and-skip.
 *   - plugins       → opencode has no `opencode plugin install` command;
 *                     warn-and-skip.
 *
 * The `opencode.json` mcp-section shape mirrors the `OPENCODE_CONFIG_CONTENT`
 * shape already used by the adapter's host-tool-bridge, ensuring both
 * mechanisms use the same server-entry schema:
 *
 *   ```json
 *   { "mcp": { "<name>": { "type": "remote", "url": "...", "enabled": true,
 *                           "headers": { ... } } } }
 *   ```
 *
 * OpenCode merges project-scoped `opencode.json` with its environment config,
 * so the workspace file coexists safely with the runtime `OPENCODE_CONFIG_CONTENT`
 * env written for the host-tool-bridge.
 *
 * External-convention caveat: the `opencode.json` location and the `remote`
 * MCP-entry shape are derived from the adapter's existing `OPENCODE_CONFIG_CONTENT`
 * usage. Where OpenCode has no clean primitive (gitSkill dir, agentSkill,
 * plugins) we no-op with a warning instead of fabricating a command.
 */
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

/**
 * Resolve a single MCP header value: a `SecretRef` resolves to its plaintext,
 * a `bearer(ref)` marker resolves to `Bearer <plaintext>`, and a plain string
 * is passed through unchanged.
 */
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

/**
 * Build the `mcp` section of OpenCode's `opencode.json` from the
 * `{ kind: 'mcp' }` skills, resolving every header value (SecretRef / bearer
 * / string). Returns `undefined` when there are no MCP skills so the caller
 * can skip the write.
 */
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
    for (const [name, value] of Object.entries(rawHeaders)) {
      headers[name] = resolveHeaderValue(value, resolveSecret)
    }
    const rawUrl = skill.config['url']
    const url = typeof rawUrl === 'string' ? rawUrl : ''
    mcp[skill.name] = { type: 'remote', url, enabled: true, headers }
  }
  return count > 0 ? mcp : undefined
}

/**
 * Write (or merge-update) `opencode.json` at the workspace root with the
 * project-scoped MCP servers, re-resolving every secret. Runs on EVERY
 * projection call (never marker-gated) so rotated secrets always re-apply.
 *
 * If `opencode.json` already exists (e.g. committed to the repo) we read it,
 * merge only the `mcp` key, and rewrite, preserving other settings. When there
 * are no MCP skills the write is skipped entirely.
 */
async function projectMcpServers(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
): Promise<void> {
  const mcpSection = buildMcpSection(projection.skills, projection.resolveSecret)
  if (mcpSection === undefined) return

  const target = `${projection.root}/opencode.json`

  // Read the existing file if present so we can preserve non-mcp settings.
  let existing: Record<string, unknown> = {}
  if (await handle.fs.exists(target)) {
    try {
      const raw = await handle.fs.read(target)
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>
      }
    } catch {
      // Unreadable or invalid JSON — start fresh so the MCP config lands cleanly.
    }
  }

  const merged = { ...existing, mcp: mcpSection }
  await handle.fs.write(target, JSON.stringify(merged, null, 2))
}

/**
 * OpenCode has no recognised skills directory where we can drop gitSkill repos.
 * AGENTS.md is already handled by the bootstrap layer (OpenCode reads it
 * natively). We warn-and-skip instead of inventing a path.
 */
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

/**
 * `agentSkill` references a public skill by bare name. OpenCode has no command
 * to fetch a skill from a bare name, so we warn and skip.
 */
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

/**
 * OpenCode has no plugin install command. We warn-and-skip each declared plugin
 * rather than fabricating a command.
 */
function projectPlugins(projection: WorkspaceProjection): void {
  for (const name of projection.plugins) {
    console.warn(
      `[opencode] plugin "${name}" cannot be installed: OpenCode has no plugin ` +
        'install command. Skipping.',
    )
  }
}

/**
 * Project a `WorkspaceProjection` into the OpenCode sandbox. Safe to call on
 * every `chatStream`. The secret-bearing `opencode.json` mcp section is
 * (re)written on every call, re-resolving secrets, so OpenCode always reads
 * current values and a snapshot can never serve a stale or rotated secret.
 * The safe, idempotent, non-secret operations (gitSkill, agentSkill, plugins
 * — all warn-and-skip for OpenCode) are guarded by a one-time marker so they
 * produce at most one warning per sandbox lifetime.
 *
 * @param handle     - The sandbox handle (`fs` + `process`).
 * @param projection - The portable workspace inputs from `withSandbox`.
 */
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
