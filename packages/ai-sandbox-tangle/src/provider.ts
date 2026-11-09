import { Sandbox } from '@tangle-network/sandbox'
import {
  DEFAULT_WORKDIR,
  TANGLE_CAPS,
  TangleHandle,
  parseSnapshotRefId,
  q,
} from './handle'
import type {
  CreateSandboxOptions,
  EgressPolicy,
  SandboxInstance,
  SandboxResources,
} from '@tangle-network/sandbox'
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

export interface TangleSandboxConfig {
  /** Tangle API key. Falls back to the `TANGLE_API_KEY` env var when omitted. */
  apiKey?: string
  /** Sandbox API URL. Defaults to `https://sandbox.tangle.tools`. */
  baseUrl?: string
  /**
   * A catalog environment or a container image reference (for example
   * `node:22`). Defaults to the platform's default environment.
   */
  environment?: string
  /** CPU cores, memory and disk. Defaults to the platform's default size. */
  resources?: Pick<SandboxResources, 'cpuCores' | 'memoryMB' | 'diskGB'>
  /**
   * Seconds of run time before the platform suspends the sandbox. The
   * workspace is kept, and `resume` starts it again.
   */
  maxLifetimeSeconds?: number
  /** Seconds without activity before the platform suspends the sandbox. */
  idleTimeoutSeconds?: number
  /**
   * Outbound network policy. Defaults to `{ mode: 'open' }`.
   * `policy.capabilities.network: 'deny'` always wins with `{ mode: 'blocked' }`.
   */
  egressPolicy?: EgressPolicy
  /**
   * Working directory inside the sandbox. The `/workspace` virtual root maps
   * here. Defaults to `/home/agent/workspace`.
   */
  workdir?: string
  /** Extra metadata attached to every created sandbox. */
  metadata?: Record<string, string>
}

/** Metadata key carrying the deterministic id `ensure()` passes to `create`. */
export const INSTANCE_KEY_METADATA = 'tanstack-ai-key'

const DEFAULT_BASE_URL = 'https://sandbox.tangle.tools'

/**
 * The SDK sends the API key as a header to `baseUrl`, so a plain-http URL
 * would leak it. Loopback is allowed for a local API.
 */
function assertHttps(baseUrl: string): void {
  const url = new URL(baseUrl)
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !loopback) {
    throw new Error(
      `tangle: baseUrl must use https (got ${url.protocol}//${url.host}); the API key travels in a request header.`,
    )
  }
}

/** A deleted sandbox can still be read for a while; it is gone for `resume`. */
const GONE_STATUSES = new Set(['deleted', 'failed'])

/**
 * `client.create` that rejects promptly on abort. The SDK takes no signal, so
 * an accepted create would leave a billed sandbox nobody holds the id for. On
 * abort the caller is released at once, and the sandbox is deleted whenever
 * the create settles.
 */
async function createSandbox(
  client: Sandbox,
  options: CreateSandboxOptions,
  signal: AbortSignal | undefined,
): Promise<SandboxInstance> {
  signal?.throwIfAborted()
  const creation = client.create(options)
  if (!signal) return creation
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    })
  })
  try {
    return await Promise.race([creation, aborted])
  } catch (error) {
    if (signal.aborted) {
      void creation.then((sandbox) => sandbox.delete()).catch(() => undefined)
    }
    throw error
  }
}

class TangleProvider implements SandboxProvider {
  readonly name = 'tangle'
  private sdk: Sandbox | undefined

  constructor(private readonly config: TangleSandboxConfig) {}

  capabilities(): SandboxCapabilities {
    return TANGLE_CAPS
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULT_WORKDIR
  }

  /** Built on first use, so a provider can be constructed without a key. */
  private get client(): Sandbox {
    if (this.sdk) return this.sdk
    const apiKey = this.config.apiKey ?? process.env.TANGLE_API_KEY
    if (!apiKey) {
      throw new Error(
        'tangle: no API key. Pass `apiKey` or set the TANGLE_API_KEY env var.',
      )
    }
    const baseUrl = this.config.baseUrl ?? DEFAULT_BASE_URL
    assertHttps(baseUrl)
    this.sdk = new Sandbox({ apiKey, baseUrl })
    return this.sdk
  }

  private createOptions(input: {
    id?: string
    policy?: SandboxPolicy
    snapshot?: { sandboxId: string; snapshotId: string }
  }): CreateSandboxOptions {
    const metadata: Record<string, string> = { ...this.config.metadata }
    // Tangle mints its own sandbox id, so the deterministic key rides along
    // as metadata.
    if (input.id !== undefined) metadata[INSTANCE_KEY_METADATA] = input.id
    const { resources } = this.config
    return {
      // No model credentials, coding-agent backend or startup scripts: the
      // workspace brings its own.
      agent: false,
      // Nor the account's stored secrets. The API refuses `isolated` on a
      // restore (measured: 400 VALIDATION_ERROR), so a restore inherits.
      ...(input.snapshot === undefined
        ? { ownerContext: 'isolated' as const }
        : {}),
      ...(this.config.environment !== undefined
        ? { environment: this.config.environment }
        : {}),
      ...(resources !== undefined ? { resources } : {}),
      ...(this.config.maxLifetimeSeconds !== undefined
        ? { maxLifetimeSeconds: this.config.maxLifetimeSeconds }
        : {}),
      ...(this.config.idleTimeoutSeconds !== undefined
        ? { idleTimeoutSeconds: this.config.idleTimeoutSeconds }
        : {}),
      // The contract's network gate is coarse (allow/ask/deny): only an
      // explicit deny maps, onto egress mode `blocked`.
      egressPolicy:
        input.policy?.capabilities?.network === 'deny'
          ? { mode: 'blocked' }
          : (this.config.egressPolicy ?? { mode: 'open' }),
      metadata,
      ...(input.snapshot !== undefined
        ? {
            fromSnapshot: input.snapshot.snapshotId,
            fromSandboxId: input.snapshot.sandboxId,
          }
        : {}),
    }
  }

  /**
   * Wait until the sandbox runs and make the workdir. Any failure, or an abort
   * that landed meanwhile, deletes the sandbox.
   */
  private async prepare(
    sandbox: SandboxInstance,
    env: Record<string, string> | undefined,
    signal: AbortSignal | undefined,
  ): Promise<SandboxHandle> {
    const handle = new TangleHandle({
      sandbox,
      workdir: this.workdir,
      ...(env !== undefined ? { env } : {}),
    })
    try {
      await sandbox.waitFor('running', signal ? { signal } : {})
      // Not through the handle: its commands run in the workdir, which does
      // not exist yet.
      const r = await sandbox.exec(
        `mkdir -p -- ${q(this.workdir)}`,
        signal ? { signal } : {},
      )
      if (r.exitCode !== 0) {
        throw new Error(`tangle: could not create ${this.workdir}: ${r.stderr}`)
      }
    } catch (error) {
      await sandbox.delete().catch(() => undefined)
      throw error
    }
    if (signal?.aborted === true) {
      await sandbox.delete().catch(() => undefined)
      signal.throwIfAborted()
    }
    return handle
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    const sandbox = await createSandbox(
      this.client,
      this.createOptions({
        ...(input.id !== undefined ? { id: input.id } : {}),
        ...(input.policy !== undefined ? { policy: input.policy } : {}),
      }),
      input.signal,
    )
    // Env stays in the handle and travels with each command; it is not
    // sent at create.
    return this.prepare(sandbox, input.env, input.signal)
  }

  async restoreSnapshot(input: SandboxRestoreInput): Promise<SandboxHandle> {
    // `SandboxRestoreInput` carries a policy too. Dropping it would restore a
    // snapshot taken under `network: 'deny'` into a sandbox with open egress.
    const sandbox = await createSandbox(
      this.client,
      this.createOptions({
        snapshot: parseSnapshotRefId(input.snapshotId),
        ...(input.policy !== undefined ? { policy: input.policy } : {}),
      }),
      input.signal,
    )
    return this.prepare(sandbox, input.env, input.signal)
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    const { signal } = input
    signal?.throwIfAborted()
    const sandbox = await this.client.get(input.id)
    if (sandbox === null || GONE_STATUSES.has(sandbox.status)) return null
    // A stopped or expired sandbox kept its workspace; start it again.
    if (sandbox.status === 'stopped' || sandbox.status === 'expired') {
      await sandbox.resume(signal ? { signal } : {})
    }
    await sandbox.waitFor('running', signal ? { signal } : {})
    return new TangleHandle({ sandbox, workdir: this.workdir })
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    input.signal?.throwIfAborted()
    const sandbox = await this.client.get(input.id)
    if (sandbox === null || sandbox.status === 'deleted') return
    // Resolves `already_absent` for a sandbox that is already gone.
    await sandbox.delete(input.signal ? { signal: input.signal } : {})
  }
}

/**
 * Tangle sandbox provider — runs harness adapters inside isolated Tangle
 * cloud sandboxes through the uniform `SandboxHandle`. Requires a Tangle API
 * key (`config.apiKey` or the `TANGLE_API_KEY` env var).
 */
export function tangleSandbox(
  config: TangleSandboxConfig = {},
): SandboxProvider {
  return new TangleProvider(config)
}
