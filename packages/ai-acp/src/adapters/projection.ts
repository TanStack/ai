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
      await handle.fs.mkdir(`${projection.root}/${skillsDir}`)
      for (const skill of gitSkills) {
        const source = skill.into ?? resolveGitSkillDir(projection.root, skill)
        const discovered = await discoverSkillDirs(handle, source)
        for (const { name, dir } of discovered) {
          const realRoot = resolveHarnessCwd(handle, projection.root)
          const realDir = resolveHarnessCwd(handle, dir)
          const relSource = relativeToRoot(realRoot, realDir)
          const relTarget = `${skillsDir}/${name}`
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
