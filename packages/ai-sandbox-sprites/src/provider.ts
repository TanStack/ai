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
  apiKey?: string
  apiUrl?: string
  workdir?: string
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

  private get urlAuth(): SpriteUrlAuth {
    return this.config.urlAuth ?? 'public'
  }

  private handle(sprite: { name: string; url: string }): SpritesHandle {
    return new SpritesHandle({
      client: this.client,
      name: sprite.name,
      url: sprite.url,
      workdir: this.workdir,
      httpPort: this.httpPort,
      urlAuth: this.urlAuth,
    })
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    const name =
      input.id ??
      `${NAME_PREFIX}-${randomUUID().replace(/-/g, '').slice(0, 12)}`
    const sprite = await this.client.createSprite(name, {
      ...(this.config.waitForCapacity !== undefined
        ? { waitForCapacity: this.config.waitForCapacity }
        : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    })

    if (sprite.urlAuth !== this.urlAuth) {
      await this.client.setUrlAuth(sprite.name, this.urlAuth, input.signal)
    }

    const mkdir = this.client.exec(sprite.name, {
      argv: ['mkdir', '-p', this.workdir],
      cwd: '/',
      ...(input.signal ? { signal: input.signal } : {}),
    })
    const code = await mkdir.wait()
    if (code !== 0) {
      throw new Error(
        `Sprites: failed to create workspace directory "${this.workdir}" (exit ${code}).`,
      )
    }

    const handle = this.handle(sprite)
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

export function spritesSandbox(
  config: SpritesSandboxConfig = {},
): SandboxProvider {
  return new SpritesProvider(config)
}
