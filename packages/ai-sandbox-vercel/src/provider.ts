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
  /**
   * Vercel access token. Falls back to the `VERCEL_TOKEN` / `VERCEL_OIDC_TOKEN`
   * env vars (read by the SDK) when omitted.
   */
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
  /**
   * Create a persistent (named) sandbox that survives `stop()` and can be
   * reconnected with `resume({ id })`. Defaults to false (ephemeral), in which
   * case `resume` resolves null once the sandbox has stopped.
   */
  persistent?: boolean
  /**
   * Working directory inside the sandbox. The `/workspace` virtual root maps
   * here. Defaults to `/vercel/sandbox`.
   */
  workdir?: string
}

const DEFAULT_WORKDIR = '/vercel/sandbox'
const DEFAULT_RUNTIME = 'node24'

/**
 * True when `error` is the Vercel SDK's "directory already exists" failure — an
 * {@link APIError} with HTTP 400 whose body reports an `EEXIST`-style message.
 * Used to make the non-idempotent native `mkDir` safe to call on a workdir that
 * may already exist (notably the default `/vercel/sandbox`).
 */
export function isDirAlreadyExistsError(error: unknown): boolean {
  if (!(error instanceof APIError) || error.response.status !== 400)
    return false
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
    if (this.config.token !== undefined) out.token = this.config.token
    if (this.config.teamId !== undefined) out.teamId = this.config.teamId
    if (this.config.projectId !== undefined)
      out.projectId = this.config.projectId
    return out
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    const sandbox = await Sandbox.create({
      ...this.auth(),
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
    // Ensure the workspace dir exists via the native (cwd-independent) mkDir —
    // running a command with a not-yet-existing `cwd` would fail, so we must not
    // route this through the handle (which runs every command in `workdir`).
    //
    // The SDK's `mkDir` is NOT idempotent: it returns HTTP 400 (`file_error` /
    // "File exists") when the target already exists, and the default workdir
    // `/vercel/sandbox` ships in the runtime image — so a fresh sandbox already
    // has it. Treat an "already exists" failure as success; rethrow anything else.
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
      const sandbox = await Sandbox.get({ name: input.id, ...this.auth() })
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
      const sandbox = await Sandbox.get({ name: input.id, ...this.auth() })
      await sandbox.stop()
    } catch {
      // Already stopped / gone.
    }
  }
}

/**
 * Vercel Sandbox provider — runs harness adapters inside isolated Vercel
 * microVMs. Requires a Vercel access token (`config.token` or the
 * `VERCEL_TOKEN` / `VERCEL_OIDC_TOKEN` env var) plus team/project scope.
 */
export function vercelSandbox(
  config: VercelSandboxConfig = {},
): SandboxProvider {
  return new VercelProvider(config)
}
