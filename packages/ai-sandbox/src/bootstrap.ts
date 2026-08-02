/**
 * Workspace bootstrap engine — provider-agnostic because it only uses the
 * {@link SandboxHandle} contract. Runs once when a sandbox is freshly created
 * (or restored without its working tree): land the source, inject secrets,
 * detect the package manager, and run setup commands.
 *
 * Harness-specific projection (CLAUDE.md, agent skills, MCP config) is NOT done
 * here — that's each adapter's `projectWorkspace()` hook, since the format
 * differs per harness.
 */
import { buildSetupPlan } from './setup-plan'
import { createBootstrapShell } from './shell'
import {
  mergeAgentsContent,
  resolveGitSkillDir,
  writeAgentsFile,
} from './agents-file'
import { resolveAllSecrets, resolveSecret } from './secrets'
import type { SandboxHandle } from './contracts'
import type { PackageManager, WorkspaceDefinition } from './workspace'

const LOCKFILES: Record<Exclude<PackageManager, 'auto'>, string> = {
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
  bun: 'bun.lockb',
  npm: 'package-lock.json',
}

export const DEFAULT_WORKSPACE_ROOT = '/workspace'

/** Resolve the package manager, detecting from a lockfile when `'auto'`. */
export async function detectPackageManager(
  handle: SandboxHandle,
  workspace: WorkspaceDefinition,
  root: string,
): Promise<Exclude<PackageManager, 'auto'> | undefined> {
  const pm = workspace.packageManager ?? 'auto'
  if (pm !== 'auto') return pm
  for (const [manager, lockfile] of Object.entries(LOCKFILES) as Array<
    [Exclude<PackageManager, 'auto'>, string]
  >) {
    if (await handle.fs.exists(`${root}/${lockfile}`)) return manager
  }
  return undefined
}

export interface BootstrapResult {
  packageManager?: Exclude<PackageManager, 'auto'>
  ranSetup: Array<string>
}

/**
 * Bootstrap a freshly created sandbox's workspace. Idempotent enough to be safe
 * on restore: a git clone into a populated dir is skipped by checking for the
 * target dir first.
 */
export async function bootstrapWorkspace(
  handle: SandboxHandle,
  workspace: WorkspaceDefinition,
  options: { signal?: AbortSignal } = {},
): Promise<BootstrapResult> {
  const root = workspace.root ?? DEFAULT_WORKSPACE_ROOT

  // Secrets live only in the running sandbox env (never persisted).
  if (workspace.secrets !== undefined) {
    const resolved = resolveAllSecrets(workspace.secrets)
    if (Object.keys(resolved).length > 0) {
      await handle.env.set(resolved)
    }
  }

  // Land the source. Clone into the handle's own default root (each provider
  // maps the conventional `/workspace` virtual root to its real backing dir),
  // rather than passing a virtual `dir` that can't be remapped inside a shell
  // command string.
  if (workspace.source.type === 'git') {
    const alreadyCloned = await handle.fs.exists(`${root}/.git`)
    if (!alreadyCloned) {
      await handle.git.clone({
        url: workspace.source.url,
        ref: workspace.source.ref,
        auth: workspace.source.auth,
        ...(workspace.source.depth !== undefined
          ? { depth: workspace.source.depth }
          : {}),
      })
    }
  }
  // 'local' is provider-pre-populated at create; 'none' starts empty.

  // Clone git-skill repos so setup steps (and the harness projector) can use
  // them. gitSkill clones are always shallow (depth 1) unless the skill's own
  // repo entry carries a depth override — the WorkspaceSkill `git` variant
  // does not expose one, so depth always defaults to 1 inside git.clone.
  const skills = workspace.skills ?? []
  for (const skill of skills) {
    if (skill.kind === 'git') {
      const url = skill.repo.startsWith('http')
        ? skill.repo
        : `https://github.com/${skill.repo}.git`
      const dir = skill.into ?? resolveGitSkillDir(root, skill)
      const auth =
        skill.secret !== undefined && workspace.secrets !== undefined
          ? { token: resolveSecret(workspace.secrets, skill.secret) }
          : undefined
      await handle.git.clone({
        url,
        dir,
        ...(auth !== undefined ? { auth } : {}),
        depth: 1,
      })
    }
  }

  // Write AGENTS.md (and its per-CLI symlinks) when instructions are provided
  // directly on the workspace, via a fileSkill whose path is `AGENTS.md`, or
  // when named workspace scripts should be surfaced for the agent.
  let agentsContent: string | undefined
  if (
    workspace.instructions !== undefined &&
    workspace.instructions.length > 0
  ) {
    agentsContent = workspace.instructions
  } else {
    const agentsFileSkill = skills.find(
      (s): s is Extract<typeof s, { kind: 'file' }> =>
        s.kind === 'file' && s.path === 'AGENTS.md',
    )
    if (agentsFileSkill !== undefined) {
      agentsContent = agentsFileSkill.content
    }
  }
  agentsContent = mergeAgentsContent(agentsContent, workspace.scripts)
  if (agentsContent !== undefined) {
    await writeAgentsFile(handle, root, agentsContent)
  }

  // Write all other fileSkills directly into the workspace root.
  for (const skill of skills) {
    if (skill.kind === 'file' && skill.path !== 'AGENTS.md') {
      await handle.fs.write(`${root}/${skill.path}`, skill.content)
    }
  }

  const packageManager = await detectPackageManager(handle, workspace, root)

  // Run setup over a single persistent shell so `cd`/exports persist across
  // serial steps. Parallel groups fork the shell's current cwd+env into
  // concurrent one-shot exec calls.
  const ranSetup: Array<string> = []
  const plan = buildSetupPlan(workspace.setup)
  if (plan.length > 0) {
    const shell = await createBootstrapShell(handle, { cwd: root })
    try {
      for (const group of plan) {
        if (group.kind === 'serial') {
          const result = await shell.run(group.command)
          if (result.exitCode !== 0) {
            const tail = result.stdout.trim().slice(-1500)
            throw new Error(
              `setup step failed: ${group.command} (exit ${result.exitCode})${tail ? `\n${tail}` : ''}`,
            )
          }
          ranSetup.push(group.command)
        } else {
          const { cwd, env } = await shell.forkState()
          const results = await Promise.all(
            group.commands.map((command) =>
              handle.process
                .exec(command, {
                  cwd,
                  env,
                  ...(options.signal ? { signal: options.signal } : {}),
                })
                .then((res) => ({ command, res })),
            ),
          )
          const failed = results.find((entry) => entry.res.exitCode !== 0)
          if (failed !== undefined) {
            const tail = `${failed.res.stdout}\n${failed.res.stderr}`
              .trim()
              .slice(-1500)
            throw new Error(
              `setup step failed: ${failed.command} (exit ${failed.res.exitCode})${tail ? `\n${tail}` : ''}`,
            )
          }
          ranSetup.push(...group.commands)
        }
      }
    } finally {
      await shell.dispose()
    }
  }

  return { packageManager, ranSetup }
}
