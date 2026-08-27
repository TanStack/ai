import { getSandbox } from '@cloudflare/sandbox'
import { CLOUDFLARE_CAPS, CloudflareHandle } from './handle'
import type { Sandbox, SandboxTransport } from '@cloudflare/sandbox'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

const DEFAULT_WORKDIR = '/workspace'

export interface CloudflareSandboxConfig {
  binding: DurableObjectNamespace<Sandbox>
  /** Working directory inside the container. Defaults to `/workspace`. */
  workdir?: string
  previewHostname?: string
  transport?: SandboxTransport
}

class CloudflareProvider implements SandboxProvider {
  readonly name = 'cloudflare'

  constructor(private readonly config: CloudflareSandboxConfig) {}

  capabilities(): SandboxCapabilities {
    return CLOUDFLARE_CAPS
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULT_WORKDIR
  }

  // `transport: 'rpc'` by default so `sandbox.tunnels` (preview URLs) works; must be
  // identical across every `getSandbox()` for an id, so all three paths share this.
  private get sandboxOptions(): { transport: SandboxTransport } {
    return { transport: this.config.transport ?? 'rpc' }
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    const id = input.id ?? crypto.randomUUID()
    const sandbox = getSandbox(this.config.binding, id, this.sandboxOptions)
    if (input.env && Object.keys(input.env).length > 0) {
      await sandbox.setEnvVars(input.env)
    }
    await sandbox.mkdir(this.workdir, { recursive: true })
    return new CloudflareHandle(
      id,
      sandbox,
      this.workdir,
      this.config.previewHostname,
    )
  }

  resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    const sandbox = getSandbox(
      this.config.binding,
      input.id,
      this.sandboxOptions,
    )
    return Promise.resolve(
      new CloudflareHandle(
        input.id,
        sandbox,
        this.workdir,
        this.config.previewHostname,
      ),
    )
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    const sandbox = getSandbox(
      this.config.binding,
      input.id,
      this.sandboxOptions,
    )
    await sandbox.destroy()
  }
}

export function cloudflareSandbox(
  config: CloudflareSandboxConfig,
): SandboxProvider {
  return new CloudflareProvider(config)
}
