import Dockerode from 'dockerode'
import { DOCKER_CAPS, DockerHandle } from './handle'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxRestoreInput,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface DockerSandboxConfig {
  /** Image to run, e.g. `node:22`. Pulled automatically if absent locally. */
  image: string
  /** Working directory inside the container. Defaults to `/workspace`. */
  workdir?: string
  /** Options forwarded to `new Dockerode(...)` (socketPath, host, port, …). */
  dockerodeOptions?: Dockerode.DockerOptions
  /** Command that keeps the container alive. Defaults to `tail -f /dev/null`. */
  keepAliveCommand?: Array<string>
  /** Container ports to publish to the host (for `ports.connect`). */
  publishPorts?: Array<number>
  /**
   * Add `host.docker.internal:host-gateway` so the container can reach the
   * host (e.g. a host-side MCP tool-bridge). Defaults to true.
   */
  hostGateway?: boolean
  /** Remove the container on destroy (vs. just stop). Defaults to true. */
  removeOnDestroy?: boolean
}

const DEFAULT_WORKDIR = '/workspace'

class DockerProvider implements SandboxProvider {
  readonly name = 'docker'
  private readonly docker: Dockerode

  constructor(private readonly config: DockerSandboxConfig) {
    this.docker = new Dockerode(config.dockerodeOptions)
  }

  capabilities(): SandboxCapabilities {
    return DOCKER_CAPS
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULT_WORKDIR
  }

  private async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect()
      return
    } catch {
      // not present locally — pull it
    }
    const stream = await this.docker.pull(image)
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err) =>
        err ? reject(err) : resolve(),
      )
    })
  }

  private readonly forkFactory = async (
    sourceContainerId: string,
  ): Promise<SandboxHandle> => {
    const source = this.docker.getContainer(sourceContainerId)
    const image = await source.commit({
      repo: 'tanstack-ai-sandbox-fork',
      tag: `${sourceContainerId.slice(0, 12)}-${Date.now()}`,
    })
    const imageRef =
      typeof image.Id === 'string'
        ? image.Id
        : `tanstack-ai-sandbox-fork:latest`
    return this.startContainer(imageRef)
  }

  private async startContainer(
    image: string,
    env?: Record<string, string>,
  ): Promise<SandboxHandle> {
    const exposed: Record<string, Record<string, never>> = {}
    const bindings: Record<string, Array<{ HostPort: string }>> = {}
    for (const port of this.config.publishPorts ?? []) {
      exposed[`${port}/tcp`] = {}
      bindings[`${port}/tcp`] = [{ HostPort: '' }] // let Docker pick a free host port
    }

    const container = await this.docker.createContainer({
      Image: image,
      Cmd: this.config.keepAliveCommand ?? ['sh', '-c', 'tail -f /dev/null'],
      Tty: false,
      WorkingDir: this.workdir,
      Env: env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : undefined,
      ExposedPorts: Object.keys(exposed).length ? exposed : undefined,
      HostConfig: {
        ...(Object.keys(bindings).length ? { PortBindings: bindings } : {}),
        ...(this.config.hostGateway !== false
          ? { ExtraHosts: ['host.docker.internal:host-gateway'] }
          : {}),
      },
    })
    await container.start()

    const handle = new DockerHandle({
      docker: this.docker,
      container,
      workdir: this.workdir,
      forkFactory: this.forkFactory,
      removeOnDestroy: this.config.removeOnDestroy ?? true,
    })
    // Ensure the workspace dir exists.
    await handle.fs.mkdir(this.workdir)
    return handle
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    await this.ensureImage(this.config.image)
    return this.startContainer(this.config.image, input.env)
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    const container = this.docker.getContainer(input.id)
    let info: Dockerode.ContainerInspectInfo
    try {
      info = await container.inspect()
    } catch {
      return null
    }
    if (!info.State.Running) {
      try {
        await container.start()
      } catch {
        return null
      }
    }
    return new DockerHandle({
      docker: this.docker,
      container,
      workdir: this.workdir,
      forkFactory: this.forkFactory,
      removeOnDestroy: this.config.removeOnDestroy ?? true,
    })
  }

  async restoreSnapshot(input: SandboxRestoreInput): Promise<SandboxHandle> {
    return this.startContainer(input.snapshotId, input.env)
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    const container = this.docker.getContainer(input.id)
    try {
      await container.stop({ t: 5 })
    } catch {
      // already stopped / gone
    }
    if (this.config.removeOnDestroy ?? true) {
      try {
        await container.remove({ force: true, v: true })
      } catch {
        // already removed
      }
    }
  }
}

/**
 * Docker sandbox provider — runs harness adapters inside isolated containers.
 * Requires a reachable Docker daemon (local socket by default; override via
 * `dockerodeOptions`).
 */
export function dockerSandbox(config: DockerSandboxConfig): SandboxProvider {
  return new DockerProvider(config)
}
