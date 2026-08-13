import { Daytona } from '@daytona/sdk'
import { DAYTONA_CAPS, DaytonaHandle } from './handle'
import type {
  CreateSandboxFromSnapshotParams,
  DaytonaConfig,
} from '@daytona/sdk'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxRestoreInput,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface DaytonaSandboxConfig {
  /**
   * Daytona API key. Falls back to the `DAYTONA_API_KEY` env var (read by the
   * SDK) when omitted.
   */
  apiKey?: string
  /** Daytona API URL override (defaults to the SDK default / `DAYTONA_API_URL`). */
  apiUrl?: string
  /** Target region for created sandboxes (e.g. `eu`, `us`). */
  target?: string
  /** Snapshot/image to create the sandbox from (forwarded to `daytona.create`). */
  snapshot?: string
  /** Language preset for created sandboxes. Defaults to `typescript`. */
  language?: CreateSandboxFromSnapshotParams['language']
  /**
   * Working directory inside the sandbox. The `/workspace` virtual root maps
   * here. Defaults to `/home/daytona/workspace`.
   */
  workdir?: string
  /**
   * Minutes of idle time before Daytona stops the sandbox. `0` turns auto-stop
   * off. Daytona defaults to 15 minutes when this is omitted.
   */
  autoStopInterval?: number
  /**
   * When true, Daytona deletes the sandbox as soon as it stops.
   */
  ephemeral?: boolean
}

const DEFAULT_WORKDIR = '/home/daytona/workspace'

/** POSIX single-quote escape for embedding a path in a shell command. */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

class DaytonaProvider implements SandboxProvider {
  readonly name = 'daytona'
  private readonly daytona: Daytona

  constructor(private readonly config: DaytonaSandboxConfig) {
    const daytonaConfig: DaytonaConfig = {}
    if (config.apiKey !== undefined) daytonaConfig.apiKey = config.apiKey
    if (config.apiUrl !== undefined) daytonaConfig.apiUrl = config.apiUrl
    if (config.target !== undefined) daytonaConfig.target = config.target
    this.daytona = new Daytona(daytonaConfig)
  }

  capabilities(): SandboxCapabilities {
    return DAYTONA_CAPS
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULT_WORKDIR
  }

  /**
   * A fresh Daytona sandbox has no workdir yet. Create it with the sandbox's
   * DEFAULT cwd (the home dir) — `executeCommand` with a not-yet-existing
   * `cwd` fails inside the toolbox ("fork/exec …: no such file or directory"),
   * so we must NOT route this through the handle (which runs every command in
   * `workdir`). After this, every cwd-bound command works.
   */
  private async wrapCreated(
    sandbox: Awaited<ReturnType<Daytona['create']>>,
  ): Promise<SandboxHandle> {
    await sandbox.process.executeCommand(`mkdir -p ${shQuote(this.workdir)}`)
    return new DaytonaHandle({ sandbox, workdir: this.workdir })
  }

  private createParams(input: {
    snapshot?: string
    id?: string
    policy?: SandboxCreateInput['policy']
  }): CreateSandboxFromSnapshotParams {
    return {
      language: this.config.language ?? 'typescript',
      ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {}),
      ...(input.id !== undefined ? { name: input.id } : {}),
      ...(this.config.autoStopInterval !== undefined
        ? { autoStopInterval: this.config.autoStopInterval }
        : {}),
      ...(this.config.ephemeral !== undefined
        ? { ephemeral: this.config.ephemeral }
        : {}),
      ...(input.policy?.capabilities?.network === 'deny'
        ? { networkBlockAll: true }
        : {}),
    }
  }

  private async wrapReady(
    sandbox: Awaited<ReturnType<Daytona['create']>>,
    env?: Record<string, string>,
  ): Promise<SandboxHandle> {
    const handle = await this.wrapCreated(sandbox)
    if (env !== undefined) await handle.env.set(env)
    return handle
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    const sandbox = await this.daytona.create(
      this.createParams({
        snapshot: this.config.snapshot,
        id: input.id,
        policy: input.policy,
      }),
    )
    return this.wrapReady(sandbox, input.env)
  }

  async restoreSnapshot(input: SandboxRestoreInput): Promise<SandboxHandle> {
    const sandbox = await this.daytona.create(
      this.createParams({
        snapshot: input.snapshotId,
        policy: input.policy,
      }),
    )
    return this.wrapReady(sandbox, input.env)
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    try {
      const sandbox = await this.daytona.get(input.id)
      // Idle sandboxes auto-stop. get() still returns them, but exec fails
      // until they are started again.
      if (sandbox.state === 'stopped' || sandbox.state === 'archived') {
        await sandbox.start()
      }
      return new DaytonaHandle({ sandbox, workdir: this.workdir })
    } catch {
      // Gone / not found.
      return null
    }
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    try {
      const sandbox = await this.daytona.get(input.id)
      await this.daytona.delete(sandbox)
    } catch {
      // Already deleted / gone.
    }
  }
}

/**
 * Daytona sandbox provider — runs harness adapters inside isolated Daytona
 * cloud sandboxes. Requires a Daytona API key (`config.apiKey` or the
 * `DAYTONA_API_KEY` env var).
 */
export function daytonaSandbox(
  config: DaytonaSandboxConfig = {},
): SandboxProvider {
  return new DaytonaProvider(config)
}
