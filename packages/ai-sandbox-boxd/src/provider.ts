import { randomUUID } from 'node:crypto'
import { Boxd, NotFoundError } from '@boxd-sh/sdk'
import { BOXD_CAPS, BoxdHandle, DEFAULT_WORKDIR } from './handle'
import type { BoxdClientLike, BoxdLogger } from './handle'
import type { Machine, MachineConfig, MachineCreateParams } from '@boxd-sh/sdk'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxRestoreInput,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface BoxdSandboxConfig {
  /**
   * boxd API key (`bxd_…`). Falls back to the `BOXD_API_KEY` env var (or a
   * session token in `BOXD_TOKEN`), read by the SDK, when omitted. Inside a
   * boxd machine the SDK authenticates on its own.
   */
  apiKey?: string
  /** API endpoint. Falls back to `BOXD_BASE_URL`, then production. */
  baseUrl?: string
  /**
   * Organization to create machines in. Falls back to `BOXD_ORG`. An API key
   * is fenced to one org, so set this to the org the key was minted for.
   */
  org?: string
  /**
   * Machine size class. boxd resolves memory from it: 1 vCPU/4 GiB,
   * 2 vCPU/8 GiB, 4 vCPU/16 GiB. Defaults to the org's default size.
   */
  vcpu?: 1 | 2 | 4
  /**
   * boxd snapshot (name or id) to boot new sandboxes from, instead of the
   * default image. Bake one after `setup` and every later create skips it.
   */
  fromSnapshot?: string
  /**
   * Working directory inside the machine. The `/workspace` virtual root maps
   * here. Defaults to `/home/boxd/workspace`.
   */
  workdir?: string
  /**
   * Seconds of idleness before the machine suspends to RAM. `0` disables.
   * Defaults to the platform default. Idle means no inbound connection, so a
   * long CPU-only run with nothing talking to the machine counts as idle.
   */
  autoSuspendTimeout?: number
  /**
   * Seconds after start before the machine is destroyed, as a safety net for
   * abandoned sandboxes. `0` (the default) never auto-destroys: a boxd machine
   * is persistent until `destroy()`.
   */
  autoDestroyTimeout?: number
  /** Sink for non-fatal teardown diagnostics (a kill the machine refused). */
  logger?: BoxdLogger
}

const NAME_PREFIX = 'tanstack-ai'

/**
 * Machine name for a sandbox: `tanstack-ai-<id>`, with the id lowercased and
 * anything outside `[a-z0-9-]` folded to `-`. boxd names must start with a
 * lowercase letter (measured: the framework's hex key `3f…` was refused), so
 * the prefix is what makes the deterministic id usable as a name. Names are
 * unique per org.
 */
function machineName(id: string): string {
  return `${NAME_PREFIX}-${id.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`
}

function randomName(): string {
  return machineName(randomUUID().replace(/-/g, '').slice(0, 12))
}

class BoxdProvider implements SandboxProvider {
  readonly name = 'boxd'
  private readonly client: BoxdClientLike
  private readonly org: string | undefined

  constructor(private readonly config: BoxdSandboxConfig) {
    this.client = new Boxd({
      ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
      ...(config.baseUrl !== undefined ? { baseURL: config.baseUrl } : {}),
    })
    this.org = config.org ?? process.env.BOXD_ORG
  }

  capabilities(): SandboxCapabilities {
    return BOXD_CAPS
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULT_WORKDIR
  }

  private machineConfig(fromSnapshot: boolean): MachineConfig | undefined {
    const cfg: MachineConfig = {}
    // A restore keeps the size the snapshot was captured at; boxd refuses
    // per-request sizing there (measured), so `vcpu` only applies to fresh creates.
    if (this.config.vcpu !== undefined && !fromSnapshot)
      cfg.vcpu = this.config.vcpu
    if (this.config.autoSuspendTimeout !== undefined)
      cfg.autoSuspendTimeout = this.config.autoSuspendTimeout
    if (this.config.autoDestroyTimeout !== undefined)
      cfg.autoDestroyTimeout = this.config.autoDestroyTimeout
    return Object.keys(cfg).length ? cfg : undefined
  }

  private createParams(
    name: string,
    fromSnapshot: string | undefined,
  ): MachineCreateParams {
    const config = this.machineConfig(fromSnapshot !== undefined)
    const common = {
      name,
      // Always isolated: the machine runs agent-authored code. Isolation strips
      // the in-VM boxd CLI, the metadata endpoint and org integrations, and
      // keeps the machine off the org's default network. One-way, inherited
      // by forks and snapshot restores. Not configurable on purpose.
      isolated: true as const,
      ...(this.org !== undefined ? { org: this.org } : {}),
      ...(config !== undefined ? { config } : {}),
    }
    return fromSnapshot === undefined ? common : { ...common, fromSnapshot }
  }

  private handle(machine: Machine, env?: Record<string, string>): BoxdHandle {
    return new BoxdHandle({
      client: this.client,
      machine,
      ...(this.org !== undefined ? { org: this.org } : {}),
      workdir: this.workdir,
      ...(this.config.logger !== undefined
        ? { logger: this.config.logger }
        : {}),
      ...(env !== undefined ? { env } : {}),
    })
  }

  /**
   * Turn a just-created machine into a handle: wait until exec works (`create`
   * returns as soon as the machine is scheduled), make the workdir, inject env.
   * The SDK cannot cancel an in-flight create, so on any failure here,
   * including an abort that landed mid-call, the machine is deleted rather
   * than left running with no one holding its id.
   */
  private async adopt(
    machine: Machine,
    input: { env?: Record<string, string>; signal?: AbortSignal },
  ): Promise<SandboxHandle> {
    try {
      input.signal?.throwIfAborted()
      const ready = await this.client.machines.waitUntilReady(machine.id)
      const handle = this.handle(ready, input.env)
      // From `/`: the workdir does not exist yet, and every handle exec `cd`s
      // into its cwd first.
      const mkdir = await handle.process.exec(`mkdir -p ${q(this.workdir)}`, {
        cwd: '/',
      })
      if (mkdir.exitCode !== 0) {
        throw new Error(
          `boxd: failed to create workspace directory "${this.workdir}" (exit ${mkdir.exitCode}): ${mkdir.stderr.trim()}`,
        )
      }
      return handle
    } catch (error) {
      await this.client.machines.delete(machine.id).catch(() => undefined)
      throw error
    }
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    input.signal?.throwIfAborted()
    // Honor the deterministic id ensure() supplies (see SandboxCreateInput.id):
    // the machine's public URL is keyed by name, so an out-of-band reconnect
    // (a preview iframe) lands on the machine the agent is editing. A second
    // create under a taken name is a ConflictError.
    const name = input.id === undefined ? randomName() : machineName(input.id)
    const machine = await this.client.machines.create(
      this.createParams(name, this.config.fromSnapshot),
    )
    return this.adopt(machine, input)
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    input.signal?.throwIfAborted()
    let machine: Machine
    try {
      machine = await this.client.machines.get(input.id)
    } catch (error) {
      if (error instanceof NotFoundError) return null
      throw error
    }
    // A deleted machine keeps a record, with status `destroyed`. The record
    // takes under a second to flip after `delete`; a resume inside that window
    // returns a handle whose first exec fails with NotFoundError ("VM is
    // destroyed"), and the next resume sees `destroyed`.
    if (machine.status === 'destroyed') return null
    // Every parked state needs its own explicit call: the readiness probe
    // gates on status before it runs an exec, so it never wakes anything on
    // its own. Measured: stopped -> start 2.2 s, hibernated -> wake 1.2 s,
    // suspended -> resume sub-second; left to the probe, a suspended machine
    // timed out after 90 s and a hibernated one took 84 s.
    if (machine.status === 'stopped' || machine.status === 'failed') {
      await this.client.machines.start(machine.id)
    } else if (machine.status === 'hibernated') {
      await this.client.machines.wake(machine.id)
    } else if (machine.status === 'suspended') {
      await this.client.machines.resume(machine.id)
    }
    if (machine.status !== 'running') {
      machine = await this.client.machines.waitUntilReady(machine.id)
    }
    return this.handle(machine)
  }

  async restoreSnapshot(input: SandboxRestoreInput): Promise<SandboxHandle> {
    input.signal?.throwIfAborted()
    const machine = await this.client.machines.create(
      this.createParams(randomName(), input.snapshotId),
    )
    return this.adopt(machine, input)
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    input.signal?.throwIfAborted()
    try {
      await this.client.machines.delete(input.id)
    } catch (error) {
      // Already gone is success; anything else must surface so the caller does
      // not believe a still-running machine was destroyed.
      if (!(error instanceof NotFoundError)) throw error
    }
  }
}

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * boxd sandbox provider: runs harness adapters inside isolated boxd KVM
 * microVMs through the uniform `SandboxHandle`. Needs a boxd API key
 * (`config.apiKey` or the `BOXD_API_KEY` env var) and the org it belongs to
 * (`config.org` or `BOXD_ORG`).
 */
export function boxdSandbox(config: BoxdSandboxConfig = {}): SandboxProvider {
  return new BoxdProvider(config)
}
