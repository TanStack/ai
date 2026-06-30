import { randomUUID } from 'node:crypto'
import { SpritesClient } from './client'
import { SPRITES_CAPS, SPRITE_DEFAULT_HTTP_PORT, SpritesHandle } from './handle'
import type { SpriteUrlAuth } from './client'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface SpritesSandboxConfig {
  /**
   * Sprites API token (`org/projectNumber/tokenId/secret`). Falls back to the
   * `SPRITES_API_KEY` env var when omitted.
   */
  apiKey?: string
  /**
   * Sprites control-plane base URL. Falls back to `SPRITES_API_URL`, then
   * `https://api.sprites.dev`.
   */
  apiUrl?: string
  /**
   * Working directory inside the Sprite. The `/workspace` virtual root maps
   * here. Defaults to `/home/sprite`.
   */
  workdir?: string
  /**
   * URL auth mode for created Sprites. `'public'` (default) makes the Sprite's
   * URL reachable without an org token — required to reach a service via
   * `ports.connect()`. Use `'sprite'` to keep it org-token gated.
   */
  urlAuth?: SpriteUrlAuth
  /** Internal port proxied to the public URL. Defaults to 8080. */
  httpPort?: number
  /** Block on fleet capacity instead of failing fast when creating a Sprite. */
  waitForCapacity?: boolean
}

const DEFAULT_WORKDIR = '/home/sprite'
const NAME_PREFIX = 'tanstack-ai'

class SpritesProvider implements SandboxProvider {
  readonly name = 'sprites'
  private readonly client: SpritesClient

  constructor(private readonly config: SpritesSandboxConfig) {
    const apiKey = config.apiKey ?? process.env.SPRITES_API_KEY
    if (!apiKey) {
      throw new Error(
        'Sprites API key is required. Pass `apiKey` or set the SPRITES_API_KEY environment variable.',
      )
    }
    const baseUrl = config.apiUrl ?? process.env.SPRITES_API_URL
    this.client = new SpritesClient({
      apiKey,
      ...(baseUrl ? { baseUrl } : {}),
    })
  }

  capabilities(): SandboxCapabilities {
    return SPRITES_CAPS
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULT_WORKDIR
  }

  private get httpPort(): number {
    return this.config.httpPort ?? SPRITE_DEFAULT_HTTP_PORT
  }

  private handle(sprite: {
    name: string
    url: string
  }): SpritesHandle {
    return new SpritesHandle({
      client: this.client,
      name: sprite.name,
      url: sprite.url,
      workdir: this.workdir,
      httpPort: this.httpPort,
    })
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    const name = `${NAME_PREFIX}-${randomUUID().replace(/-/g, '').slice(0, 12)}`
    const sprite = await this.client.createSprite(name, {
      ...(this.config.waitForCapacity !== undefined
        ? { waitForCapacity: this.config.waitForCapacity }
        : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    })

    const urlAuth = this.config.urlAuth ?? 'public'
    if (sprite.urlAuth !== urlAuth) {
      await this.client.setUrlAuth(sprite.name, urlAuth, input.signal)
    }

    // Ensure the workspace dir exists before any cwd-bound command runs in it.
    const handle = this.handle(sprite)
    await handle.fs.mkdir(this.workdir)

    if (input.env) await handle.env.set(input.env)
    return handle
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    try {
      const sprite = await this.client.getSprite(input.id, input.signal)
      return this.handle(sprite)
    } catch {
      // Gone / not found.
      return null
    }
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    await this.client.deleteSprite(input.id, input.signal)
  }
}

/**
 * Sprites sandbox provider — runs harness adapters inside isolated Fly.io
 * Sprite cloud sandboxes ([sprites.dev](https://sprites.dev)). Requires a
 * Sprites API token (`config.apiKey` or the `SPRITES_API_KEY` env var).
 */
export function spritesSandbox(
  config: SpritesSandboxConfig = {},
): SandboxProvider {
  return new SpritesProvider(config)
}
