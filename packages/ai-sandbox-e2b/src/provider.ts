import { Sandbox, SandboxNotFoundError } from 'e2b'
import { DEFAULT_WORKDIR, E2B_CAPS, E2BHandle } from './handle'
import type { SandboxOpts } from 'e2b'
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

export interface E2BSandboxConfig {
  /**
   * E2B API key. Falls back to the `E2B_API_KEY` env var (read by the SDK)
   * when omitted.
   */
  apiKey?: string
  /** E2B domain override (defaults to the SDK default / `E2B_DOMAIN`, `e2b.app`). */
  domain?: string
  /** E2B API URL override (defaults to the SDK default / `E2B_API_URL`). */
  apiUrl?: string
  /**
   * Sandbox template name or ID to create sandboxes from. Defaults to the SDK
   * default (`base`).
   */
  template?: string
  /**
   * Sandbox lifetime in milliseconds. E2B kills (or pauses, see `onTimeout`)
   * the sandbox when it elapses; resume extends it by the same amount. Defaults
   * to 30 minutes. E2B caps this at 1 hour on Hobby and 24 hours on Pro plans.
   */
  timeoutMs?: number
  /**
   * What E2B does when `timeoutMs` elapses. `'kill'` (default) destroys the
   * sandbox so an abandoned run cannot keep billing. `'pause'` keeps its
   * filesystem and memory so a later `resume` reconnects to the same sandbox.
   */
  onTimeout?: 'kill' | 'pause'
  /**
   * Working directory inside the sandbox. The `/workspace` virtual root maps
   * here. Defaults to `/home/user/workspace` (`/workspace` itself is not
   * writable by the sandbox user).
   */
  workdir?: string
  /** Extra metadata attached to every created sandbox (visible in the E2B dashboard). */
  metadata?: Record<string, string>
  /**
   * Whether sandbox ports are reachable without a token. Defaults to E2B's
   * default (`true`). Set `false` to gate every preview URL behind the
   * `e2b-traffic-access-token` header that `ports.connect` then returns.
   */
  allowPublicTraffic?: boolean
}

/** Metadata key carrying the deterministic id `ensure()` passes to `create`. */
export const INSTANCE_KEY_METADATA = 'tanstack-ai-key'

const DEFAULT_TIMEOUT_MS = 30 * 60_000

/**
 * The SDK sends the API key as a header to `apiUrl`, so a plain-http URL would
 * leak it. Loopback is allowed for the SDK's own debug server.
 */
function assertHttps(apiUrl: string): void {
  const url = new URL(apiUrl)
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !loopback) {
    throw new Error(
      `e2b: apiUrl must use https (got ${url.protocol}//${url.host}); the API key travels in a request header.`,
    )
  }
}

/**
 * `Sandbox.create` that rejects promptly on abort. The SDK's `signal` only
 * cancels the HTTP request, so an accepted create would leave a billed sandbox
 * nobody holds the id for. On abort the caller is released at once, and the
 * sandbox is killed whenever the create eventually settles.
 */
async function createSandbox(
  opts: SandboxOpts,
  signal: AbortSignal | undefined,
): Promise<Sandbox> {
  signal?.throwIfAborted()
  const creation = Sandbox.create(opts)
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
      void creation.then((sandbox) => sandbox.kill()).catch(() => undefined)
    }
    throw error
  }
}

class E2BProvider implements SandboxProvider {
  readonly name = 'e2b'

  constructor(private readonly config: E2BSandboxConfig) {
    if (config.apiUrl !== undefined) assertHttps(config.apiUrl)
  }

  capabilities(): SandboxCapabilities {
    return E2B_CAPS
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULT_WORKDIR
  }

  private get timeoutMs(): number {
    return this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /** Connection options common to every SDK call. */
  private get connection(): Pick<SandboxOpts, 'apiKey' | 'domain' | 'apiUrl'> {
    const opts: Pick<SandboxOpts, 'apiKey' | 'domain' | 'apiUrl'> = {}
    if (this.config.apiKey !== undefined) opts.apiKey = this.config.apiKey
    if (this.config.domain !== undefined) opts.domain = this.config.domain
    if (this.config.apiUrl !== undefined) opts.apiUrl = this.config.apiUrl
    return opts
  }

  private createOpts(input: {
    /** Template or snapshot id to create from; defaults to `config.template`. */
    template?: string
    id?: string
    env?: Record<string, string>
    policy?: SandboxPolicy
  }): SandboxOpts {
    const metadata: Record<string, string> = { ...this.config.metadata }
    // E2B mints its own sandbox id, so the deterministic key rides along as
    // metadata: `Sandbox.list({ query: { metadata } })` can find it again.
    if (input.id !== undefined) metadata[INSTANCE_KEY_METADATA] = input.id
    const template = input.template ?? this.config.template
    return {
      ...this.connection,
      ...(template !== undefined ? { template } : {}),
      timeoutMs: this.timeoutMs,
      metadata,
      ...(input.env !== undefined && Object.keys(input.env).length > 0
        ? { envs: input.env }
        : {}),
      // The contract's network gate is coarse (allow/ask/deny): only an explicit
      // deny maps, onto E2B's "no internet" switch.
      ...(input.policy?.capabilities?.network === 'deny'
        ? { allowInternetAccess: false }
        : {}),
      ...(this.config.allowPublicTraffic !== undefined
        ? { network: { allowPublicTraffic: this.config.allowPublicTraffic } }
        : {}),
      lifecycle: { onTimeout: this.config.onTimeout ?? 'kill' },
    }
  }

  /**
   * A fresh sandbox has no workdir yet, and every handle command runs in it.
   * `makeDir` is a native call (no cwd of its own), so it is safe here. Any
   * failure, or an abort that landed meanwhile, kills the sandbox.
   */
  private async prepare(
    sandbox: Sandbox,
    signal: AbortSignal | undefined,
  ): Promise<SandboxHandle> {
    try {
      await sandbox.files.makeDir(this.workdir)
    } catch (error) {
      await sandbox.kill().catch(() => undefined)
      throw error
    }
    if (signal?.aborted === true) {
      await sandbox.kill().catch(() => undefined)
      signal.throwIfAborted()
    }
    return new E2BHandle({
      sandbox,
      workdir: this.workdir,
      timeoutMs: this.timeoutMs,
    })
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    const sandbox = await createSandbox(
      this.createOpts({
        ...(input.id !== undefined ? { id: input.id } : {}),
        ...(input.env !== undefined ? { env: input.env } : {}),
        ...(input.policy !== undefined ? { policy: input.policy } : {}),
      }),
      input.signal,
    )
    return this.prepare(sandbox, input.signal)
  }

  async restoreSnapshot(input: SandboxRestoreInput): Promise<SandboxHandle> {
    // `SandboxRestoreInput` carries a policy too. Dropping it would restore a
    // snapshot taken under `network: 'deny'` into a sandbox with open egress.
    const sandbox = await createSandbox(
      this.createOpts({
        template: input.snapshotId,
        ...(input.env !== undefined ? { env: input.env } : {}),
        ...(input.policy !== undefined ? { policy: input.policy } : {}),
      }),
      input.signal,
    )
    // The snapshot already contains the workdir; `makeDir` is idempotent.
    return this.prepare(sandbox, input.signal)
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    input.signal?.throwIfAborted()
    try {
      // `connect` resumes a paused sandbox and extends a running one's
      // timeout when the new value is longer.
      const sandbox = await Sandbox.connect(input.id, {
        ...this.connection,
        timeoutMs: this.timeoutMs,
        ...(input.signal !== undefined ? { signal: input.signal } : {}),
      })
      return new E2BHandle({
        sandbox,
        workdir: this.workdir,
        timeoutMs: this.timeoutMs,
      })
    } catch (error) {
      // Killed or expired sandboxes are gone; anything else (auth, transport)
      // must surface so `ensure()` does not silently create a duplicate.
      if (error instanceof SandboxNotFoundError) return null
      throw error
    }
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    input.signal?.throwIfAborted()
    // Resolves `false` for a sandbox that is already gone; that is success.
    await Sandbox.kill(input.id, {
      ...this.connection,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    })
  }
}

/**
 * E2B sandbox provider — runs harness adapters inside isolated E2B cloud
 * sandboxes through the uniform `SandboxHandle`. Requires an E2B API key
 * (`config.apiKey` or the `E2B_API_KEY` env var).
 */
export function e2bSandbox(config: E2BSandboxConfig = {}): SandboxProvider {
  return new E2BProvider(config)
}
