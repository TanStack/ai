import { randomUUID } from 'node:crypto'
import { RuntaClient } from './client'
import { RUNTA_CAPS, RuntaHandle } from './handle'
import type { RuntaCreateRuntimeOptions, RuntaRuntime } from './client'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDeleteSnapshotInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxPolicy,
  SandboxProvider,
  SandboxRestoreInput,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface RuntaSandboxConfig {
  /** Runta API key (`rt_...`). Falls back to the `RUNTA_TOKEN` env var. */
  apiKey?: string
  /** Runta API endpoint. Falls back to `RUNTA_ENDPOINT`, then `https://api.runta.com`. */
  apiUrl?: string
  /** Runtime image id. Omit for the default image (Ubuntu, with `bash`, `git` and `python3`). */
  image?: string
  /** vCPUs for a new runtime. Runta defaults to 1. */
  vcpus?: number
  /** Memory in MiB for a new runtime. Runta defaults to 1024. */
  memoryMib?: number
  /**
   * Suspend the runtime after this many idle seconds. A suspended runtime
   * bills for disk only, and `resume` wakes it. Without this a runtime runs,
   * and bills, until it is destroyed.
   */
  idleSuspendAfterSecs?: number
  /**
   * Working directory inside the runtime. The `/workspace` virtual root maps
   * here. Defaults to `/workspace`.
   */
  workdir?: string
}

const DEFAULT_WORKDIR = '/workspace'
const NAME_PREFIX = 'tanstack-ai'

class RuntaProvider implements SandboxProvider {
  readonly name = 'runta'
  private readonly client: RuntaClient
  private readonly workdir: string

  constructor(private readonly config: RuntaSandboxConfig) {
    const apiKey = config.apiKey ?? process.env.RUNTA_TOKEN
    if (!apiKey) {
      throw new Error(
        'Runta API key is required. Pass `apiKey` or set the RUNTA_TOKEN environment variable.',
      )
    }
    const endpoint = config.apiUrl ?? process.env.RUNTA_ENDPOINT
    this.client = new RuntaClient({
      apiKey,
      userAgent: 'tanstack-ai-sandbox-runta',
      ...(endpoint ? { endpoint } : {}),
    })
    this.workdir = config.workdir ?? DEFAULT_WORKDIR
  }

  capabilities(): SandboxCapabilities {
    return RUNTA_CAPS
  }

  /** Options shared by a fresh create and a restore. */
  private runtimeOptions(input: {
    policy?: SandboxPolicy
    signal?: AbortSignal
  }): RuntaCreateRuntimeOptions {
    return {
      ...(this.config.idleSuspendAfterSecs !== undefined
        ? {
            idlePolicy: {
              mode: 'suspend_and_wakeup',
              suspendAfterSecs: this.config.idleSuspendAfterSecs,
            },
          }
        : {}),
      // The contract's network gate is coarse: only an explicit `deny` blocks
      // egress. An empty allowlist lets nothing out.
      ...(input.policy?.capabilities?.network === 'deny'
        ? { egressPolicy: { mode: 'allowlist', allowedHosts: [] } }
        : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    }
  }

  private async ready(
    runtime: RuntaRuntime,
    input: { env?: Record<string, string>; signal?: AbortSignal },
  ): Promise<RuntaHandle> {
    // Ensure the workspace dir exists before any cwd-bound command runs in it.
    const mkdir = await this.client.exec(runtime.id, {
      argv: ['mkdir', '-p', this.workdir],
      ...(input.signal ? { signal: input.signal } : {}),
    })
    if (mkdir.exitCode !== 0) {
      throw new Error(
        `Runta: failed to create workspace directory "${this.workdir}": ${mkdir.stderr.trim()}`,
      )
    }
    const handle = this.handle(runtime)
    if (input.env) await handle.env.set(input.env)
    return handle
  }

  private handle(runtime: RuntaRuntime): RuntaHandle {
    return new RuntaHandle({
      client: this.client,
      name: runtime.name,
      runtimeId: runtime.id,
      workdir: this.workdir,
    })
  }

  private randomName(): string {
    return `${NAME_PREFIX}-${randomUUID().replace(/-/g, '').slice(0, 12)}`
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    // Honor the deterministic id ensure() supplies (see SandboxCreateInput.id):
    // a Runta runtime is addressable by its unique name.
    const runtime = await this.client.createRuntime({
      name: input.id ?? this.randomName(),
      ...(this.config.image !== undefined ? { image: this.config.image } : {}),
      ...(this.config.vcpus !== undefined ? { vcpus: this.config.vcpus } : {}),
      ...(this.config.memoryMib !== undefined
        ? { memoryMib: this.config.memoryMib }
        : {}),
      ...this.runtimeOptions(input),
    })
    return this.ready(runtime, input)
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    const runtime = await this.client.findRuntime(input.id, input.signal)
    if (!runtime) return null
    // Exec does not wake a paused or suspended runtime, so do it here.
    return this.handle(
      await this.client.ensureRunning(
        runtime.id,
        input.signal ? { signal: input.signal } : {},
      ),
    )
  }

  /** A checkpoint restores into a NEW runtime, so this works after the source is gone. */
  async restoreSnapshot(input: SandboxRestoreInput): Promise<SandboxHandle> {
    const runtime = await this.client.createRuntime({
      name: this.randomName(),
      checkpointId: input.snapshotId,
      ...this.runtimeOptions(input),
    })
    return this.ready(runtime, input)
  }

  async deleteSnapshot(input: SandboxDeleteSnapshotInput): Promise<void> {
    await this.client.deleteCheckpoint(input.snapshotId, input.signal)
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    await this.client.deleteRuntime(input.id, input.signal)
  }
}

/**
 * Runta sandbox provider. Runs harness adapters inside isolated Runta microVM
 * runtimes. Requires a Runta API key (`config.apiKey` or the `RUNTA_TOKEN` env
 * var).
 */
export function runtaSandbox(config: RuntaSandboxConfig = {}): SandboxProvider {
  return new RuntaProvider(config)
}
