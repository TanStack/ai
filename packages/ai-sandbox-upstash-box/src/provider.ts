import { Box } from '@upstash/box'
import { UPSTASH_BOX_CAPS, UpstashBoxHandle } from './handle'
import type { PublicUrlAuth } from './handle'
import type { BoxConfig, BoxSize, Runtime } from '@upstash/box'
import type {
  SandboxCapabilities,
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
    return cfg
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    // Best-effort: the Box SDK can't cancel an in-flight create/snapshot, so we
    // only pre-flight check the signal here.
    input.signal?.throwIfAborted()
    // Pass the caller's deterministic id through as the box name so it becomes
    // a stable, addressable label (Box.getByName === Box.get).
    const boxConfig = this.boxConfig({ env: input.env, name: input.id })
    const box = this.config.snapshot
      ? await Box.fromSnapshot(this.config.snapshot, boxConfig)
      : await Box.create(boxConfig)
    return new UpstashBoxHandle({
      box,
      publicUrlAuth: this.config.publicUrlAuth,
    })
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    input.signal?.throwIfAborted()
    try {
      const box = await Box.get(input.id, this.connection)
      return new UpstashBoxHandle({
        box,
        publicUrlAuth: this.config.publicUrlAuth,
      })
    } catch {
      // Gone / not found.
      return null
    }
  }

  async restoreSnapshot(input: SandboxRestoreInput): Promise<SandboxHandle> {
    input.signal?.throwIfAborted()
    const box = await Box.fromSnapshot(
      input.snapshotId,
      this.boxConfig({ env: input.env }),
    )
    return new UpstashBoxHandle({
      box,
      publicUrlAuth: this.config.publicUrlAuth,
    })
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    input.signal?.throwIfAborted()
    try {
      const box = await Box.get(input.id, this.connection)
      await box.delete()
    } catch {
      // Already deleted / gone.
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
