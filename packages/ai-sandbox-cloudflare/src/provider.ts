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
  /**
   * The Sandbox Durable Object namespace binding (e.g. `env.Sandbox`).
   * Available inside a Worker `fetch` handler.
   */
  binding: DurableObjectNamespace<Sandbox>
  /** Working directory inside the container. Defaults to `/workspace`. */
  workdir?: string
  /**
   * Your Worker's request hostname, required by `ports.connect` to expose a
   * preview URL (Cloudflare routes exposed ports by hostname).
   */
  previewHostname?: string
  /**
   * Container-control transport. Defaults to `'rpc'` (the SDK's primary path)
   * because `sandbox.tunnels` — used by `exposePreviewTool` to mint quick-tunnel
   * preview URLs — ONLY exists on the RPC transport; on `'http'`/`'websocket'` it
   * throws "requires the RPC transport". The transport must be the same for every
   * `getSandbox()` of a given id, so this provider applies it to create/resume/
   * destroy alike. Override to `'http'` only if you don't use preview tunnels.
   */
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
    const id = crypto.randomUUID()
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
    // The Durable Object is durable, so the sandbox is always addressable by
    // id. (The container disk may have been wiped on cold start — withSandbox
    // re-bootstraps under the same identity when durableFilesystem is false.)
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

/**
 * Cloudflare sandbox provider — runs harness adapters inside Cloudflare
 * Containers at the edge. Construct it inside a Worker with the Sandbox Durable
 * Object namespace binding. See the stdin/snapshot limitations in `handle.ts`.
 */
export function cloudflareSandbox(
  config: CloudflareSandboxConfig,
): SandboxProvider {
  return new CloudflareProvider(config)
}
