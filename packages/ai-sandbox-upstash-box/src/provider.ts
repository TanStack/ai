import { Box, BoxError } from '@upstash/box'
import { UPSTASH_BOX_CAPS, UpstashBoxHandle } from './handle'
import type { PublicUrlAuth } from './handle'
import type { BoxConfig, BoxSize, Runtime } from '@upstash/box'
import type {
  SandboxCapabilities,
  SandboxPolicy,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxRestoreInput,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface UpstashBoxSandboxConfig {
  /**
   * Upstash Box API key. Falls back to the `UPSTASH_BOX_API_KEY` env var (read
   * by the SDK) when omitted.
   */
  apiKey?: string
  /** Base URL of the Box API (defaults to the SDK default / `UPSTASH_BOX_BASE_URL`). */
  baseUrl?: string
  /** Runtime image for created boxes. Defaults to `node`. */
  runtime?: Runtime
  /** Resource size for created boxes. Defaults to Box's default (`small`). */
  size?: BoxSize
  /**
   * Keep the box alive instead of allowing pause-based idle lifecycle. Defaults
   * to `false` (Box's default): avoids billing a perpetually-running box and
   * keeps `pause()` available. Set `true` to prevent auto-pause mid-run — note
   * this bills continuously and disables pausing.
   */
  keepAlive?: boolean
  /**
   * Base snapshot id to create the box from. `BoxConfig` has no snapshot field,
   * so this is forwarded to `Box.fromSnapshot` instead of `Box.create`.
   */
  snapshot?: string
  /** Human-readable name for created boxes (also honors {@link SandboxCreateInput.id}). */
  name?: string
  /** Auth to request when minting public URLs via `ports.connect`. */
  publicUrlAuth?: PublicUrlAuth
}

const DEFAULT_RUNTIME: Runtime = 'node'

/**
 * Measured against the API: a missing box and a deleted box both answer 404
 * ("Box not found" / "Box has been deleted"). Anything else, notably 401 for a
 * bad key, is a real failure and must not be reported as "gone" — that would
 * silently create a duplicate box on an auth blip or a transport error.
 */
function isGone(error: unknown): boolean {
  return error instanceof BoxError && error.statusCode === 404
}

class UpstashBoxProvider implements SandboxProvider {
  readonly name = 'upstash-box'

  constructor(private readonly config: UpstashBoxSandboxConfig) {}

  capabilities(): SandboxCapabilities {
    return UPSTASH_BOX_CAPS
  }

  /** Connection options common to every static Box call. */
  private get connection(): { apiKey?: string; baseUrl?: string } {
    const opts: { apiKey?: string; baseUrl?: string } = {}
    if (this.config.apiKey !== undefined) opts.apiKey = this.config.apiKey
    if (this.config.baseUrl !== undefined) opts.baseUrl = this.config.baseUrl
    return opts
  }

  private boxConfig(input?: {
    env?: Record<string, string>
    name?: string
    policy?: SandboxPolicy
  }): BoxConfig {
    const cfg: BoxConfig = {
      ...this.connection,
      runtime: this.config.runtime ?? DEFAULT_RUNTIME,
      keepAlive: this.config.keepAlive ?? false,
    }
    if (this.config.size !== undefined) cfg.size = this.config.size
    // The caller's deterministic id (input.name) wins over a static config
    // label so ensure()'s reconstructable id is honored.
    const name = input?.name ?? this.config.name
    if (name !== undefined) cfg.name = name
    if (input?.env !== undefined) cfg.env = input.env
    // The contract's network gate is coarse (allow/ask/deny), so only an
    // explicit deny maps; Box's domain/CIDR allowlists have no contract surface.
    if (input?.policy?.capabilities?.network === 'deny') {
      cfg.networkPolicy = { mode: 'deny-all' }
    }
    return cfg
  }

  /**
   * Carry a live box's actual network policy into the config a fork will reuse.
   *
   * `boxConfig` is what `fork()` hands to `Box.fromSnapshot`, and a snapshot
   * does not inherit the parent's policy, so a resumed deny-all box would come
   * back open one fork later. The live box is the authority here: the caller's
   * create-time policy is not part of a resume input.
   */
  private withLivePolicy(
    box: Awaited<ReturnType<typeof Box.create>>,
    base: BoxConfig,
  ): BoxConfig {
    const policy = box.networkPolicy
    if (policy === undefined) return base
    return { ...base, networkPolicy: policy }
  }

  /**
   * The SDK cannot cancel an in-flight create, so a caller that aborts mid-call
   * would otherwise leave a billed box nobody holds the id for. Reconcile by
   * deleting what we just made, then honour the abort.
   */
  private async settleAbort(
    box: Awaited<ReturnType<typeof Box.create>>,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    if (signal?.aborted !== true) return
    await box.delete().catch(() => undefined)
    signal.throwIfAborted()
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    // Best-effort: the SDK can't cancel an in-flight call.
    input.signal?.throwIfAborted()
    // The caller's deterministic id becomes the box name (Box.getByName === Box.get).
    const boxConfig = this.boxConfig({
      env: input.env,
      name: input.id,
      ...(input.policy ? { policy: input.policy } : {}),
    })
    const box = this.config.snapshot
      ? await Box.fromSnapshot(this.config.snapshot, boxConfig)
      : await Box.create(boxConfig)
    await this.settleAbort(box, input.signal)
    return new UpstashBoxHandle({
      box,
      boxConfig,
      publicUrlAuth: this.config.publicUrlAuth,
    })
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    input.signal?.throwIfAborted()
    try {
      const box = await Box.get(input.id, this.connection)
      // `Box.get` resolves for a DELETED box; only `getStatus` reports the
      // tombstone. Without this probe a destroyed box resumes as a live handle.
      await box.getStatus()
      return new UpstashBoxHandle({
        box,
        boxConfig: this.withLivePolicy(box, this.boxConfig()),
        publicUrlAuth: this.config.publicUrlAuth,
      })
    } catch (error) {
      if (isGone(error)) return null
      throw error
    }
  }

  async restoreSnapshot(input: SandboxRestoreInput): Promise<SandboxHandle> {
    input.signal?.throwIfAborted()
    // `SandboxRestoreInput` carries a policy too. Dropping it would restore a
    // snapshot taken under `network: 'deny'` into a box with default egress.
    const boxConfig = this.boxConfig({
      env: input.env,
      ...(input.policy ? { policy: input.policy } : {}),
    })
    const box = await Box.fromSnapshot(input.snapshotId, boxConfig)
    await this.settleAbort(box, input.signal)
    return new UpstashBoxHandle({
      box,
      boxConfig: this.withLivePolicy(box, boxConfig),
      publicUrlAuth: this.config.publicUrlAuth,
    })
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    input.signal?.throwIfAborted()
    try {
      const box = await Box.get(input.id, this.connection)
      await box.delete()
    } catch (error) {
      // Already gone is success; anything else must surface so the caller does
      // not believe a still-running box was destroyed.
      if (!isGone(error)) throw error
    }
  }
}

/**
 * Upstash Box sandbox provider — runs harness adapters inside isolated Upstash
 * Box cloud sandboxes through the uniform `SandboxHandle`. Requires an Upstash
 * Box API key (`config.apiKey` or the `UPSTASH_BOX_API_KEY` env var).
 */
export function upstashBoxSandbox(
  config: UpstashBoxSandboxConfig = {},
): SandboxProvider {
  return new UpstashBoxProvider(config)
}
