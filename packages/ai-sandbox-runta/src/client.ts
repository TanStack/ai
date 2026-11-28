/**
 * Thin client over the Runta public API (https://runta.com/docs/).
 *
 * This is the canonical copy. `scripts/sync-ts-client.sh` copies it into each
 * TypeScript adapter (TanStack AI, Mastra, qm), because an upstream package
 * cannot depend on a private one. Edit it here, then sync.
 *
 * It talks REST + the exec WebSocket directly instead of using
 * `@runta/runta-sdk`, because the published SDK has no streaming exec, no
 * stdin writes after start, and no process signals.
 *
 * Dependency-free: uses the global `fetch` and `WebSocket` (undici). The exec
 * socket needs an `Authorization` header on the upgrade request, which undici
 * accepts through a non-standard `headers` constructor option. So this targets
 * Node >= 22.4, not browsers or edge runtimes. Pass `WebSocket` and `fetch` in
 * the config to substitute other implementations (the tests do).
 */

export const RUNTA_DEFAULT_ENDPOINT = 'https://api.runta.com'

/** Runtime lifecycle status, as returned by `GET /v2/runtimes/{id}`. */
export type RuntaRuntimeStatus =
  | 'running'
  | 'paused'
  | 'shutdown'
  | 'creating'
  | 'deleting'
  | 'error'
  | 'crashed'
  | 'suspended'
  | 'unavailable'

export interface RuntaIngressSpec {
  protocol: 'http' | 'https'
  runtimePort: number
  hostnameLabel?: string
}

export type RuntaEgressPolicy =
  | { mode: 'denylist'; deniedHosts: Array<string> }
  | { mode: 'allowlist'; allowedHosts: Array<string> }

export type RuntaIdlePolicy =
  | { mode: 'disabled' }
  | { mode: 'suspend_only'; suspendAfterSecs: number }
  | { mode: 'suspend_and_wakeup'; suspendAfterSecs: number }

/** A Runtime as returned by the API (the fields the adapters use). */
export interface RuntaRuntime {
  /** Stable UUID. */
  id: string
  /**
   * Unique display name. The API addresses a runtime by UUID only; this
   * client resolves a name through the runtime list.
   */
  name: string
  status: RuntaRuntimeStatus
  /**
   * The state the control plane is moving the runtime to. Lifecycle calls
   * return before the change lands, so `status` lags behind this.
   */
  desiredStatus: string
  /** Optimistic-concurrency revision, required by every mutation. */
  revision: number
  ingressSpecs: Array<RuntaIngressSpec>
}

export interface RuntaCheckpoint {
  id: string
  name: string
  kind: string
  state: 'creating' | 'ready' | 'failed'
}

export interface RuntaCreateRuntimeOptions {
  /** Unique display name. */
  name?: string
  /** Runtime image id. Omit for the default image. Ignored on restore. */
  image?: string
  /** Restore from this checkpoint. Always creates a new runtime. */
  checkpointId?: string
  vcpus?: number
  memoryMib?: number
  memoryMaxMib?: number
  diskGib?: number
  /** Non-secret runtime-level environment variables. */
  env?: Record<string, string>
  ingressSpecs?: Array<RuntaIngressSpec>
  egressPolicy?: RuntaEgressPolicy
  idlePolicy?: RuntaIdlePolicy
  /** Shut the runtime down after this many seconds of running. */
  autoShutdownAfterSecs?: number
  /** Delete the runtime this many seconds after creation. */
  autoDeleteAfterSecs?: number
  /** Extra request body fields, sent as-is (snake_case). */
  extra?: Record<string, unknown>
  /** Wait until the runtime is `running`. Defaults to true. */
  wait?: boolean
  /** Max ms to wait for `running`. Defaults to 240s. */
  readyTimeoutMs?: number
  /** Sent as `Idempotency-Key`, so a retried create does not duplicate. */
  idempotencyKey?: string
  signal?: AbortSignal
}

export interface RuntaPatchRuntime {
  ingressSpecs?: Array<RuntaIngressSpec>
  egressPolicy?: RuntaEgressPolicy
  idlePolicy?: RuntaIdlePolicy
  env?: Record<string, string>
  /** Extra request body fields, sent as-is (snake_case). */
  extra?: Record<string, unknown>
}

/** Options for {@link RuntaClient.spawn}. */
export interface RuntaSpawnOptions {
  /** Argument vector; `argv[0]` is the executable. No shell is applied. */
  argv: Array<string>
  /** Working directory. The exec protocol has no cwd field, so this wraps the command in `sh`. */
  cwd?: string
  /** Extra environment variables for this command only. */
  env?: Record<string, string>
  /** Aborting terminates the remote process and rejects `wait()`. */
  signal?: AbortSignal
  /** Max ms for the socket to open. Defaults to 30s. */
  connectTimeoutMs?: number
  /** Ms between TERM and closing the socket in `kill()`. Defaults to 2s. */
  killGraceMs?: number
}

/** A live process on the exec WebSocket. */
export interface RuntaExecStream {
  /**
   * Resolves when the socket is open and the command was sent. Rejects when
   * the connection fails first, for example with code `unavailable` when the
   * runtime is paused or suspended.
   */
  opened: Promise<void>
  stdout: AsyncIterable<Uint8Array>
  stderr: AsyncIterable<Uint8Array>
  stdin: {
    write: (data: string | Uint8Array) => Promise<void>
    end: () => Promise<void>
  }
  /** Send a signal. The API accepts only INT and TERM. */
  signal: (name: 'INT' | 'TERM') => void
  /**
   * Resolves with the exit code; rejects on a dropped socket or an abort.
   * A process terminated by a signal reports -1 (143 after `kill()`).
   */
  wait: () => Promise<number>
  /** TERM, then close the socket after the grace period. */
  kill: () => Promise<void>
}

export interface RuntaExecOptions extends RuntaSpawnOptions {
  stdin?: string | Uint8Array
  /** Kill the command after this many ms; the result then has exit code 124. */
  timeoutMs?: number
  /** Per-stream cap. Defaults to 4 MiB. */
  maxOutputBytes?: number
}

export interface RuntaExecResult {
  exitCode: number
  stdout: string
  stderr: string
  stdoutBytes: Uint8Array
  stderrBytes: Uint8Array
  stdoutTruncated: boolean
  stderrTruncated: boolean
  timedOut: boolean
}

export class RuntaApiError extends Error {
  readonly status: number | undefined
  readonly code: string | undefined

  constructor(
    message: string,
    options: { status?: number; code?: string } = {},
  ) {
    super(message)
    this.name = 'RuntaApiError'
    this.status = options.status
    this.code = options.code
  }
}

/** Constructor shape for the undici `WebSocket` with the `headers` option. */
export type RuntaWebSocketCtor = new (
  url: string,
  options: { headers: Record<string, string> },
) => WebSocket

export interface RuntaClientConfig {
  /** Runta API key (`rt_...`). */
  apiKey: string
  /** API endpoint. Defaults to `https://api.runta.com`. */
  endpoint?: string
  /** Sent as `User-Agent`, so Runta can tell the integrations apart. */
  userAgent?: string
  /** Largest body sent through the file PUT endpoint; bigger writes stream over exec. Defaults to 1 MiB. */
  maxFilePutBytes?: number
  fetch?: typeof fetch
  WebSocket?: RuntaWebSocketCtor
}

const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const DEFAULT_MAX_FILE_PUT_BYTES = 1024 * 1024
const STDIN_CHUNK_BYTES = 64 * 1024
const SEND_HIGH_WATER_BYTES = 1024 * 1024
const MAX_INGRESS_SPECS = 16
const REVISION_RETRIES = 3
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SETTLED_STATUSES = ['running', 'paused', 'suspended', 'shutdown']
const FAILED_STATUSES = ['error', 'crashed', 'deleting']
const LIFECYCLE_TARGETS = {
  start: 'running',
  resume: 'running',
  pause: 'paused',
  stop: 'shutdown',
} as const

export class RuntaClient {
  readonly endpoint: string
  private readonly apiKey: string
  private readonly userAgent: string
  private readonly maxFilePutBytes: number
  private readonly fetchImpl: typeof fetch
  private readonly webSocketCtor: RuntaWebSocketCtor | undefined

  constructor(config: RuntaClientConfig) {
    if (!config.apiKey) throw new Error('Runta: an API key is required.')
    this.apiKey = config.apiKey
    this.endpoint = (config.endpoint ?? RUNTA_DEFAULT_ENDPOINT).replace(
      /\/+$/,
      '',
    )
    this.userAgent = config.userAgent ?? 'runta-sandbox-client'
    this.maxFilePutBytes = config.maxFilePutBytes ?? DEFAULT_MAX_FILE_PUT_BYTES
    this.fetchImpl = config.fetch ?? fetch
    this.webSocketCtor = config.WebSocket
  }

  /** Authorization header for API requests. */
  authHeader(): Record<string, string> {
    return { authorization: `Bearer ${this.apiKey}` }
  }

  // ---------------------------------------------------------------- runtimes

  async getRuntime(
    idOrName: string,
    signal?: AbortSignal,
  ): Promise<RuntaRuntime> {
    if (UUID_PATTERN.test(idOrName)) {
      try {
        return parseRuntime(
          await this.json('GET', runtimePath(idOrName), { signal }),
        )
      } catch (error) {
        // A display name can look like a UUID. Without this, a runtime with
        // such a name would read as missing, and a delete would do nothing.
        if (!(error instanceof RuntaApiError) || error.status !== 404)
          throw error
      }
    }
    // The API rejects a name in the path ("runtime_id must be a UUID"), so
    // find the runtime in the list. Names are unique within an organization.
    const match = (await this.listRuntimes(signal)).find(
      (runtime) => runtime.name === idOrName,
    )
    if (!match) {
      throw new RuntaApiError(`Runta: no runtime is named "${idOrName}".`, {
        status: 404,
        code: 'not_found',
      })
    }
    // The list can still show a runtime that was just deleted. Read it by id,
    // which answers 404 for one that is gone.
    return parseRuntime(
      await this.json('GET', runtimePath(match.id), { signal }),
    )
  }

  /** Every runtime the API key can see. */
  async listRuntimes(signal?: AbortSignal): Promise<Array<RuntaRuntime>> {
    return this.listAll('/v2/runtimes', parseRuntime, signal)
  }

  /** Like {@link getRuntime}, but resolves `null` when the runtime does not exist. */
  async findRuntime(
    idOrName: string,
    signal?: AbortSignal,
  ): Promise<RuntaRuntime | null> {
    try {
      return await this.getRuntime(idOrName, signal)
    } catch (error) {
      if (error instanceof RuntaApiError && error.status === 404) return null
      throw error
    }
  }

  async createRuntime(
    options: RuntaCreateRuntimeOptions = {},
  ): Promise<RuntaRuntime> {
    const created = parseRuntime(
      await this.json('POST', '/v2/runtimes', {
        body: createRuntimeBody(options),
        signal: options.signal,
        ...(options.idempotencyKey
          ? { headers: { 'idempotency-key': options.idempotencyKey } }
          : {}),
      }),
    )
    if (options.wait === false) return created
    return this.waitUntilRunning(created.id, {
      timeoutMs: options.readyTimeoutMs,
      signal: options.signal,
    })
  }

  /**
   * Attach to the runtime called `name`, or create it. Safe under concurrent
   * first use: a create that loses the race reads the winner back.
   */
  async getOrCreateRuntime(
    name: string,
    {
      nameTimeoutMs = 120_000,
      ...options
    }: Omit<RuntaCreateRuntimeOptions, 'name'> & {
      /** Max ms to wait for a name that a runtime being deleted still holds. Defaults to 120s. */
      nameTimeoutMs?: number
    } = {},
  ): Promise<{ runtime: RuntaRuntime; created: boolean }> {
    // A runtime that is being deleted holds its name until it is gone, so a
    // create can answer "already exists" for a while. Wait for the name.
    // The limit covers the lookups and the pauses, not a create that started.
    const deadline = Date.now() + nameTimeoutMs
    const lookup = <T>(call: (signal: AbortSignal) => Promise<T>): Promise<T> =>
      withDeadline(
        Math.max(0, deadline - Date.now()),
        options.signal,
        call,
        () =>
          new RuntaApiError(
            `Runta: the name "${name}" was not free after ${nameTimeoutMs}ms. A runtime that is being deleted may still hold it.`,
            { code: 'deadline_exceeded' },
          ),
      )
    for (;;) {
      const existing = await lookup((signal) => this.findRuntime(name, signal))
      if (existing && existing.status !== 'deleting') {
        return {
          runtime: await this.ensureRunning(existing.id, options),
          created: false,
        }
      }
      if (!existing) {
        try {
          return {
            runtime: await this.createRuntime({ ...options, name }),
            created: true,
          }
        } catch (error) {
          // Lost a race with another create, or the name is not free yet.
          if (!(error instanceof RuntaApiError) || !isAlreadyExists(error))
            throw error
        }
      }
      await lookup((signal) => delay(1000, signal))
    }
  }

  /**
   * Bring a runtime to `running`: resume it when paused or suspended, start it
   * when shut down, wait when it is still being created.
   */
  async ensureRunning(
    idOrName: string,
    options: { readyTimeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<RuntaRuntime> {
    const wait = { timeoutMs: options.readyTimeoutMs, signal: options.signal }
    const runtime = await this.settle(
      await this.getRuntime(idOrName, options.signal),
      wait,
    )
    const { status } = runtime
    if (status === 'running') return runtime
    if (status === 'creating') return this.waitUntilRunning(runtime.id, wait)
    if (status === 'paused' || status === 'suspended') {
      return this.lifecycle(runtime.id, 'resume', wait)
    }
    if (status === 'shutdown') return this.lifecycle(runtime.id, 'start', wait)
    throw unusable(runtime, 'and cannot be used')
  }

  async waitUntilRunning(
    idOrName: string,
    options: {
      timeoutMs?: number | undefined
      pollMs?: number
      signal?: AbortSignal | undefined
    } = {},
  ): Promise<RuntaRuntime> {
    return this.waitForStatus(idOrName, 'running', options)
  }

  /** Poll until the runtime reports `target`. */
  async waitForStatus(
    idOrName: string,
    target: string,
    options: {
      timeoutMs?: number | undefined
      pollMs?: number
      signal?: AbortSignal | undefined
    } = {},
  ): Promise<RuntaRuntime> {
    return this.poll(
      idOrName,
      target,
      (runtime) => {
        if (runtime.status === target) return true
        if (FAILED_STATUSES.includes(runtime.status)) {
          throw unusable(runtime, `while waiting for it to be ${target}`)
        }
        return false
      },
      options,
    )
  }

  /**
   * Read the runtime until `done` accepts it. The timeout covers the requests
   * as well as the pauses between them, so a stalled request cannot outlast it.
   */
  private async poll(
    idOrName: string,
    waitingFor: string,
    done: (runtime: RuntaRuntime) => boolean,
    options: {
      timeoutMs?: number | undefined
      pollMs?: number
      signal?: AbortSignal | undefined
    },
  ): Promise<RuntaRuntime> {
    const timeoutMs = options.timeoutMs ?? 240_000
    let last: RuntaRuntime | undefined
    return withDeadline(
      timeoutMs,
      options.signal,
      async (signal) => {
        for (;;) {
          last = await this.getRuntime(idOrName, signal)
          if (done(last)) return last
          await delay(options.pollMs ?? 500, signal)
        }
      },
      () =>
        new RuntaApiError(
          `Runta: runtime "${last?.name ?? idOrName}" was still ${last?.status ?? 'unreachable'} after ${timeoutMs}ms, not ${waitingFor}.`,
          { code: 'deadline_exceeded' },
        ),
    )
  }

  /**
   * Wait out a lifecycle change that is still in flight. A runtime that was
   * just told to pause still reports `running` for a moment; acting on that
   * stale status would skip the resume it needs.
   */
  private async settle(
    runtime: RuntaRuntime,
    wait: { timeoutMs?: number | undefined; signal?: AbortSignal | undefined },
  ): Promise<RuntaRuntime> {
    if (!inFlight(runtime)) return runtime
    // Check the target on every read: another caller can change it meanwhile,
    // and the status then never reaches the one recorded here.
    return this.poll(
      runtime.id,
      runtime.desiredStatus,
      (current) => !inFlight(current),
      wait,
    )
  }

  /**
   * `start`, `pause`, `resume` or `stop` a runtime. The API returns before the
   * change lands, so this waits for the new status unless `wait` is false.
   */
  async lifecycle(
    idOrName: string,
    action: 'start' | 'pause' | 'resume' | 'stop',
    options: {
      wait?: boolean
      timeoutMs?: number | undefined
      signal?: AbortSignal | undefined
    } = {},
  ): Promise<RuntaRuntime> {
    const runtime = await this.withRevision(
      idOrName,
      options.signal,
      (current) =>
        this.json('POST', `${runtimePath(current.id)}/${action}`, {
          params: { expected_revision: current.revision },
          signal: options.signal,
        }).then(parseRuntime),
    )
    if (options.wait === false) return runtime
    return this.waitForStatus(runtime.id, LIFECYCLE_TARGETS[action], {
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    })
  }

  /** Patch a runtime. List fields replace the whole list, as the API does. */
  async patchRuntime(
    idOrName: string,
    patch: RuntaPatchRuntime | ((runtime: RuntaRuntime) => RuntaPatchRuntime),
    signal?: AbortSignal,
  ): Promise<RuntaRuntime> {
    return this.withRevision(idOrName, signal, (runtime) =>
      this.json('PATCH', runtimePath(runtime.id), {
        params: { expected_revision: runtime.revision },
        body: patchRuntimeBody(
          typeof patch === 'function' ? patch(runtime) : patch,
        ),
        signal,
      }).then(parseRuntime),
    )
  }

  /** Delete a runtime. A runtime that is already gone counts as deleted. */
  async deleteRuntime(idOrName: string, signal?: AbortSignal): Promise<void> {
    try {
      await this.withRevision(idOrName, signal, async (runtime) => {
        const response = await this.request('DELETE', runtimePath(runtime.id), {
          params: { expected_revision: runtime.revision },
          signal,
        })
        await response.body?.cancel()
      })
    } catch (error) {
      if (error instanceof RuntaApiError && error.status === 404) return
      throw error
    }
  }

  // ------------------------------------------------------------------- ports

  /**
   * Publish `port` and return its public URL. Published URLs carry no auth:
   * anyone with the URL can reach the service.
   */
  async publishPort(
    idOrName: string,
    port: number,
    options: { protocol?: 'http' | 'https'; signal?: AbortSignal } = {},
  ): Promise<string> {
    const noUrl = (): RuntaApiError =>
      new RuntaApiError(
        `Runta: cannot derive a public URL for port ${port} from the endpoint ${this.endpoint}.`,
        { code: 'unimplemented' },
      )
    // Check before publishing: a port with no URL to return would stay public,
    // with no auth, and the caller would not know.
    if (runtimeIngressUrl(this.endpoint, 'id', port) === undefined)
      throw noUrl()
    let runtime = await this.getRuntime(idOrName, options.signal)
    let spec = runtime.ingressSpecs.find((entry) => entry.runtimePort === port)
    if (!spec) {
      runtime = await this.patchRuntime(
        runtime.id,
        (current) => {
          if (
            current.ingressSpecs.some((entry) => entry.runtimePort === port)
          ) {
            return { ingressSpecs: current.ingressSpecs }
          }
          if (current.ingressSpecs.length >= MAX_INGRESS_SPECS) {
            throw new RuntaApiError(
              `Runta: runtime "${current.name}" already publishes ${MAX_INGRESS_SPECS} ports, the maximum.`,
              { code: 'failed_precondition' },
            )
          }
          return {
            ingressSpecs: [
              ...current.ingressSpecs,
              { protocol: options.protocol ?? 'https', runtimePort: port },
            ],
          }
        },
        options.signal,
      )
      spec = runtime.ingressSpecs.find((entry) => entry.runtimePort === port)
    }
    const url = runtimeIngressUrl(
      this.endpoint,
      runtime.id,
      port,
      spec?.hostnameLabel,
    )
    if (url === undefined) throw noUrl()
    return url
  }

  // ------------------------------------------------------------------- files

  /**
   * Read a file by absolute path. The file endpoint refuses files above 1 MiB,
   * so larger ones are streamed through the exec WebSocket from `cat`.
   */
  async readFile(
    runtimeId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    try {
      const response = await this.request(
        'GET',
        `${runtimePath(runtimeId)}/files`,
        {
          params: { path },
          signal,
        },
      )
      return new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      if (
        !(error instanceof RuntaApiError) ||
        (error.status !== 413 && error.status !== 422)
      )
        throw error
      const result = await this.exec(runtimeId, {
        argv: ['cat', '--', path],
        maxOutputBytes: Number.MAX_SAFE_INTEGER,
        ...(signal ? { signal } : {}),
      })
      // If cat fails too, the endpoint's own error says more (for example "not a regular file").
      if (result.exitCode !== 0) throw error
      return result.stdoutBytes
    }
  }

  /**
   * Write a file by absolute path. Bodies above the file endpoint's limit are
   * streamed through the exec WebSocket into `cat`. Both paths create missing
   * parent directories.
   */
  async writeFile(
    runtimeId: string,
    path: string,
    data: string | Uint8Array,
    signal?: AbortSignal,
  ): Promise<void> {
    const bytes =
      typeof data === 'string' ? new TextEncoder().encode(data) : data
    if (bytes.byteLength > this.maxFilePutBytes) {
      const result = await this.exec(runtimeId, {
        argv: [
          'sh',
          '-c',
          // Not `dirname`: command substitution drops a trailing newline.
          'case "$1" in */*) d=${1%/*}; mkdir -p -- "${d:-/}" ;; esac && cat > "$1"',
          'runta-write',
          path,
        ],
        stdin: bytes,
        ...(signal ? { signal } : {}),
      })
      if (result.exitCode !== 0) {
        throw new RuntaApiError(
          `Runta: writing ${path} failed with exit code ${result.exitCode}: ${result.stderr.trim()}`,
          { code: 'command_failed' },
        )
      }
      return
    }
    const response = await this.request(
      'PUT',
      `${runtimePath(runtimeId)}/files`,
      {
        params: { path },
        // Copy into a fresh ArrayBuffer-backed view, which every fetch typing accepts as a body.
        rawBody: bytes.slice(),
        headers: { 'content-type': 'application/octet-stream' },
        signal,
      },
    )
    await response.body?.cancel()
  }

  // ------------------------------------------------------------- checkpoints

  /** Create a checkpoint and wait until it is ready. */
  async createCheckpoint(
    runtimeId: string,
    options: {
      name?: string
      kind?: 'full' | 'cold'
      readyTimeoutMs?: number
      signal?: AbortSignal
    } = {},
  ): Promise<RuntaCheckpoint> {
    const created = parseCheckpoint(
      await this.json('POST', `${runtimePath(runtimeId)}/checkpoints`, {
        body: {
          kind: options.kind ?? 'full',
          ...(options.name ? { name: options.name } : {}),
        },
        signal: options.signal,
      }),
    )
    const timeoutMs = options.readyTimeoutMs ?? 240_000
    const checkpoint = await withDeadline(
      timeoutMs,
      options.signal,
      async (signal) => {
        let current = created
        while (current.state === 'creating') {
          await delay(500, signal)
          current = await this.getCheckpoint(current.id, signal)
        }
        return current
      },
      () =>
        new RuntaApiError(
          `Runta: checkpoint ${created.id} was not ready after ${timeoutMs}ms.`,
          { code: 'deadline_exceeded' },
        ),
    )
    if (checkpoint.state === 'failed') {
      throw new RuntaApiError(`Runta: checkpoint ${checkpoint.id} failed.`, {
        code: 'internal',
      })
    }
    return checkpoint
  }

  async getCheckpoint(
    idOrName: string,
    signal?: AbortSignal,
  ): Promise<RuntaCheckpoint> {
    return parseCheckpoint(
      await this.json(
        'GET',
        `/v2/checkpoints/${encodeURIComponent(idOrName)}`,
        { signal },
      ),
    )
  }

  async listCheckpoints(signal?: AbortSignal): Promise<Array<RuntaCheckpoint>> {
    return this.listAll('/v2/checkpoints', parseCheckpoint, signal)
  }

  /** Delete a checkpoint. One that is already gone counts as deleted. */
  async deleteCheckpoint(
    idOrName: string,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const response = await this.request(
        'DELETE',
        `/v2/checkpoints/${encodeURIComponent(idOrName)}`,
        { signal },
      )
      await response.body?.cancel()
    } catch (error) {
      if (error instanceof RuntaApiError && error.status === 404) return
      throw error
    }
  }

  // -------------------------------------------------------------------- exec

  /** Run a command to completion and buffer its output. */
  async exec(
    runtimeId: string,
    options: RuntaExecOptions,
  ): Promise<RuntaExecResult> {
    const limit = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    const stream = this.spawn(runtimeId, options)
    let timedOut = false
    const timer =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            timedOut = true
            void stream.kill()
          }, options.timeoutMs)
        : undefined

    const collect = async (
      source: AsyncIterable<Uint8Array>,
    ): Promise<{ bytes: Uint8Array; truncated: boolean }> => {
      const chunks: Array<Uint8Array> = []
      let size = 0
      let truncated = false
      for await (const chunk of source) {
        const room = limit - size
        if (chunk.byteLength > room) truncated = true
        if (room > 0) {
          const kept = chunk.subarray(0, room)
          chunks.push(kept)
          size += kept.byteLength
        }
      }
      return { bytes: concatBytes(chunks, size), truncated }
    }

    try {
      const feed = async (): Promise<void> => {
        if (options.stdin !== undefined) await stream.stdin.write(options.stdin)
        await stream.stdin.end()
      }
      // A failed stdin write surfaces through wait(), so do not reject on it here.
      const [out, err, exitCode] = await Promise.all([
        collect(stream.stdout),
        collect(stream.stderr),
        stream.wait(),
        feed().catch(() => undefined),
      ])
      return {
        exitCode: timedOut ? 124 : exitCode,
        stdout: new TextDecoder().decode(out.bytes),
        stderr: new TextDecoder().decode(err.bytes),
        stdoutBytes: out.bytes,
        stderrBytes: err.bytes,
        stdoutTruncated: out.truncated,
        stderrTruncated: err.truncated,
        timedOut,
      }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /** Start a command and stream it. One command per socket. */
  spawn(runtimeId: string, options: RuntaSpawnOptions): RuntaExecStream {
    const wsBase = this.endpoint.replace(/^http(s?):\/\//, 'ws$1://')
    const url = `${wsBase}${runtimePath(runtimeId)}/exec/stream`
    const connectTimeoutMs = options.connectTimeoutMs ?? 30_000
    const killGraceMs = options.killGraceMs ?? 2000
    // Throws for an empty argv, before a socket exists.
    const command = withCwd(options.argv, options.cwd)

    const stdoutQ = new AsyncByteQueue()
    const stderrQ = new AsyncByteQueue()
    const outbox: Array<string> = []

    let opened = false
    let settled = false
    let exitCode: number | undefined
    let killedByCaller = false
    let failure: Error | undefined
    let onAbort: (() => void) | undefined
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let resolveClosed!: () => void
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve
    })
    let resolveOpened!: () => void
    let rejectOpened!: (error: Error) => void
    const openedPromise = new Promise<void>((resolve, reject) => {
      resolveOpened = resolve
      rejectOpened = reject
    })
    // A caller that only uses wait() never reads this promise.
    openedPromise.catch(() => undefined)

    // The global (undici) WebSocket accepts a `headers` constructor option at
    // runtime, but the WHATWG type only declares `(url, protocols?)`, so the two
    // constructor signatures do not structurally overlap. Bridge via `unknown`.
    // oxlint-disable-next-line eslint-js/no-restricted-syntax -- undici headers option not in the DOM WebSocket type
    const globalCtor = WebSocket as unknown as RuntaWebSocketCtor
    const WebSocketCtor = this.webSocketCtor ?? globalCtor
    const ws = new WebSocketCtor(url, {
      headers: { ...this.authHeader(), 'user-agent': this.userAgent },
    })

    const closeSocket = (): void => {
      try {
        ws.close()
      } catch {
        // already closing or closed
      }
    }

    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(connectTimer)
      if (killTimer) clearTimeout(killTimer)
      if (onAbort && options.signal)
        options.signal.removeEventListener('abort', onAbort)
      stdoutQ.end()
      stderrQ.end()
      if (!opened) {
        rejectOpened(
          options.signal?.aborted
            ? signalReason(options.signal)
            : (failure ??
                new RuntaApiError(
                  `Runta: exec connection closed before it opened (${url}).`,
                  { code: 'unavailable' },
                )),
        )
      }
      resolveClosed()
    }

    const send = (frame: Record<string, unknown>): void => {
      if (settled) return
      const text = JSON.stringify(frame)
      if (opened) ws.send(text)
      else outbox.push(text)
    }

    const connectTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (opened) return
      failure ??= new RuntaApiError(
        `Runta: exec socket did not connect within ${connectTimeoutMs}ms (${url}).`,
        { code: 'deadline_exceeded' },
      )
      closeSocket()
      finish()
    }, connectTimeoutMs)
    unref(connectTimer)

    ws.addEventListener('open', () => {
      opened = true
      resolveOpened()
      clearTimeout(connectTimer)
      ws.send(
        JSON.stringify({
          type: 'start',
          command: command[0],
          args: command.slice(1),
          env: options.env ?? {},
          tty: false,
        }),
      )
      for (const text of outbox.splice(0)) ws.send(text)
    })

    ws.addEventListener('message', (event: MessageEvent) => {
      const frame = parseFrame(event.data)
      if (frame === undefined) return
      if (frame.type === 'stdout' && typeof frame.data_base64 === 'string') {
        stdoutQ.push(fromBase64(frame.data_base64))
      } else if (
        frame.type === 'stderr' &&
        typeof frame.data_base64 === 'string'
      ) {
        stderrQ.push(fromBase64(frame.data_base64))
      } else if (frame.type === 'exit' && typeof frame.code === 'number') {
        exitCode = frame.code
        closeSocket()
        finish()
      } else if (frame.type === 'error') {
        failure ??= new RuntaApiError(
          `Runta: exec failed: ${typeof frame.message === 'string' ? frame.message : 'unknown error'}`,
          { code: 'command_failed' },
        )
        closeSocket()
        finish()
      } else if (frame.type === 'heartbeat') {
        send({ type: 'heartbeat' })
      }
    })

    ws.addEventListener('error', (event: Event) => {
      // Closing a socket that is still connecting can send another error
      // event at once. This guard, with finish() before the close below,
      // stops that from repeating.
      if (settled) return
      // Typed by hand: `ErrorEvent` exists only in the DOM lib.
      const { message } = event as { message?: string }
      failure ??= new RuntaApiError(
        `Runta: exec socket error for ${url}: ${message || 'connection failed'}`,
        {
          code: 'unavailable',
        },
      )
      // Do not wait for a close event: not every socket sends one after an error.
      finish()
      closeSocket()
    })

    ws.addEventListener('close', () => finish())

    const kill = async (): Promise<void> => {
      if (settled) return
      killedByCaller = true
      send({ type: 'signal', signal: 'TERM' })
      killTimer = setTimeout(closeSocket, killGraceMs)
      unref(killTimer)
      await closed
    }

    if (options.signal) {
      onAbort = (): void => {
        send({ type: 'signal', signal: 'TERM' })
        closeSocket()
        finish()
      }
      if (options.signal.aborted) onAbort()
      else options.signal.addEventListener('abort', onAbort)
    }

    const write = async (data: string | Uint8Array): Promise<void> => {
      // Wait for the socket, so the backpressure check below also limits a
      // write that starts early. Rejects when the connection fails.
      await openedPromise
      const bytes =
        typeof data === 'string' ? new TextEncoder().encode(data) : data
      for (
        let offset = 0;
        offset < bytes.byteLength;
        offset += STDIN_CHUNK_BYTES
      ) {
        while (opened && !settled && ws.bufferedAmount > SEND_HIGH_WATER_BYTES)
          await delay(5)
        // After the wait, so a stream that closed during it rejects too:
        // send() drops the frame once the stream has settled.
        if (settled) {
          throw (
            failure ??
            new RuntaApiError('Runta: exec stdin is closed.', {
              code: 'failed_precondition',
            })
          )
        }
        send({
          type: 'stdin',
          data_base64: toBase64(
            bytes.subarray(offset, offset + STDIN_CHUNK_BYTES),
          ),
        })
      }
    }

    // stdin calls run one after another, so `end()` cannot overtake a write
    // that is still waiting.
    let stdinTail: Promise<void> = Promise.resolve()
    const inOrder = (call: () => Promise<void>): Promise<void> => {
      const result = stdinTail.then(call)
      stdinTail = result.catch(() => undefined)
      return result
    }

    return {
      opened: openedPromise,
      stdout: stdoutQ,
      stderr: stderrQ,
      stdin: {
        write: (data) => inOrder(() => write(data)),
        end: () => inOrder(async () => send({ type: 'close_stdin' })),
      },
      signal: (name) => send({ type: 'signal', signal: name }),
      wait: async (): Promise<number> => {
        await closed
        // A real exit wins, even if a kill or abort raced in at the same instant.
        // The API reports -1 for a process that a signal terminated.
        if (exitCode !== undefined)
          return killedByCaller && exitCode < 0 ? 143 : exitCode
        if (options.signal?.aborted) throw signalReason(options.signal)
        if (failure) throw failure
        // An explicit kill() is normal teardown: report "terminated by SIGTERM".
        if (killedByCaller) return 143
        throw new RuntaApiError(
          `Runta: exec connection closed before the process reported an exit code (${url}).`,
          { code: 'unavailable' },
        )
      },
      kill,
    }
  }

  // --------------------------------------------------------------- transport

  /** Read every page of a list endpoint. */
  private async listAll<T>(
    path: string,
    parse: (value: unknown) => T,
    signal?: AbortSignal,
  ): Promise<Array<T>> {
    const items: Array<T> = []
    let after: string | undefined
    do {
      const page = await this.envelope('GET', path, {
        params: { limit: 100, ...(after ? { after } : {}) },
        signal,
      })
      const data = Array.isArray(page.data) ? page.data : []
      items.push(...data.map(parse))
      const pagination = asRecord(page.pagination)
      const next =
        pagination.has_more === true ? pagination.next_cursor : undefined
      after = typeof next === 'string' && next !== after ? next : undefined
    } while (after)
    return items
  }

  /** Run `call` with a fresh runtime revision, retrying when the revision is stale. */
  private async withRevision<T>(
    idOrName: string,
    signal: AbortSignal | undefined,
    call: (runtime: RuntaRuntime) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt < REVISION_RETRIES; attempt += 1) {
      const runtime = await this.getRuntime(idOrName, signal)
      try {
        return await call(runtime)
      } catch (error) {
        if (!(error instanceof RuntaApiError) || error.status !== 409)
          throw error
        lastError = error
      }
    }
    throw lastError
  }

  private async json(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<unknown> {
    return (await this.envelope(method, path, options)).data
  }

  private async envelope(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Record<string, unknown>> {
    const response = await this.request(method, path, options)
    const text = await response.text()
    if (text === '') return {}
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      throw new RuntaApiError(
        `Runta API ${method} ${path} returned a non-JSON response.`,
        {
          status: response.status,
        },
      )
    }
    const record = asRecord(value)
    return 'data' in record ? record : { data: value }
  }

  private async request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    const url = new URL(`${this.endpoint}${path}`)
    for (const [key, value] of Object.entries(options.params ?? {})) {
      url.searchParams.set(key, String(value))
    }
    const headers: Record<string, string> = {
      ...this.authHeader(),
      'user-agent': this.userAgent,
      ...options.headers,
    }
    let body: string | Uint8Array<ArrayBuffer> | undefined
    if (options.rawBody !== undefined) {
      body = options.rawBody
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body)
      headers['content-type'] = 'application/json'
    }
    const response = await this.fetchImpl(url, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })
    if (!response.ok) throw await apiError(method, path, response)
    return response
  }
}

/**
 * The public URL of a published runtime port, or `undefined` when it cannot be
 * derived. The API does not return it; this mirrors `runtime_ingress_url` in
 * the Runta CLI (`crates/runta-api-client/src/ingress.rs`).
 */
export function runtimeIngressUrl(
  endpoint: string,
  runtimeId: string,
  port: number,
  hostnameLabel?: string,
): string | undefined {
  let hostname: string
  try {
    hostname = new URL(endpoint).hostname.toLowerCase()
  } catch {
    return undefined
  }
  let domain: string
  if (hostname === 'api.runta.com') domain = 'runta.dev'
  else if (hostname === 'api.runta.me') domain = 'runta.sh'
  else if (hostname.startsWith('api.')) domain = hostname.slice('api.'.length)
  else return undefined
  if (domain === 'localhost') return undefined
  return `https://${hostnameLabel ?? `${port}-${runtimeId}`}.${domain}`
}

/** Quote one argument for a POSIX shell. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

interface RequestOptions {
  params?: Record<string, string | number>
  body?: unknown
  rawBody?: Uint8Array<ArrayBuffer>
  headers?: Record<string, string>
  signal?: AbortSignal | undefined
}

interface ExecServerFrame {
  type?: unknown
  data_base64?: unknown
  code?: unknown
  message?: unknown
}

/**
 * A push-driven async iterable of byte chunks. The producer pushes and calls
 * `end()` once; consumers `for await` and terminate cleanly.
 */
class AsyncByteQueue implements AsyncIterable<Uint8Array> {
  private readonly chunks: Array<Uint8Array> = []
  private readonly waiters: Array<
    (result: IteratorResult<Uint8Array>) => void
  > = []
  private ended = false

  push(chunk: Uint8Array): void {
    if (chunk.byteLength === 0 || this.ended) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: chunk, done: false })
    else this.chunks.push(chunk)
  }

  end(): void {
    this.ended = true
    for (const waiter of this.waiters.splice(0))
      waiter({ value: undefined, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: () => {
        const chunk = this.chunks.shift()
        if (chunk !== undefined)
          return Promise.resolve({ value: chunk, done: false })
        if (this.ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => this.waiters.push(resolve))
      },
    }
  }
}

/**
 * The error for a runtime in a status that nothing can be done with. One that
 * is being deleted reports as not found, like one that is already gone.
 */
function unusable(runtime: RuntaRuntime, context: string): RuntaApiError {
  return new RuntaApiError(
    `Runta: runtime "${runtime.name}" is ${runtime.status} ${context}.`,
    runtime.status === 'deleting'
      ? { status: 404, code: 'not_found' }
      : { code: 'failed_precondition' },
  )
}

/** Whether the control plane is still moving the runtime to its desired status. */
function inFlight(runtime: RuntaRuntime): boolean {
  return (
    runtime.status !== runtime.desiredStatus &&
    SETTLED_STATUSES.includes(runtime.desiredStatus) &&
    ['creating', ...SETTLED_STATUSES].includes(runtime.status)
  )
}

function runtimePath(idOrName: string): string {
  return `/v2/runtimes/${encodeURIComponent(idOrName)}`
}

/** The exec protocol has no cwd field, so change directory in a wrapper shell. */
function withCwd(argv: Array<string>, cwd: string | undefined): Array<string> {
  if (argv.length === 0) throw new Error('Runta: exec needs a non-empty argv.')
  if (cwd === undefined) return argv
  return [
    'sh',
    '-c',
    'cd -- "$1" && shift && exec "$@"',
    'runta-cwd',
    cwd,
    ...argv,
  ]
}

function createRuntimeBody(
  options: RuntaCreateRuntimeOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...options.extra }
  if (options.name !== undefined) body.name = options.name
  if (options.env !== undefined) body.environment_variables = options.env
  if (options.ingressSpecs !== undefined)
    body.ingress_specs = options.ingressSpecs.map(ingressSpecToApi)
  if (options.egressPolicy !== undefined)
    body.egress_policy = egressPolicyToApi(options.egressPolicy)
  if (options.idlePolicy !== undefined)
    body.idle_policy = idlePolicyToApi(options.idlePolicy)
  if (options.autoShutdownAfterSecs !== undefined) {
    body.auto_shutdown_policy = {
      mode: 'enabled',
      after_seconds: options.autoShutdownAfterSecs,
    }
  }
  if (options.autoDeleteAfterSecs !== undefined) {
    body.auto_delete_policy = {
      mode: 'enabled',
      after_seconds: options.autoDeleteAfterSecs,
    }
  }
  if (options.checkpointId !== undefined) {
    body.checkpoint_id = options.checkpointId
    return body
  }
  if (options.image !== undefined) body.image = { id: options.image }
  const requests: Record<string, number> = {}
  if (options.vcpus !== undefined) requests.vcpus = options.vcpus
  if (options.memoryMib !== undefined) requests.memory_mib = options.memoryMib
  if (options.diskGib !== undefined) requests.disk_gib = options.diskGib
  const resources: Record<string, unknown> = {}
  if (Object.keys(requests).length > 0) resources.requests = requests
  if (options.memoryMaxMib !== undefined)
    resources.limits = { memory_mib: options.memoryMaxMib }
  if (Object.keys(resources).length > 0) body.resources = resources
  return body
}

function patchRuntimeBody(patch: RuntaPatchRuntime): Record<string, unknown> {
  const body: Record<string, unknown> = { ...patch.extra }
  if (patch.ingressSpecs !== undefined)
    body.ingress_specs = patch.ingressSpecs.map(ingressSpecToApi)
  if (patch.egressPolicy !== undefined)
    body.egress_policy = egressPolicyToApi(patch.egressPolicy)
  if (patch.idlePolicy !== undefined)
    body.idle_policy = idlePolicyToApi(patch.idlePolicy)
  if (patch.env !== undefined) body.environment_variables = patch.env
  return body
}

function ingressSpecToApi(spec: RuntaIngressSpec): Record<string, unknown> {
  return {
    protocol: spec.protocol,
    runtime_port: spec.runtimePort,
    ...(spec.hostnameLabel !== undefined
      ? { hostname_label: spec.hostnameLabel }
      : {}),
  }
}

function egressPolicyToApi(policy: RuntaEgressPolicy): Record<string, unknown> {
  return policy.mode === 'allowlist'
    ? { mode: 'allowlist', allowed_hosts: policy.allowedHosts }
    : { mode: 'denylist', denied_hosts: policy.deniedHosts }
}

function idlePolicyToApi(policy: RuntaIdlePolicy): Record<string, unknown> {
  return policy.mode === 'disabled'
    ? { mode: 'disabled' }
    : { mode: policy.mode, suspend_after_secs: policy.suspendAfterSecs }
}

function parseRuntime(value: unknown): RuntaRuntime {
  const record = asRecord(value)
  if (typeof record.id !== 'string' || typeof record.status !== 'string') {
    throw new RuntaApiError('Runta API returned an unexpected runtime shape.')
  }
  const specs = Array.isArray(record.ingress_specs) ? record.ingress_specs : []
  return {
    id: record.id,
    name:
      typeof record.display_name === 'string' ? record.display_name : record.id,
    status: record.status as RuntaRuntimeStatus,
    desiredStatus:
      typeof record.desired_status === 'string'
        ? record.desired_status
        : record.status,
    revision: typeof record.revision === 'number' ? record.revision : 0,
    ingressSpecs: specs.map((entry) => {
      const spec = asRecord(entry)
      return {
        protocol:
          spec.protocol === 'http' ? ('http' as const) : ('https' as const),
        runtimePort: Number(spec.runtime_port),
        ...(typeof spec.hostname_label === 'string'
          ? { hostnameLabel: spec.hostname_label }
          : {}),
      }
    }),
  }
}

function parseCheckpoint(value: unknown): RuntaCheckpoint {
  const record = asRecord(value)
  if (typeof record.id !== 'string') {
    throw new RuntaApiError(
      'Runta API returned an unexpected checkpoint shape.',
    )
  }
  const state = record.state
  return {
    id: record.id,
    name:
      typeof record.display_name === 'string' ? record.display_name : record.id,
    kind: typeof record.kind === 'string' ? record.kind : 'full',
    state: state === 'creating' || state === 'failed' ? state : 'ready',
  }
}

function parseFrame(data: unknown): ExecServerFrame | undefined {
  let text: string
  if (typeof data === 'string') text = data
  else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data)
  else if (ArrayBuffer.isView(data))
    text = new TextDecoder().decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    )
  else return undefined
  try {
    return asRecord(JSON.parse(text))
  } catch {
    return undefined
  }
}

async function apiError(
  method: string,
  path: string,
  response: Response,
): Promise<RuntaApiError> {
  const text = await response.text().catch(() => '')
  let message = text
  let code: string | undefined
  try {
    const error = asRecord(asRecord(JSON.parse(text)).error)
    if (typeof error.message === 'string') message = error.message
    if (typeof error.code === 'string') code = error.code
  } catch {
    // keep the raw text
  }
  return new RuntaApiError(
    `Runta API ${method} ${path} failed: ${response.status}${message ? ` ${message}` : ''}`,
    { status: response.status, ...(code !== undefined ? { code } : {}) },
  )
}

function isAlreadyExists(error: RuntaApiError): boolean {
  return error.code === 'already_exists' || error.status === 409
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

function concatBytes(chunks: Array<Uint8Array>, size: number): Uint8Array {
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    'base64',
  )
}

function fromBase64(text: string): Uint8Array {
  const buffer = Buffer.from(text, 'base64')
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

function unref(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === 'object' && 'unref' in timer) timer.unref()
}

/** Abortable delay: resolves after `ms`, or rejects with the abort reason. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signalReason(signal))
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signalReason(signal))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Run `call` with one signal that aborts at the timeout or when the caller
 * aborts. A timeout rejects with `onTimeout()`; a caller abort keeps its reason.
 */
async function withDeadline<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  call: (signal: AbortSignal) => Promise<T>,
  onTimeout: () => Error,
): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const either = signal ? AbortSignal.any([signal, timeout]) : timeout
  // Race the call against the signal, so a request that ignores the signal
  // cannot hold the wait or return a result after the deadline.
  const aborted = new Promise<never>((_, reject) => {
    if (either.aborted) reject(signalReason(either))
    else
      either.addEventListener('abort', () => reject(signalReason(either)), {
        once: true,
      })
  })
  const work = call(either)
  // The loser of the race settles later, with nobody waiting for it.
  aborted.catch(() => undefined)
  work.catch(() => undefined)
  try {
    return await Promise.race([work, aborted])
  } catch (error) {
    // An API error is the real answer even when the timeout fires beside it.
    if (!timeout.aborted || signal?.aborted || error instanceof RuntaApiError)
      throw error
    throw onTimeout()
  }
}

function signalReason(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason
  if (reason instanceof Error) return reason
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}
