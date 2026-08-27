import { APIError, Sandbox } from '@vercel/sandbox'
import { VERCEL_CAPS, VercelHandle } from './handle'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface VercelSandboxConfig {
  token?: string
  /** Vercel team id. Falls back to `VERCEL_TEAM_ID`. */
  teamId?: string
  /** Vercel project id. Falls back to `VERCEL_PROJECT_ID`. */
  projectId?: string
  /** Runtime image, e.g. `node24`, `node22`, `python3.13`. Defaults to `node24`. */
  runtime?: string
  /** Sandbox lifetime in milliseconds before it is stopped automatically. */
  timeout?: number
  /** Ports to expose; reachable from the host via `ports.connect(port)`. */
  ports?: Array<number>
  persistent?: boolean
  workdir?: string
}

const DEFAULT_WORKDIR = '/vercel/sandbox'
const DEFAULT_RUNTIME = 'node24'
const USER_AGENT_TOKEN = '@tanstack/ai'

export function withSandboxUserAgent(
  inner: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers)
    const existing = headers.get('user-agent')
    headers.set(
      'user-agent',
      existing ? `${existing} ${USER_AGENT_TOKEN}` : USER_AGENT_TOKEN,
    )
    return inner(input, { ...init, headers })
  }
}

export function isDirAlreadyExistsError(error: unknown): boolean {
  if (!(error instanceof APIError)) return false
  if (error.response.status !== 400) return false
  const json: unknown = error.json
  const detail =
    typeof json === 'object' &&
    json !== null &&
    'error' in json &&
    typeof json.error === 'object' &&
    json.error !== null &&
    'message' in json.error &&
    typeof json.error.message === 'string'
      ? json.error.message
      : error.message
  return /exists/i.test(detail)
}

class VercelProvider implements SandboxProvider {
  readonly name = 'vercel'

  private readonly fetch = withSandboxUserAgent()

  constructor(private readonly config: VercelSandboxConfig) {}

  capabilities(): SandboxCapabilities {
    return VERCEL_CAPS
  }

  private get workdir(): string {
    return this.config.workdir ?? DEFAULT_WORKDIR
  }

  private get ports(): Array<number> {
    return this.config.ports ?? []
  }

  /** Auth overrides shared by create/get/stop, omitting undefined fields. */
  private auth(): { token?: string; teamId?: string; projectId?: string } {
    const out: { token?: string; teamId?: string; projectId?: string } = {}
    const token = this.config.token ?? process.env.VERCEL_TOKEN
    const teamId = this.config.teamId ?? process.env.VERCEL_TEAM_ID
    const projectId = this.config.projectId ?? process.env.VERCEL_PROJECT_ID
    if (token) out.token = token
    if (teamId) out.teamId = teamId
    if (projectId) out.projectId = projectId
    return out
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    const sandbox = await Sandbox.create({
      ...this.auth(),
      fetch: this.fetch,
      runtime: this.config.runtime ?? DEFAULT_RUNTIME,
      ...(this.config.timeout !== undefined
        ? { timeout: this.config.timeout }
        : {}),
      ...(this.ports.length ? { ports: this.ports } : {}),
      ...(this.config.persistent !== undefined
        ? { persistent: this.config.persistent }
        : {}),
      ...(input.env ? { env: input.env } : {}),
    })
    try {
      await sandbox.mkDir(this.workdir)
    } catch (error) {
      if (!isDirAlreadyExistsError(error)) throw error
    }
    return new VercelHandle({
      sandbox,
      workdir: this.workdir,
      ports: this.ports,
    })
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    try {
      const sandbox = await Sandbox.get({
        name: input.id,
        ...this.auth(),
        fetch: this.fetch,
      })
      return new VercelHandle({
        sandbox,
        workdir: this.workdir,
        ports: this.ports,
      })
    } catch {
      // Gone / not found / expired.
      return null
    }
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    try {
      const sandbox = await Sandbox.get({
        name: input.id,
        ...this.auth(),
        fetch: this.fetch,
      })
      await sandbox.stop()
    } catch {
      // Already stopped / gone.
    }
  }
}

export function vercelSandbox(
  config: VercelSandboxConfig = {},
): SandboxProvider {
  return new VercelProvider(config)
}
