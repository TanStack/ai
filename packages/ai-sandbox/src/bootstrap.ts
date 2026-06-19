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
import { resolveAllSecrets } from './secrets'
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
      })
    }
  }
  // 'local' is provider-pre-populated at create; 'none' starts empty.

  const packageManager = await detectPackageManager(handle, workspace, root)

  const ranSetup: Array<string> = []
  for (const group of buildSetupPlan(workspace.setup)) {
    if (group.kind === 'serial') {
      await handle.process.exec(group.command, { cwd: root, signal: options.signal })
      ranSetup.push(group.command)
    } else {
      await Promise.all(
        group.commands.map((cmd) =>
          handle.process.exec(cmd, { cwd: root, signal: options.signal }),
        ),
      )
      ranSetup.push(...group.commands)
    }
  }

  return { packageManager, ranSetup }
}
