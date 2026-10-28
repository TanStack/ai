import { UnsupportedCapabilityError } from '@tanstack/ai-sandbox'
import {
  Sandbox,
  SandboxFailedError,
  SandboxNotFoundError,
  SandboxTimeoutError,
} from 'railway'
import { DEFAULT_WORKDIR, RailwayHandle, railwayCapabilities } from './handle'
import type { RailwayForkConfig } from './handle'
import type {
  ConnectOptions,
  CreateOptions,
  SandboxResources,
  SandboxStatus,
  SandboxTemplate,
} from 'railway'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxPolicy,
  SandboxProvider,
  SandboxRestoreInput,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface RailwaySandboxConfig {
  /**
   * Railway token. Omit to let the SDK read `RAILWAY_TOKEN` (project token,
   * selects `project-token` auth) or `RAILWAY_API_TOKEN` (account/workspace
   * token, bearer auth).
   */
  token?: string
  /**
   * Auth header mode for an explicit `token`. An explicit token defaults to
   * `bearer`; pass `'project-token'` when `token` is a project token.
   */
  authType?: CreateOptions['authType']
  /**
   * Environment the sandboxes, checkpoints and forks live in. Defaults to
   * `RAILWAY_ENVIRONMENT_ID`; one of the two is required, with either kind of
   * token.
   */
  environmentId?: string
  /** GraphQL endpoint override (defaults to Railway's public API). */
  endpoint?: string
  /** `fetch` implementation passed to the SDK. */
  fetch?: typeof fetch
  /**
   * WebSocket constructor for exec streaming. Defaults to the global
   * `WebSocket` (Node >= 22); pass the `ws` package where none exists.
   */
  webSocketImpl?: CreateOptions['webSocketImpl']
  /** Region to run sandboxes in. Checkpoint restores and forks stay in the source region. */
  region?: string
  /**
   * Minutes of inactivity before Railway destroys the sandbox. Uses the plan
   * default when omitted; `0` disables idle destruction where the plan allows.
   */
  idleTimeoutMinutes?: number
  /**
   * `ISOLATED` (default): no access to the environment's private network
   * (public internet egress still works). `PRIVATE`: joins the environment's
   * private network, so the agent can reach your other Railway services.
   * Required when `ports` is set.
   */
  networkIsolation?: 'ISOLATED' | 'PRIVATE'
  /**
   * Ports to publish as Railway HTTP domains at create time (max 10). Needs
   * `networkIsolation: 'PRIVATE'`. `ports.connect(port)` resolves only these.
   */
  ports?: Array<number>
  /**
   * vCPU and memory per sandbox, e.g. `{ cpu: 2, memoryGB: 4 }`. Omitted fields
   * use the workspace default; values above its maximum fail at create.
   * Applied to creates, checkpoint restores, and forks.
   */
  resources?: SandboxResources
  /** Boot every new sandbox from this named checkpoint instead of the base image. */
  checkpoint?: string
  /** Boot every new sandbox from this `Sandbox.template()` recipe (built on first use). */
  template?: SandboxTemplate
  /** Directory the `/workspace` virtual root maps to. Defaults to `/workspace`. */
  workdir?: string
}

/** Railway statuses a sandbox never comes back from. */
const TERMINAL_STATUSES: ReadonlySet<SandboxStatus> = new Set([
  'DESTROYED',
  'DESTROYING',
  'FAILED',
])

const MAX_PORTS = 10

/** How long `resume` waits for a CREATING sandbox to reach RUNNING. */
const RESUME_READY_TIMEOUT_MS = 60_000
const RESUME_POLL_MS = 1_000

/** The token travels with every request, so only HTTPS (or a loopback dev server) is accepted. */
function validateEndpoint(endpoint: string): void {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error(`railway: invalid endpoint ${endpoint}`)
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error(
      'railway: endpoint must use https (plain http is allowed only for localhost)',
    )
  }
}

function validateConfig(config: RailwaySandboxConfig): void {
  if (config.checkpoint !== undefined && config.template !== undefined) {
    throw new Error('railway: pass either checkpoint or template, not both')
  }
  if (config.endpoint !== undefined) validateEndpoint(config.endpoint)
  const ports = config.ports ?? []
  if (ports.length === 0) return
  if (config.networkIsolation !== 'PRIVATE') {
    throw new Error(
      "railway: ports require networkIsolation: 'PRIVATE'. Railway publishes sandbox domains only for sandboxes on the environment's private network, which also gives the sandbox access to your other services.",
    )
  }
  if (ports.length > MAX_PORTS) {
    throw new Error(`railway: at most ${MAX_PORTS} ports can be published`)
  }
  for (const port of ports) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`railway: invalid port ${port}`)
    }
  }
  if (new Set(ports).size !== ports.length) {
    throw new Error('railway: ports must be unique')
  }
}

/**
 * Railway has no provider-enforced egress deny, so an explicit deny must not
 * be silently dropped.
 */
function assertNoNetworkDeny(policy: SandboxPolicy | undefined): void {
  if (policy?.capabilities?.network === 'deny') {
    throw new UnsupportedCapabilityError(
      'railway',
      'networkPolicy',
      "Railway sandboxes always have public internet egress (ISOLATED only removes private-network access); policy.capabilities.network: 'deny' cannot be enforced.",
    )
  }
}

/**
 * Best-effort destroy of a sandbox the create mutation minted but the SDK gave
 * up waiting on. Without it a never-idle sandbox would bill until deleted.
 */
async function destroyStranded(
  id: string,
  client: ConnectOptions,
): Promise<void> {
  try {
    const sandbox = await Sandbox.connect(id, client)
    await sandbox.destroy()
  } catch {
    // Already gone, or unreachable: nothing more this call can do.
  }
}

/**
 * Reject promptly on abort; destroy a sandbox whose create settles late or
 * fails after the platform minted it. Both destroys are best effort.
 */
async function raceCreate(
  creation: Promise<Sandbox>,
  signal: AbortSignal | undefined,
  client: ConnectOptions,
): Promise<Sandbox> {
  creation = creation.catch(async (error: unknown) => {
    if (
      (error instanceof SandboxTimeoutError && error.resource === 'sandbox') ||
      error instanceof SandboxFailedError
    ) {
      await destroyStranded(error.id, client)
    }
    throw error
  })
  if (!signal) return creation
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    })
    if (signal.aborted) reject(signal.reason)
  })
  try {
    return await Promise.race([creation, aborted])
  } catch (error) {
    if (signal.aborted) {
      void creation.then((sandbox) => sandbox.destroy()).catch(() => undefined)
    }
    throw error
  }
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    // A listener added to an already-aborted signal never fires.
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

class RailwayProvider implements SandboxProvider {
  readonly name = 'railway'

  constructor(private readonly config: RailwaySandboxConfig) {
    validateConfig(config)
  }

  capabilities(): SandboxCapabilities {
    return railwayCapabilities({
      ports: (this.config.ports ?? []).length > 0,
    })
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULT_WORKDIR
  }

  /** Client options common to every SDK call. Frozen per provider. */
  private get client(): ConnectOptions {
    const c = this.config
    return {
      ...(c.token !== undefined ? { token: c.token } : {}),
      ...(c.authType !== undefined ? { authType: c.authType } : {}),
      ...(c.environmentId !== undefined
        ? { environmentId: c.environmentId }
        : {}),
      ...(c.endpoint !== undefined ? { endpoint: c.endpoint } : {}),
      ...(c.fetch !== undefined ? { fetch: c.fetch } : {}),
      ...(c.webSocketImpl !== undefined
        ? { webSocketImpl: c.webSocketImpl }
        : {}),
    }
  }

  /**
   * `fromSnapshot`: booting a checkpoint or template, which runs where its data
   * lives; passing another region would be rejected, so none is sent.
   */
  private createOptions(
    env: Record<string, string> | undefined,
    fromSnapshot: boolean,
  ): CreateOptions {
    const c = this.config
    const ports = c.ports ?? []
    return {
      ...this.client,
      ...(c.region !== undefined && !fromSnapshot ? { region: c.region } : {}),
      ...(c.idleTimeoutMinutes !== undefined
        ? { idleTimeoutMinutes: c.idleTimeoutMinutes }
        : {}),
      ...(c.resources !== undefined ? { resources: c.resources } : {}),
      ...(c.networkIsolation !== undefined
        ? { networkIsolation: c.networkIsolation }
        : {}),
      ...(ports.length > 0 ? { domains: ports.map((port) => ({ port })) } : {}),
      ...(env !== undefined && Object.keys(env).length > 0 ? { env } : {}),
    }
  }

  private forkConfig(
    env: Record<string, string> | undefined,
  ): RailwayForkConfig {
    const c = this.config
    return {
      ...(c.idleTimeoutMinutes !== undefined
        ? { idleTimeoutMinutes: c.idleTimeoutMinutes }
        : {}),
      ...(c.resources !== undefined ? { resources: c.resources } : {}),
      ...(c.networkIsolation !== undefined
        ? { networkIsolation: c.networkIsolation }
        : {}),
      ...(c.ports !== undefined ? { ports: c.ports } : {}),
      ...(env !== undefined ? { env } : {}),
    }
  }

  private handle(
    sandbox: Sandbox,
    env?: Record<string, string>,
  ): RailwayHandle {
    return new RailwayHandle({
      sandbox,
      workdir: this.workdir,
      ...(this.config.ports !== undefined ? { ports: this.config.ports } : {}),
      forkConfig: this.forkConfig(env),
    })
  }

  /**
   * Create the workdir before any cwd-bound command runs (exec fails when its
   * cwd is missing). Any failure, or an abort that landed meanwhile, destroys
   * the sandbox so it does not idle until its timeout.
   */
  private async prepare(
    sandbox: Sandbox,
    env: Record<string, string> | undefined,
    signal: AbortSignal | undefined,
  ): Promise<SandboxHandle> {
    try {
      await sandbox.files.mkdir(this.workdir)
    } catch (error) {
      await sandbox.destroy().catch(() => undefined)
      throw error
    }
    if (signal?.aborted === true) {
      await sandbox.destroy().catch(() => undefined)
      signal.throwIfAborted()
    }
    return this.handle(sandbox, env)
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    input.signal?.throwIfAborted()
    assertNoNetworkDeny(input.policy)
    // Railway mints opaque sandbox ids; `input.id` is not addressable and is
    // ignored (the contract allows it). Persist the returned id instead.
    const options = this.createOptions(
      input.env,
      this.config.checkpoint !== undefined ||
        this.config.template !== undefined,
    )
    const creation =
      this.config.checkpoint !== undefined
        ? Sandbox.create(this.config.checkpoint, options)
        : this.config.template !== undefined
          ? Sandbox.create(this.config.template, options)
          : Sandbox.create(options)
    const sandbox = await raceCreate(creation, input.signal, this.client)
    return this.prepare(sandbox, input.env, input.signal)
  }

  async restoreSnapshot(input: SandboxRestoreInput): Promise<SandboxHandle> {
    input.signal?.throwIfAborted()
    assertNoNetworkDeny(input.policy)
    // A checkpoint is environment-scoped and outlives its source sandbox. The
    // runtime env, network mode, domains and idle timeout are not part of the
    // disk, so they are reapplied from this provider's config.
    const sandbox = await raceCreate(
      Sandbox.create(input.snapshotId, this.createOptions(input.env, true)),
      input.signal,
      this.client,
    )
    return this.prepare(sandbox, input.env, input.signal)
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    input.signal?.throwIfAborted()
    let sandbox: Sandbox
    try {
      sandbox = await Sandbox.connect(input.id, this.client)
    } catch (error) {
      // Missing is gone. Auth and transport errors must surface so `ensure()`
      // does not silently create a duplicate of a live sandbox.
      if (error instanceof SandboxNotFoundError) return null
      throw error
    }
    // `connect` returns tombstones and transitional records too.
    const deadline = Date.now() + RESUME_READY_TIMEOUT_MS
    while (sandbox.status === 'CREATING') {
      if (Date.now() >= deadline) {
        throw new Error(
          `railway: sandbox ${input.id} still CREATING after ${RESUME_READY_TIMEOUT_MS}ms`,
        )
      }
      await sleep(RESUME_POLL_MS, input.signal)
      try {
        await sandbox.refresh()
      } catch (error) {
        if (error instanceof SandboxNotFoundError) return null
        throw error
      }
    }
    if (TERMINAL_STATUSES.has(sandbox.status)) return null
    // Reset the idle countdown so a resumed sandbox is not reaped moments
    // after it is handed back.
    try {
      await sandbox.heartbeat()
    } catch (error) {
      if (error instanceof SandboxNotFoundError) return null
      // Best effort: the next command renews the lifetime too.
    }
    return this.handle(sandbox)
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    input.signal?.throwIfAborted()
    let sandbox: Sandbox
    try {
      sandbox = await Sandbox.connect(input.id, this.client)
    } catch (error) {
      if (error instanceof SandboxNotFoundError) return
      throw error
    }
    if (sandbox.status === 'DESTROYED' || sandbox.status === 'DESTROYING')
      return
    try {
      await sandbox.destroy()
    } catch (error) {
      if (error instanceof SandboxNotFoundError) return
      throw error
    }
  }
}

/**
 * Railway sandbox provider — runs harness adapters inside Railway sandboxes
 * through the uniform `SandboxHandle`. Reads `RAILWAY_TOKEN` /
 * `RAILWAY_API_TOKEN` and `RAILWAY_ENVIRONMENT_ID` through the SDK when the
 * matching config fields are omitted.
 */
export function railwaySandbox(
  config: RailwaySandboxConfig = {},
): SandboxProvider {
  return new RailwayProvider(config)
}
