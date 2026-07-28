import { Client } from '@run-cloud/sdk'
import { RUN_CLOUD_CAPS, RunCloudHandle } from './handle'
import type { CreateSandboxOptions, Sandbox } from '@run-cloud/sdk'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxRestoreInput,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface RunCloudSandboxConfig {
  /** Run Cloud API key. Falls back to `RUN_CLOUD_API_KEY`. */
  apiKey?: string
  /** API origin override. Falls back to `RUN_CLOUD_API_URL`. */
  apiUrl?: string
  /** OCI image. Defaults to `runcloud/agent-base`. */
  image?: string
  /** Reserved CPU cores. Defaults to 2. */
  cpu?: number
  /** Memory in MiB. Defaults to 4096. */
  memory?: number
  /** Writable disk quota in GiB. Defaults to 20. */
  disk?: number
  /** Automatically pause after this many idle seconds. Defaults to 300. */
  idlePauseSeconds?: number
  /** Sandbox lifetime in seconds. Defaults to 3600; use 0 to disable. */
  timeoutSeconds?: number
  /** Region for newly created or restored sandboxes. */
  region?: string
  /** Workspace directory inside the microVM. Defaults to `/workspace`. */
  workdir?: string
  /** Lifetime of URLs returned by `ports.connect`, in seconds. */
  tunnelTtlSeconds?: number
}

const DEFAULTS = {
  image: 'runcloud/agent-base',
  cpu: 2,
  memory: 4096,
  disk: 20,
  idlePauseSeconds: 300,
  timeoutSeconds: 3600,
  workdir: '/workspace',
} as const

class RunCloudProvider implements SandboxProvider {
  readonly name = 'run-cloud'
  private readonly client: Client

  constructor(private readonly config: RunCloudSandboxConfig) {
    this.client = new Client({
      ...(config.apiKey === undefined ? {} : { apiKey: config.apiKey }),
      ...(config.apiUrl === undefined ? {} : { apiUrl: config.apiUrl }),
    })
  }

  capabilities(): SandboxCapabilities {
    return RUN_CLOUD_CAPS
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULTS.workdir
  }

  private createOptions(input: SandboxCreateInput): CreateSandboxOptions {
    return {
      image: this.config.image ?? DEFAULTS.image,
      cpu: this.config.cpu ?? DEFAULTS.cpu,
      memory: this.config.memory ?? DEFAULTS.memory,
      disk: this.config.disk ?? DEFAULTS.disk,
      idlePauseSeconds:
        this.config.idlePauseSeconds ?? DEFAULTS.idlePauseSeconds,
      timeoutSeconds: this.config.timeoutSeconds ?? DEFAULTS.timeoutSeconds,
      ...(this.config.region === undefined
        ? {}
        : { region: this.config.region }),
      ...(input.id === undefined
        ? {}
        : { name: input.id, idempotencyKey: input.id }),
    }
  }

  private handle(
    sandbox: Pick<Sandbox, 'id'>,
    env?: Record<string, string>,
  ): RunCloudHandle {
    return new RunCloudHandle({
      client: this.client,
      sandboxId: sandbox.id,
      workdir: this.workdir,
      ...(this.config.tunnelTtlSeconds === undefined
        ? {}
        : { tunnelTtlSeconds: this.config.tunnelTtlSeconds }),
      ...(env === undefined ? {} : { env }),
    })
  }

  private async prepare(
    sandbox: Pick<Sandbox, 'id'>,
    input: Pick<SandboxCreateInput, 'env' | 'signal'>,
  ): Promise<RunCloudHandle> {
    const result = await this.client.sandboxes.exec(
      sandbox.id,
      ['mkdir', '-p', this.workdir],
      {
        cwd: '/',
        ...(input.signal ? { signal: input.signal } : {}),
      },
    )
    if (result.exitCode !== 0) {
      throw new Error(
        `Run Cloud: failed to create workspace directory "${this.workdir}": ${result.stderr || result.stdout}`,
      )
    }
    return this.handle(sandbox, input.env)
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    const sandbox = await this.client.sandboxes.create(
      this.createOptions(input),
    )
    return this.prepare(sandbox, input)
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    try {
      let sandbox = await this.client.sandboxes.get(input.id)
      if (['destroyed', 'destroying', 'interrupted'].includes(sandbox.state))
        return null
      if (['paused', 'stopped'].includes(sandbox.state)) {
        sandbox = await this.client.request<Sandbox>(
          'POST',
          `/run-cloud/sandboxes/${encodeURIComponent(input.id)}/resume`,
          {},
        )
      }
      return this.handle(sandbox)
    } catch {
      return null
    }
  }

  async restoreSnapshot(input: SandboxRestoreInput): Promise<SandboxHandle> {
    const sandbox = await this.client.snapshots.restore(input.snapshotId, {
      cpu: this.config.cpu ?? DEFAULTS.cpu,
      memory: this.config.memory ?? DEFAULTS.memory,
      disk: this.config.disk ?? DEFAULTS.disk,
      ...(this.config.region === undefined
        ? {}
        : { region: this.config.region }),
    })
    return this.prepare(sandbox, input)
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    try {
      await this.client.sandboxes.destroy(input.id)
    } catch {
      // Already destroyed or gone.
    }
  }
}

/**
 * Run Cloud provider — runs harness adapters in isolated Firecracker microVMs.
 * Requires `config.apiKey` or `RUN_CLOUD_API_KEY`.
 */
export function runCloudSandbox(
  config: RunCloudSandboxConfig = {},
): SandboxProvider {
  return new RunCloudProvider(config)
}
