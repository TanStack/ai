/**
 * Thin client over the Sprites ([sprites.dev](https://sprites.dev)) control
 * plane. Sprites has no published SDK, so this talks the REST + WebSocket API
 * directly: lifecycle (create/get/delete), URL auth, filesystem, and process
 * execution all go through the authenticated cloud endpoint at `baseUrl`.
 *
 * Dependency-free: uses the Node ≥ 20 global `fetch` and `WebSocket` (undici).
 * The exec control socket needs an `Authorization` header on the upgrade
 * request — supported via undici's non-standard `headers` constructor option,
 * which the WHATWG `WebSocket` spec does not define — so this targets the Node
 * runtime, not spec-compliant `WebSocket` environments (browsers, Deno, edge).
 */

export const SPRITES_DEFAULT_BASE_URL = 'https://api.sprites.dev'

/** URL authentication mode for a Sprite's always-on public URL. */
export type SpriteUrlAuth = 'public' | 'sprite'

/** A Sprite as returned by the control-plane API. */
export interface SpriteResource {
  id: string
  name: string
  status: string
  /** Public URL, e.g. `https://<name>-<suffix>.sprites.app`. */
  url: string
  urlAuth?: SpriteUrlAuth
}

/** One entry returned by {@link SpritesClient.fsList}. */
export interface SpriteFsEntry {
  name: string
  path: string
  type: 'file' | 'dir'
}

/** Options for {@link SpritesClient.exec}. */
export interface SpritesExecOptions {
  /** Argument vector; `argv[0]` is the executable. */
  argv: Array<string>
  /** Working directory; defaults to the Sprite login dir when omitted. */
  cwd?: string
  /** Extra environment variables, merged over the Sprite defaults. */
  env?: Record<string, string>
  signal?: AbortSignal
}

/** A live exec stream over the control WebSocket. */
export interface SpritesExecStream {
  stdout: AsyncIterable<string>
  stderr: AsyncIterable<string>
  /** Resolves with the exit code, or rejects on an abnormal close / abort. */
  wait: () => Promise<number>
  kill: () => Promise<void>
}

/** The subset of the client the {@link import('./handle').SpritesHandle} needs. */
export interface SpritesClientLike {
  readonly baseUrl: string
  getSprite: (name: string, signal?: AbortSignal) => Promise<SpriteResource>
  deleteSprite: (name: string, signal?: AbortSignal) => Promise<void>
  setUrlAuth: (
    name: string,
    auth: SpriteUrlAuth,
    signal?: AbortSignal,
  ) => Promise<void>
  fsRead: (name: string, path: string) => Promise<Uint8Array>
  fsWrite: (name: string, path: string, data: Uint8Array) => Promise<void>
  fsList: (name: string, path: string) => Promise<Array<SpriteFsEntry>>
  exec: (name: string, options: SpritesExecOptions) => SpritesExecStream
}

const WS_FRAME_STDOUT = 0x01
const WS_FRAME_STDERR = 0x02
const WS_FRAME_EXIT = 0x03

/** Constructor shape for the undici `WebSocket` with the `headers` option. */
type WsCtor = new (
  url: string,
  options: { headers: Record<string, string> },
) => WebSocket

/**
 * A push-driven async iterable of decoded chunks. The producer pushes and calls
 * `end()` once; consumers `for await` and terminate cleanly.
 */
class AsyncChunkQueue implements AsyncIterable<string> {
  private readonly chunks: Array<string> = []
  private readonly waiters: Array<(r: IteratorResult<string>) => void> = []
  private ended = false

  push(chunk: string): void {
    if (chunk === '') return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: chunk, done: false })
    else this.chunks.push(chunk)
  }

  end(): void {
    this.ended = true
    let waiter = this.waiters.shift()
    while (waiter) {
      waiter({ value: undefined, done: true })
      waiter = this.waiters.shift()
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: () => {
        const chunk = this.chunks.shift()
        if (chunk !== undefined) {
          return Promise.resolve({ value: chunk, done: false })
        }
        if (this.ended) {
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise((resolve) => this.waiters.push(resolve))
      },
    }
  }
}

export interface SpritesClientConfig {
  apiKey: string
  baseUrl?: string
}

export class SpritesClient implements SpritesClientLike {
  readonly baseUrl: string
  private readonly apiKey: string

  constructor(config: SpritesClientConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = (config.baseUrl ?? SPRITES_DEFAULT_BASE_URL).replace(
      /\/+$/,
      '',
    )
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { authorization: `Bearer ${this.apiKey}`, ...extra }
  }

  private spritePath(name: string, suffix = ''): string {
    return `${this.baseUrl}/v1/sprites/${encodeURIComponent(name)}${suffix}`
  }

  async createSprite(
    name: string,
    options: { waitForCapacity?: boolean; signal?: AbortSignal } = {},
  ): Promise<SpriteResource> {
    const response = await fetch(`${this.baseUrl}/v1/sprites`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        name,
        ...(options.waitForCapacity !== undefined
          ? { wait_for_capacity: options.waitForCapacity }
          : {}),
      }),
      ...(options.signal ? { signal: options.signal } : {}),
    })
    if (!response.ok) {
      await this.fail('POST', `${this.baseUrl}/v1/sprites`, response)
    }
    return parseSprite(await response.text())
  }

  async getSprite(name: string, signal?: AbortSignal): Promise<SpriteResource> {
    const response = await fetch(this.spritePath(name), {
      method: 'GET',
      headers: this.headers(),
      ...(signal ? { signal } : {}),
    })
    if (!response.ok) await this.fail('GET', this.spritePath(name), response)
    return parseSprite(await response.text())
  }

  async deleteSprite(name: string, signal?: AbortSignal): Promise<void> {
    const response = await fetch(this.spritePath(name), {
      method: 'DELETE',
      headers: this.headers(),
      ...(signal ? { signal } : {}),
    })
    // A missing Sprite is already deleted.
    if (!response.ok && response.status !== 404) {
      await this.fail('DELETE', this.spritePath(name), response)
    }
    await response.body?.cancel()
  }

  async setUrlAuth(
    name: string,
    auth: SpriteUrlAuth,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(this.spritePath(name), {
      method: 'PUT',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ url_settings: { auth } }),
      ...(signal ? { signal } : {}),
    })
    if (!response.ok) await this.fail('PUT', this.spritePath(name), response)
    await response.body?.cancel()
  }

  async fsRead(name: string, path: string): Promise<Uint8Array> {
    const url = this.spritePath(name, `/fs/read?path=${encodeURIComponent(path)}`)
    const response = await fetch(url, { method: 'GET', headers: this.headers() })
    if (!response.ok) await this.fail('GET', url, response)
    return new Uint8Array(await response.arrayBuffer())
  }

  async fsWrite(name: string, path: string, data: Uint8Array): Promise<void> {
    const url = this.spritePath(
      name,
      `/fs/write?path=${encodeURIComponent(path)}`,
    )
    // Copy into a fresh ArrayBuffer-backed view so the body is a plain BodyInit.
    const response = await fetch(url, {
      method: 'PUT',
      headers: this.headers({ 'content-type': 'application/octet-stream' }),
      body: data.slice(),
    })
    if (!response.ok) await this.fail('PUT', url, response)
    await response.body?.cancel()
  }

  async fsList(name: string, path: string): Promise<Array<SpriteFsEntry>> {
    const url = this.spritePath(name, `/fs/list?path=${encodeURIComponent(path)}`)
    const response = await fetch(url, { method: 'GET', headers: this.headers() })
    if (!response.ok) await this.fail('GET', url, response)
    const body = (await response.json()) as {
      entries?: Array<{ name?: unknown; path?: unknown; isDir?: unknown }>
    }
    return (body.entries ?? []).map((entry) => ({
      name: String(entry.name ?? ''),
      path: String(entry.path ?? ''),
      type: entry.isDir === true ? ('dir' as const) : ('file' as const),
    }))
  }

  private async killSession(name: string, sessionId: string): Promise<void> {
    const response = await fetch(
      this.spritePath(name, `/exec/${encodeURIComponent(sessionId)}/kill`),
      { method: 'POST', headers: this.headers() },
    ).catch(() => undefined)
    await response?.body?.cancel()
  }

  exec(name: string, options: SpritesExecOptions): SpritesExecStream {
    const query = new URLSearchParams()
    for (const arg of options.argv) query.append('cmd', arg)
    if (options.cwd !== undefined) query.set('dir', options.cwd)
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        query.append('env', `${key}=${value}`)
      }
    }

    const wsBase = this.baseUrl.replace(/^http(s?):\/\//, 'ws$1://')
    const url = `${wsBase}/v1/sprites/${encodeURIComponent(name)}/exec?${query.toString()}`
    // The query carries cmd/env (possibly secrets); never surface it in errors.
    const safeUrl = `${wsBase}/v1/sprites/${encodeURIComponent(name)}/exec`

    const stdoutQ = new AsyncChunkQueue()
    const stderrQ = new AsyncChunkQueue()
    const outDecoder = new TextDecoder()
    const errDecoder = new TextDecoder()

    let sessionId: string | undefined
    let exitCode: number | undefined
    let exitObserved = false
    let settled = false
    let socketError: Error | undefined
    const pendingParses: Array<Promise<void>> = []
    let onAbort: (() => void) | undefined
    let resolveClosed!: () => void
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve
    })

    // The global (undici) WebSocket accepts a `headers` constructor option at
    // runtime, but the WHATWG type only declares `(url, protocols?)`, so the two
    // constructor signatures don't structurally overlap — bridge via `unknown`.
    // eslint-disable-next-line no-restricted-syntax -- undici headers option not in the DOM WebSocket type
    const WebSocketCtor = WebSocket as unknown as WsCtor
    const ws = new WebSocketCtor(url, { headers: this.headers() })
    ws.binaryType = 'arraybuffer'

    const finish = (): void => {
      if (settled) return
      settled = true
      if (onAbort && options.signal) {
        options.signal.removeEventListener('abort', onAbort)
      }
      stdoutQ.push(outDecoder.decode())
      stderrQ.push(errDecoder.decode())
      stdoutQ.end()
      stderrQ.end()
      resolveClosed()
    }

    ws.addEventListener('message', (event: MessageEvent) => {
      const data: unknown = event.data
      if (typeof data === 'string') {
        pendingParses.push(
          parseJson(data).then((message) => {
            if (message === undefined) return
            if (message.type === 'session_info') {
              if (typeof message.session_id === 'string') {
                sessionId = message.session_id
              }
            } else if (message.type === 'exit') {
              if (typeof message.exit_code === 'number') {
                exitCode = message.exit_code
                exitObserved = true
              }
            }
          }),
        )
        return
      }
      if (data instanceof ArrayBuffer && data.byteLength > 0) {
        const bytes = new Uint8Array(data)
        const kind = bytes[0]
        const payload = bytes.subarray(1)
        if (kind === WS_FRAME_STDOUT) {
          stdoutQ.push(outDecoder.decode(payload, { stream: true }))
        } else if (kind === WS_FRAME_STDERR) {
          stderrQ.push(errDecoder.decode(payload, { stream: true }))
        } else if (kind === WS_FRAME_EXIT) {
          exitObserved = true
          exitCode = payload[0] ?? 0
        }
      }
    })

    ws.addEventListener('error', (event: Event) => {
      const message = (event as Partial<ErrorEvent>).message
      socketError ??= new Error(
        `Sprites exec WebSocket error for ${safeUrl}: ${message ?? 'unknown error'}`,
      )
    })

    ws.addEventListener('close', () => finish())

    const kill = async (): Promise<void> => {
      await Promise.allSettled(pendingParses)
      if (sessionId !== undefined) await this.killSession(name, sessionId)
      try {
        ws.close()
      } catch {
        // already closing/closed
      }
    }

    if (options.signal) {
      onAbort = (): void => {
        void kill()
      }
      if (options.signal.aborted) onAbort()
      else options.signal.addEventListener('abort', onAbort)
    }

    return {
      stdout: stdoutQ,
      stderr: stderrQ,
      wait: async (): Promise<number> => {
        await closed
        await Promise.allSettled(pendingParses)
        if (exitObserved) return exitCode ?? 0
        if (options.signal?.aborted) {
          throw options.signal.reason instanceof Error
            ? options.signal.reason
            : new Error('Sprites exec aborted')
        }
        // Closed without an exit: a dropped/abnormal connection. Surface it
        // rather than masquerading as a successful exit 0.
        throw (
          socketError ??
          new Error(
            `Sprites exec connection closed before the process reported an exit code (${safeUrl}).`,
          )
        )
      },
      kill,
    }
  }

  private async fail(
    method: string,
    url: string,
    response: Response,
  ): Promise<never> {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Sprites API ${method} ${url} failed: ${response.status} ${response.statusText}${
        body ? ` — ${body}` : ''
      }`,
    )
  }
}

interface ExecControlMessage {
  type?: string
  session_id?: unknown
  exit_code?: unknown
}

function parseJson(text: string): Promise<ExecControlMessage | undefined> {
  return Promise.resolve().then(() => {
    try {
      return JSON.parse(text) as ExecControlMessage
    } catch {
      return undefined
    }
  })
}

function parseSprite(text: string): SpriteResource {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`Sprites API returned a non-JSON response: ${text}`)
  }
  const record = value as {
    id?: unknown
    name?: unknown
    status?: unknown
    url?: unknown
    url_settings?: { auth?: unknown }
  }
  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.url !== 'string'
  ) {
    throw new Error(`Sprites API returned an unexpected sprite shape: ${text}`)
  }
  const auth = record.url_settings?.auth
  return {
    id: record.id,
    name: record.name,
    status: typeof record.status === 'string' ? record.status : 'unknown',
    url: record.url,
    ...(auth === 'public' || auth === 'sprite' ? { urlAuth: auth } : {}),
  }
}
