import { createHash, randomUUID } from 'node:crypto'
import { SandboxInstance, initialize, settings } from '@blaxel/core'
import { BLAXEL_CAPS, BLAXEL_DEFAULT_WORKDIR, BlaxelHandle } from './handle'
import { abortable, errorStatus, isNotFound } from './utils'
import type { SandboxCreateConfiguration } from '@blaxel/core'
import type { BlaxelSandboxLike } from './handle'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface BlaxelSandboxConfig {
  /**
   * Blaxel API key. Falls back to the `BL_API_KEY` environment variable.
   */
  apiKey?: string
  /**
   * Blaxel workspace. Falls back to the `BL_WORKSPACE` environment variable.
   */
  workspace?: string
  /** Sandbox image. Defaults to `blaxel/base-image:latest`. */
  image?: string
  /** Memory in MB. Defaults to 2048. */
  memory?: number
  /** Region to create sandboxes in. Defaults to the workspace default. */
  region?: string
  /**
   * Time to live for created sandboxes (e.g. `30m`, `4h`). Defaults to `1h` so
   * an abandoned run cannot strand a paid sandbox indefinitely. Pass `null` to
   * opt out and manage lifetime yourself.
   */
  ttl?: string | null
  /**
   * Working directory inside the sandbox. The `/workspace` virtual root maps
   * here. Defaults to `/workspace`.
   */
  workdir?: string
  /**
   * Expose `ports.connect()` previews publicly instead of gating them with a
   * preview token. Defaults to false — a token-gated preview is the safe
   * default for agent-generated services.
   */
  publicPreviews?: boolean
  /** TTL for previews `ports.connect()` creates. Defaults to `1h`. */
  previewTtl?: string
}

const DEFAULT_IMAGE = 'blaxel/base-image:latest'
const DEFAULT_MEMORY = 2048
const DEFAULT_TTL = '1h'
const DEFAULT_PREVIEW_TTL = '1h'
const NAME_PREFIX = 'tanstack-ai'
const MAX_NAME_LENGTH = 49
const HASH_SUFFIX_LENGTH = 24
const CREATE_ATTEMPT_LABEL = 'tanstack-ai-create-attempt'
const CREATE_RECONCILE_ATTEMPTS = 30
const CREATE_RECONCILE_INTERVAL_MS = 1000

/**
 * Sandbox states from which no usable handle can be built. `DEPLOYING`,
 * `BUILDING`, `UPLOADING`, and `BUILT` are deliberately absent: those are on
 * their way up, and the first call simply waits for the sandbox to be ready.
 */
const TERMINAL_STATUSES = new Set([
  'DELETING',
  'TERMINATED',
  'TERMINATING',
  'FAILED',
  'DEACTIVATING',
])

export function isTerminal(status?: string): boolean {
  return status !== undefined && TERMINAL_STATUSES.has(status)
}

function mayHaveCreatedSandbox(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const status = errorStatus(error)
  if (status === undefined) return true
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Blaxel sandbox names are DNS-label-ish; keep them short, lower-case, and safe. */
function safeName(value: string): string {
  const lower = value.toLowerCase()
  const normalized = lower
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (
    normalized &&
    normalized === value &&
    normalized.length <= MAX_NAME_LENGTH
  ) {
    return normalized
  }

  // Preserve deterministic ids without letting normalization or truncation
  // collapse two framework keys onto the same paid sandbox.
  const suffix = createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, HASH_SUFFIX_LENGTH)
  const prefixLength = MAX_NAME_LENGTH - HASH_SUFFIX_LENGTH - 1
  const prefix =
    normalized.slice(0, prefixLength).replace(/-$/, '') || NAME_PREFIX
  return `${prefix}-${suffix}`
}

function randomName(): string {
  return `${NAME_PREFIX}-${randomUUID().replace(/-/g, '')}`
}

/**
 * @blaxel/core keeps one credential set in process-global settings. Refuse to
 * overwrite an already configured tenant: doing so could route an existing
 * provider's later requests into a different workspace.
 *
 * This catches a tenant configured through `initialize()` — which is how every
 * other provider in this process gets one. It cannot see a tenant that came
 * from `bl login` (`~/.blaxel/config.yaml`), because the SDK resolves those
 * lazily through its `credentials` getter and never writes `settings.config`.
 * Reading that getter here would force the config-file read (and its
 * `process.env.BL_ENV` mutation) that importing @blaxel/core deliberately
 * avoids, so the narrower check is the right trade: passing explicit
 * credentials to this provider is an explicit request to use them.
 */
function configureBlaxelSdk(apiKey: string, workspace: string): void {
  // A fresh @blaxel/core 0.3.10 install exposes empty strings for its legacy
  // `apikey` and `workspace` defaults. Those mean "not configured", not a
  // conflicting tenant. `initialize()` writes the newer `apiKey` field.
  const configuredKey =
    settings.config.apiKey || settings.config.apikey || undefined
  const configuredWorkspace = settings.config.workspace || undefined
  const configuredClientCredentials = settings.config.clientCredentials
  if (
    (configuredClientCredentials !== undefined &&
      configuredClientCredentials !== '') ||
    (configuredKey !== undefined && configuredKey !== apiKey) ||
    (configuredWorkspace !== undefined && configuredWorkspace !== workspace)
  ) {
    throw new Error(
      '@blaxel/core credentials are process-global. Use one Blaxel API key and workspace per process.',
    )
  }

  // Preserve transport settings an application may have initialized separately.
  initialize({ ...settings.config, apiKey, workspace })
}

class BlaxelProvider implements SandboxProvider {
  readonly name = 'blaxel'

  constructor(private readonly config: BlaxelSandboxConfig) {
    const apiKey = config.apiKey ?? process.env.BL_API_KEY
    if (!apiKey) {
      throw new Error(
        'Blaxel API key is required. Pass `apiKey` or set the BL_API_KEY environment variable.',
      )
    }
    const workspace = config.workspace ?? process.env.BL_WORKSPACE
    if (!workspace) {
      throw new Error(
        'Blaxel workspace is required. Pass `workspace` or set the BL_WORKSPACE environment variable.',
      )
    }
    configureBlaxelSdk(apiKey, workspace)
  }

  capabilities(): SandboxCapabilities {
    return BLAXEL_CAPS
  }

  private get workdir(): string {
    return this.config.workdir ?? BLAXEL_DEFAULT_WORKDIR
  }

  private get previewTtl(): string {
    return this.config.previewTtl ?? DEFAULT_PREVIEW_TTL
  }

  private handle(sandbox: BlaxelSandboxLike, name: string): BlaxelHandle {
    return new BlaxelHandle({
      sandbox,
      name,
      workdir: this.workdir,
      publicPreviews: this.config.publicPreviews ?? false,
      previewTtl: this.previewTtl,
    })
  }

  private createConfiguration(
    name: string,
    attemptId: string,
    input: { env?: Record<string, string> },
  ): SandboxCreateConfiguration {
    const ttl = this.config.ttl === undefined ? DEFAULT_TTL : this.config.ttl
    return {
      name,
      image: this.config.image ?? DEFAULT_IMAGE,
      memory: this.config.memory ?? DEFAULT_MEMORY,
      labels: { [CREATE_ATTEMPT_LABEL]: attemptId },
      ...(this.config.region ? { region: this.config.region } : {}),
      ...(ttl ? { ttl } : {}),
      ...(input.env
        ? {
            envs: Object.entries(input.env).map(([key, value]) => ({
              name: key,
              value,
            })),
          }
        : {}),
    }
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    input.signal?.throwIfAborted()
    // Honor the deterministic id ensure() supplies (see SandboxCreateInput.id).
    // Blaxel addresses sandboxes by name, so an out-of-band reconnect — such as
    // attaching a preview to the sandbox an agent is editing — depends on it.
    const name = input.id ? safeName(input.id) : randomName()
    const attemptId = randomUUID()
    const creation = SandboxInstance.createIfNotExists(
      this.createConfiguration(name, attemptId, input),
    )
    let sandbox: BlaxelSandboxLike | undefined
    try {
      sandbox = await abortable(creation, input.signal)
      return await this.prepare(sandbox, name, input.env, input.signal)
    } catch (error) {
      if (sandbox) {
        await this.cleanupOwnedSandbox(name, attemptId, error, sandbox)
      } else if (input.signal?.aborted) {
        // The SDK does not accept an AbortSignal. Reject the caller promptly,
        // and immediately reconcile the labeled attempt because the SDK promise
        // may never settle. Repeat cleanup when it does settle as a later
        // fallback. A reused same-name sandbox has a different label and is
        // never deleted.
        void this.cleanupOwnedSandbox(name, attemptId, error).catch(
          () => undefined,
        )
        void creation
          .then(
            (created) =>
              this.cleanupOwnedSandbox(name, attemptId, error, created),
            () => this.cleanupOwnedSandbox(name, attemptId, error),
          )
          .catch(() => undefined)
      } else if (mayHaveCreatedSandbox(error)) {
        // @blaxel/core can accept a create, poll after an edge 504, and still
        // throw the original 504. Reconcile the attempt label before returning
        // so ttl:null cannot leave an accepted paid sandbox behind.
        await this.cleanupOwnedSandbox(name, attemptId, error)
      }
      throw error
    }
  }

  /**
   * Make a freshly created sandbox usable: the workspace root must exist before
   * any cwd-bound command runs in it. Blaxel's `mkdir` creates parents and is a
   * native call rather than a shell command, so it needs no working directory of
   * its own — which is what makes it safe to run before the workdir exists.
   */
  private async prepare(
    sandbox: BlaxelSandboxLike,
    name: string,
    env?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<SandboxHandle> {
    await abortable(sandbox.fs.mkdir(this.workdir), signal)
    signal?.throwIfAborted()
    const handle = this.handle(sandbox, name)
    // The sandbox already carries `env` as real environment variables; mirror
    // them into the handle so per-command merging reports the same values.
    if (env) await handle.env.set(env)
    return handle
  }

  private ownsAttempt(sandbox: BlaxelSandboxLike, attemptId: string): boolean {
    return sandbox.metadata?.labels?.[CREATE_ATTEMPT_LABEL] === attemptId
  }

  private async findOwnedSandbox(
    name: string,
    attemptId: string,
  ): Promise<BlaxelSandboxLike | undefined> {
    for (let attempt = 0; attempt < CREATE_RECONCILE_ATTEMPTS; attempt += 1) {
      try {
        const sandbox = await SandboxInstance.get(name)
        return this.ownsAttempt(sandbox, attemptId) ? sandbox : undefined
      } catch (error) {
        if (!isNotFound(error)) throw error
        if (attempt < CREATE_RECONCILE_ATTEMPTS - 1) {
          await sleep(CREATE_RECONCILE_INTERVAL_MS)
        }
      }
    }
    return undefined
  }

  private async cleanupOwnedSandbox(
    name: string,
    attemptId: string,
    originalError: unknown,
    candidate?: BlaxelSandboxLike,
  ): Promise<void> {
    try {
      const owned =
        candidate && this.ownsAttempt(candidate, attemptId)
          ? candidate
          : await this.findOwnedSandbox(name, attemptId)
      if (!owned) return
      try {
        await SandboxInstance.delete(name)
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    } catch (cleanupError) {
      throw new AggregateError(
        [originalError, cleanupError],
        `blaxel: sandbox ${name} failed and its owned create attempt could not be cleaned up.`,
      )
    }
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    input.signal?.throwIfAborted()
    try {
      const sandbox = await abortable(
        SandboxInstance.get(input.id),
        input.signal,
      )
      // A deleted sandbox is not immediately a 404: Blaxel keeps a record in a
      // terminal state first (a single delete leaves it `DELETING`, and only a
      // second one purges it). Reporting that as a live handle would hand the
      // caller a sandbox that is being torn down, so treat every terminal state
      // as gone and let the framework create a fresh one. An unknown or absent
      // status stays resumable rather than failing closed on an unrecognized
      // value.
      if (isTerminal(sandbox.status)) return null
      return this.handle(sandbox, input.id)
    } catch (error) {
      // Only absence is a cache miss. Authentication, authorization, and
      // transport failures must stay visible rather than creating duplicates.
      if (isNotFound(error)) return null
      throw error
    }
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    input.signal?.throwIfAborted()
    try {
      await abortable(SandboxInstance.delete(input.id), input.signal)
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
}

/**
 * Blaxel sandbox provider — runs harness adapters inside isolated Blaxel
 * cloud sandboxes. Requires Blaxel credentials (`config.apiKey` /
 * `config.workspace`, or the `BL_API_KEY` and `BL_WORKSPACE` environment
 * variables).
 */
export function blaxelSandbox(
  config: BlaxelSandboxConfig = {},
): SandboxProvider {
  return new BlaxelProvider(config)
}
