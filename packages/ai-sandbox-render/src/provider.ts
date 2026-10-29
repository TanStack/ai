import {
  ClientError,
  Render,
  SandboxCreateWaitError,
  SandboxNotRunningError,
} from '@renderinc/sdk'
import { DEFAULT_WORKDIR, RENDER_CAPS, RenderHandle } from './handle'
import type {
  SandboxCreateInput as RenderCreateInput,
  SandboxNetworkPolicy,
  SandboxPlan,
  SandboxSnapshotKind,
  SandboxesClient,
} from '@renderinc/sdk'
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

export interface RenderSandboxConfig {
  /** Render API key. Omit to let the SDK read `RENDER_API_KEY`. */
  token?: string
  /** Workspace id (`tea-…`). Omit to let the SDK read `RENDER_WORKSPACE_ID`. */
  ownerId?: `tea-${string}`
  /** Pre-built SDK sandboxes client (tests, custom base URL). Set `token` and `ownerId` on it; passing them here too throws. */
  client?: SandboxesClient
  /**
   * Sandbox group to create in. Defaults to the workspace's default group.
   * Snapshots restore only inside the group they were captured in.
   */
  sandboxGroupId?: string
  /** Compute plan, e.g. `'2c-4g'`. Render defaults to `'1c-2g'`. */
  plan?: SandboxPlan | (string & {})
  /** Maximum continuous runtime in seconds. Render defaults to 86400 (24 h). */
  timeoutSeconds?: number
  /** Idle seconds before the sandbox suspends; `0` disables. Render defaults to 900. */
  idleTimeoutSeconds?: number
  /**
   * Egress when the TanStack policy allows network, e.g. an `allow-list`.
   * Defaults to `allow-all`. `policy.capabilities.network: 'deny'` always
   * sends `deny-all`.
   */
  networkPolicy?: SandboxNetworkPolicy
  /** Boot every new sandbox from this Render sandbox build (a custom image). */
  buildName?: string
  /** Boot every new sandbox from this named snapshot. */
  snapshotName?: string
  /**
   * What `handle.snapshot()` captures. `filesystem` (default) restores onto
   * any plan; `runtime` also keeps memory and processes but needs the same plan.
   */
  snapshotKind?: SandboxSnapshotKind
  /** Directory the `/workspace` virtual root maps to. Defaults to `/workspace`. */
  workdir?: string
}

/** How long `create` waits for the sandbox to reach `running` (measured: under 2 s). */
const CREATE_WAIT_MS = 120_000

/** Statuses a sandbox never comes back from. */
const ENDED = new Set(['errored', 'terminated'])

function networkPolicy(
  config: RenderSandboxConfig,
  policy: SandboxPolicy | undefined,
): SandboxNetworkPolicy | undefined {
  if (policy?.capabilities?.network === 'deny') return { type: 'deny-all' }
  return config.networkPolicy
}

/** 404 for an unknown sandbox, 400 for a malformed id (measured): both are gone. */
function isMissing(error: unknown): boolean {
  return (
    error instanceof ClientError &&
    (error.statusCode === 404 || error.statusCode === 400)
  )
}

class RenderProvider implements SandboxProvider {
  readonly name = 'render'
  private readonly client: SandboxesClient

  constructor(private readonly config: RenderSandboxConfig) {
    if (config.buildName !== undefined && config.snapshotName !== undefined) {
      throw new Error('render: pass either buildName or snapshotName, not both')
    }
    // A pre-built client carries its own auth; these would be silently ignored.
    if (
      config.client !== undefined &&
      (config.token !== undefined || config.ownerId !== undefined)
    ) {
      throw new Error(
        'render: set token and ownerId on your client, not alongside it',
      )
    }
    this.client =
      config.client ??
      new Render({
        ...(config.token !== undefined ? { token: config.token } : {}),
        ...(config.ownerId !== undefined ? { ownerId: config.ownerId } : {}),
      }).sandboxes
  }

  capabilities(): SandboxCapabilities {
    return RENDER_CAPS
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULT_WORKDIR
  }

  private handle(id: string): RenderHandle {
    return new RenderHandle({
      client: this.client,
      id,
      workdir: this.workdir,
      snapshotKind: this.config.snapshotKind ?? 'filesystem',
    })
  }

  /**
   * Create, wait for `running`, then create the workdir. Any failure after
   * Render minted the sandbox, or an abort that landed meanwhile, terminates
   * it so it does not bill until its timeout.
   */
  private async boot(
    input: RenderCreateInput,
    signal: AbortSignal | undefined,
  ): Promise<SandboxHandle> {
    signal?.throwIfAborted()
    const c = this.config
    let id: string | undefined
    try {
      const sandbox = await this.client.create({
        ...input,
        ...(c.sandboxGroupId !== undefined
          ? { sandboxGroupId: c.sandboxGroupId }
          : {}),
        ...(c.plan !== undefined ? { plan: c.plan } : {}),
        ...(c.timeoutSeconds !== undefined
          ? { timeoutSeconds: c.timeoutSeconds }
          : {}),
        ...(c.idleTimeoutSeconds !== undefined
          ? { idleTimeoutSeconds: c.idleTimeoutSeconds }
          : {}),
        wait: { timeoutMs: CREATE_WAIT_MS, ...(signal ? { signal } : {}) },
      })
      id = sandbox.id
      const handle = this.handle(id)
      await handle.fs.mkdir(this.workdir)
      signal?.throwIfAborted()
      return handle
    } catch (error) {
      id ??=
        error instanceof SandboxCreateWaitError ? error.sandboxId : undefined
      if (id !== undefined) {
        await this.client.terminate(id).catch(() => undefined)
      }
      if (signal?.aborted) throw signal.reason
      throw error
    }
  }

  create(input: SandboxCreateInput): Promise<SandboxHandle> {
    // Render mints opaque `sbx-…` ids and has no labels to carry `input.id`,
    // so it is ignored (the contract allows it); persist the returned id.
    const c = this.config
    const policy = networkPolicy(c, input.policy)
    const source =
      c.snapshotName !== undefined
        ? { snapshotName: c.snapshotName }
        : c.buildName !== undefined
          ? { buildName: c.buildName }
          : {}
    return this.boot(
      {
        ...source,
        ...(policy ? { networkPolicy: policy } : {}),
        ...(input.env !== undefined ? { env: input.env } : {}),
      },
      input.signal,
    )
  }

  restoreSnapshot(input: SandboxRestoreInput): Promise<SandboxHandle> {
    // Env and network policy are not part of a snapshot (measured: create-time
    // env is gone after restore), so both are reapplied here.
    const policy = networkPolicy(this.config, input.policy)
    return this.boot(
      {
        snapshotId: input.snapshotId,
        ...(policy ? { networkPolicy: policy } : {}),
        ...(input.env !== undefined ? { env: input.env } : {}),
      },
      input.signal,
    )
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    input.signal?.throwIfAborted()
    let status: string
    try {
      status = (await this.client.get(input.id, undefined, input.signal)).status
    } catch (error) {
      // Missing is gone. Auth and transport errors must surface so `ensure()`
      // does not silently create a duplicate of a live sandbox.
      if (isMissing(error)) return null
      throw error
    }
    if (ENDED.has(status)) return null
    if (status === 'creating' || status === 'resuming') {
      try {
        await this.client.waitUntilRunning(input.id, {
          ...(input.signal ? { signal: input.signal } : {}),
        })
      } catch (error) {
        // It can end while we wait; the SDK throws instead of returning it.
        if (
          error instanceof SandboxNotRunningError &&
          ENDED.has(error.sandboxStatus)
        ) {
          return null
        }
        throw error
      }
    }
    // A suspended sandbox resumes on the next exec or file call.
    return this.handle(input.id)
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    input.signal?.throwIfAborted()
    try {
      // Terminating an already-terminated sandbox succeeds (measured).
      await this.client.terminate(input.id)
    } catch (error) {
      if (isMissing(error)) return
      throw error
    }
  }
}

/**
 * Render sandbox provider — runs harness adapters inside Render sandboxes
 * through the uniform `SandboxHandle`. Reads `RENDER_API_KEY` and
 * `RENDER_WORKSPACE_ID` through the SDK when `token` / `ownerId` are omitted.
 */
export function renderSandbox(
  config: RenderSandboxConfig = {},
): SandboxProvider {
  return new RenderProvider(config)
}
