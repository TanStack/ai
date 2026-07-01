/**
 * Generic workspace projector for ACP harnesses.
 *
 * `withSandbox` surfaces a portable {@link WorkspaceProjection} (skills, plugins,
 * a secret resolver, a one-time marker path) via a capability. Most of it maps
 * onto ACP natively:
 *
 *   - **MCP skills** → passed straight through ACP's `newSession` `mcpServers`
 *     (see {@link workspaceMcpServers}); no config file is written, because an
 *     ACP agent receives MCP servers over the protocol. This is the key
 *     difference from file-based harnesses (Claude Code, Codex) that read MCP
 *     from disk.
 *   - **gitSkill repos** → linked into the harness's skills directory (when the
 *     harness declares one via `skillsDir`, e.g. `.pi/skills`).
 *   - **agentSkill / plugins** → no generic ACP primitive, so we warn-and-skip.
 *
 * `fileSkill` and `instructions` are already written by the provider-agnostic
 * bootstrap (into the workspace root + `AGENTS.md`), so they need no projection.
 */
import { isSecretRef, resolveGitSkillDir } from '@tanstack/ai-sandbox'
import type {
  BearerRef,
  SandboxHandle,
  SecretRef,
  WorkspaceProjection,
} from '@tanstack/ai-sandbox'

/** ACP `newSession` MCP server descriptor (HTTP transport). */
export interface AcpMcpServer {
  name: string
  url: string
  headers: Array<{ name: string; value: string }>
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function basenameOf(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '')
  return segments[segments.length - 1] ?? path
}

/**
 * Make a sandbox path relative to the workspace root, so shell commands work on
 * every provider. Only `fs.*` remaps the virtual `/workspace`; a raw `/workspace`
 * in a shell command is the real path in a container but a non-existent absolute
 * path on local-process. Running relative to the root (the exec cwd) is correct
 * everywhere.
 */
function relativeToRoot(root: string, p: string): string {
  return p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p
}

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

/**
 * Build ACP `mcpServers` entries from the workspace's `mcp` skills, resolving
 * every header value (SecretRef / bearer / plain string). Returns `[]` when
 * there are no MCP skills. Pass the result to `startAcpSession({ mcpServers })`.
 */
export function workspaceMcpServers(
  projection: WorkspaceProjection,
): Array<AcpMcpServer> {
  const servers: Array<AcpMcpServer> = []
  for (const skill of projection.skills) {
    if (skill.kind !== 'mcp') continue
    const rawUrl = skill.config['url']
    const url = typeof rawUrl === 'string' ? rawUrl : ''
    const headers = Object.entries(skill.config.headers ?? {}).map(
      ([name, value]) => ({
        name,
        value: resolveHeaderValue(value, projection.resolveSecret),
      }),
    )
    servers.push({ name: skill.name, url, headers })
  }
  return servers
}

/**
 * Project the non-MCP parts of a workspace into an ACP harness. Links each
 * cloned `gitSkill` repo into the harness's skills directory when one is
 * declared; warns and skips `agentSkill`s, `plugin`s, and (when no `skillsDir`
 * is configured) `gitSkill`s. Idempotent — gated by the projection marker.
 *
 * MCP skills are NOT handled here; pass {@link workspaceMcpServers} to the ACP
 * session instead.
 */
export async function projectAcpWorkspace(
  handle: SandboxHandle,
  projection: WorkspaceProjection,
  options: { skillsDir?: string; harnessName: string },
): Promise<void> {
  // Idempotent, non-secret operations only — gate on the one-time marker.
  if (await handle.fs.exists(projection.markerPath)) return

  const { skillsDir, harnessName } = options
  const gitSkills = projection.skills.filter((skill) => skill.kind === 'git')

  if (gitSkills.length > 0) {
    if (skillsDir === undefined) {
      for (const skill of gitSkills) {
        console.warn(
          `[${harnessName}] gitSkill "${skill.repo}" cannot be projected: this ` +
            'harness declares no `skillsDir`. The clone is still available under ' +
            'the workspace, but the harness will not auto-discover it. Skipping link.',
        )
      }
    } else {
      // Create the skills dir via fs (which remaps the virtual root), then copy
      // each clone in with paths relative to the exec cwd (the workspace root)
      // so the shell command resolves on every provider.
      await handle.fs.mkdir(`${projection.root}/${skillsDir}`)
      for (const skill of gitSkills) {
        const source = skill.into ?? resolveGitSkillDir(projection.root, skill)
        const relSource = relativeToRoot(projection.root, source)
        const relTarget = `${skillsDir}/${basenameOf(source)}`
        const cp = await handle.process.exec(
          `cp -r ${shellQuote(relSource)} ${shellQuote(relTarget)}`,
          { cwd: projection.root },
        )
        if (cp.exitCode !== 0) {
          console.warn(
            `[${harnessName}] failed to copy gitSkill "${skill.repo}" into ${relTarget}: ${cp.stderr.trim()}`,
          )
        }
      }
    }
  }

  for (const skill of projection.skills) {
    if (skill.kind === 'agent-skill') {
      console.warn(
        `[${harnessName}] agentSkill "${skill.name}" cannot be projected: there is ` +
          'no generic ACP primitive to install a skill by bare name. Provide it as ' +
          'a gitSkill instead. Skipping.',
      )
    }
  }
  for (const name of projection.plugins) {
    console.warn(
      `[${harnessName}] plugin "${name}" cannot be projected: ACP has no generic ` +
        'plugin concept. Provide its functionality as a gitSkill or MCP server. Skipping.',
    )
  }

  await handle.fs.write(projection.markerPath, '')
}
