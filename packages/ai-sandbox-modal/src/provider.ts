import { ModalClient, NotFoundError } from 'modal'
import { MODAL_CAPS, ModalHandle } from './handle'
import { withCleanupFailure } from './errors'
import type { Sandbox } from 'modal'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface ModalSandboxConfig {
  tokenId?: string
  tokenSecret?: string
  environment?: string
  appName: string
  image?: string
  workdir?: string
  timeoutMs?: number
  ports?: Array<number>
}

const DEFAULT_IMAGE = 'node:24-slim'
const DEFAULT_WORKDIR = '/workspace'
const DEFAULT_TIMEOUT_MS = 30 * 60_000

class ModalProvider implements SandboxProvider {
  readonly name = 'modal'
  private readonly client: ModalClient

  constructor(private readonly config: ModalSandboxConfig) {
    this.client = new ModalClient({
      ...(config.tokenId ? { tokenId: config.tokenId } : {}),
      ...(config.tokenSecret ? { tokenSecret: config.tokenSecret } : {}),
      ...(config.environment ? { environment: config.environment } : {}),
    })
  }

  capabilities(): SandboxCapabilities {
    return MODAL_CAPS
  }

  private async prepareHandle(
    sandbox: Sandbox,
    signal: AbortSignal | undefined,
  ): Promise<ModalHandle> {
    try {
      signal?.throwIfAborted()
      await sandbox.filesystem.makeDirectory(this.workdir)
      signal?.throwIfAborted()
      return this.makeHandle(sandbox)
    } catch (error) {
      try {
        await sandbox.terminate()
      } catch (cleanupError) {
        throw withCleanupFailure(error, cleanupError)
      }
      throw error
    }
  }

  private makeHandle(sandbox: Sandbox): ModalHandle {
    return new ModalHandle({
      sandbox,
      workdir: this.workdir,
      ports: this.ports,
    })
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULT_WORKDIR
  }

  private get ports(): Array<number> {
    return this.config.ports ?? []
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    input.signal?.throwIfAborted()
    const app = await this.client.apps.fromName(this.config.appName, {
      createIfMissing: true,
    })
    input.signal?.throwIfAborted()
    const image = this.client.images.fromRegistry(
      this.config.image ?? DEFAULT_IMAGE,
    )
    const creating = this.client.sandboxes.create(app, image, {
      command: ['sleep', 'infinity'],
      workdir: this.workdir,
      timeoutMs: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ...(input.env ? { env: input.env } : {}),
      ...(input.id !== undefined ? { name: input.id } : {}),
      ...(this.ports.length ? { encryptedPorts: this.ports } : {}),
      ...(input.policy?.capabilities?.network === 'deny'
        ? { blockNetwork: true }
        : {}),
    })
    let sandbox: Sandbox
    try {
      sandbox = await creating
    } catch (error) {
      input.signal?.throwIfAborted()
      throw error
    }
    return this.prepareHandle(sandbox, input.signal)
  }

  private async findSandbox(id: string): Promise<Sandbox | null> {
    try {
      return await this.client.sandboxes.fromId(id)
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error
    }

    try {
      return await this.client.sandboxes.fromName(this.config.appName, id, {
        ...(this.config.environment
          ? { environment: this.config.environment }
          : {}),
      })
    } catch (error) {
      if (error instanceof NotFoundError) return null
      throw error
    }
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    input.signal?.throwIfAborted()
    const sandbox = await this.findSandbox(input.id)
    input.signal?.throwIfAborted()
    return sandbox ? this.makeHandle(sandbox) : null
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    input.signal?.throwIfAborted()
    const sandbox = await this.findSandbox(input.id)
    input.signal?.throwIfAborted()
    await sandbox?.terminate()
  }
}

export function modalSandbox(config: ModalSandboxConfig): SandboxProvider {
  return new ModalProvider(config)
}
