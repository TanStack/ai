/**
 * In-process fake of the Runta public API, for adapter unit tests.
 *
 * It provides a `fetch` and a `WebSocket` constructor that implement the parts
 * of the API the adapters use: runtime lifecycle with revisions, the file
 * endpoints, checkpoints, and the exec stream. Pass both to `RuntaClient`.
 *
 * Exec runs real local processes, so streaming, stdin, signals and exit codes
 * behave as they do on a runtime. The "runtime filesystem" is the local one:
 * give the fake a temporary `root` and keep every path in a test under it. The
 * file endpoints refuse paths outside `root`.
 *
 * Not simulated: filesystem isolation between runtimes, and filesystem state in
 * checkpoints. A restore creates a new runtime record and nothing more.
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export interface FakeRuntaOptions {
  /** Directory that plays the runtime filesystem. Exec starts here. */
  root: string
  /** API key the fake accepts. */
  apiKey?: string
  /** Endpoint the client is configured with. */
  endpoint?: string
  /** Largest file PUT body, as on the real API. Defaults to 1 MiB. */
  maxFilePutBytes?: number
  /** Whether closing the exec socket kills the process. Defaults to true, as on the real API. */
  killOnSocketClose?: boolean
  /**
   * Ms a lifecycle change takes to land. Until then `status` keeps its old
   * value and only `desired_status` changes, as on the real API. Defaults to 0.
   */
  transitionDelayMs?: number
}

export interface FakeRuntime {
  id: string
  display_name: string
  status: string
  desired_status: string
  revision: number
  ingress_specs: Array<Record<string, unknown>>
  egress_policy: Record<string, unknown>
  idle_policy: Record<string, unknown>
  environment_variables: Record<string, string>
  /** The checkpoint this runtime was restored from, if any. */
  restored_from?: string
  /** The create request body, for assertions. */
  create_body: Record<string, unknown>
}

export interface FakeCheckpoint {
  id: string
  display_name: string
  kind: string
  state: string
  source_runtime: { id: string; name: string }
}

/** One recorded API call. */
export interface FakeRuntaCall {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
}

export class FakeRunta {
  readonly root: string
  readonly apiKey: string
  readonly endpoint: string
  readonly runtimes = new Map<string, FakeRuntime>()
  readonly checkpoints = new Map<string, FakeCheckpoint>()
  /** Every HTTP call the fake received, oldest first. */
  readonly calls: Array<FakeRuntaCall> = []
  /** Start frames received on exec sockets, oldest first. */
  readonly execStarts: Array<{
    runtimeId: string
    command: string
    args: Array<string>
    env: Record<string, string>
  }> = []
  /** Live exec child processes. */
  readonly processes = new Set<ChildProcessWithoutNullStreams>()
  /** Set to make the next mutation fail once with a stale-revision 409. */
  failNextMutationWithConflict = false
  /** Status a runtime gets right after creation. Set to `creating` to test waiting. */
  statusAfterCreate = 'running'

  private readonly maxFilePutBytes: number
  private readonly killOnSocketClose: boolean
  private readonly transitionDelayMs: number
  private readonly idempotency = new Map<string, string>()

  constructor(options: FakeRuntaOptions) {
    this.root = resolve(options.root)
    this.apiKey = options.apiKey ?? 'rt_test'
    this.endpoint = (options.endpoint ?? 'https://api.runta.test').replace(
      /\/+$/,
      '',
    )
    this.maxFilePutBytes = options.maxFilePutBytes ?? 1024 * 1024
    this.killOnSocketClose = options.killOnSocketClose ?? true
    this.transitionDelayMs = options.transitionDelayMs ?? 0
  }

  /** Find a runtime by id or display name. */
  runtime(idOrName: string): FakeRuntime | undefined {
    const byId = this.runtimes.get(idOrName)
    if (byId) return byId
    for (const runtime of this.runtimes.values()) {
      if (runtime.display_name === idOrName) return runtime
    }
    return undefined
  }

  /** Change a runtime's status directly, as the platform would (for example an idle suspend). */
  setStatus(idOrName: string, status: string): void {
    const runtime = this.runtime(idOrName)
    if (!runtime) throw new Error(`FakeRunta: no runtime ${idOrName}`)
    runtime.status = status
    if (['running', 'paused', 'suspended', 'shutdown'].includes(status))
      runtime.desired_status = status
    runtime.revision += 1
  }

  // ------------------------------------------------------------------- fetch

  readonly fetch: typeof fetch = async (input, init) => {
    // The real fetch rejects when its signal is already aborted.
    init?.signal?.throwIfAborted()
    const request = new Request(input, init)
    const url = new URL(request.url)
    const query = Object.fromEntries(url.searchParams)
    const path = url.pathname
    const isFile = /\/files$/.test(path)
    const raw = request.body
      ? new Uint8Array(await request.arrayBuffer())
      : undefined
    let body: unknown
    if (raw && !isFile) {
      try {
        body = JSON.parse(new TextDecoder().decode(raw))
      } catch {
        return error(400, 'invalid_argument', 'request body is not JSON')
      }
    }
    this.calls.push({
      method: request.method,
      path,
      query,
      body: isFile ? raw : body,
    })

    if (request.headers.get('authorization') !== `Bearer ${this.apiKey}`) {
      return error(401, 'unauthenticated', 'invalid API key')
    }
    const segments = path.split('/').filter(Boolean).map(decodeURIComponent)
    if (segments[0] !== 'v2') return error(404, 'not_found', 'unknown path')

    if (segments[1] === 'runtimes') {
      return this.handleRuntimes(
        request,
        segments.slice(2),
        query,
        asRecord(body),
        raw,
      )
    }
    if (segments[1] === 'checkpoints') {
      return this.handleCheckpoints(request.method, segments.slice(2))
    }
    return error(404, 'not_found', 'unknown path')
  }

  private async handleRuntimes(
    request: Request,
    rest: Array<string>,
    query: Record<string, string>,
    body: Record<string, unknown>,
    raw: Uint8Array | undefined,
  ): Promise<Response> {
    const method = request.method
    if (rest.length === 0) {
      if (method === 'GET')
        return data([...this.runtimes.values()].map(publicRuntime))
      if (method === 'POST')
        return this.createRuntime(body, request.headers.get('idempotency-key'))
      return error(405, 'unimplemented', 'method not allowed')
    }

    const runtime = this.runtime(rest[0] ?? '')
    if (!runtime) return error(404, 'not_found', `runtime ${rest[0]} not found`)

    if (rest.length === 1) {
      if (method === 'GET') return data(publicRuntime(runtime))
      const conflict = this.checkRevision(runtime, query)
      if (conflict) return conflict
      if (method === 'DELETE') {
        this.runtimes.delete(runtime.id)
        return data(publicRuntime({ ...runtime, status: 'deleting' }), 202)
      }
      if (method === 'PATCH') {
        if (Array.isArray(body.ingress_specs))
          runtime.ingress_specs = body.ingress_specs.map(asRecord)
        if (body.egress_policy !== undefined)
          runtime.egress_policy = asRecord(body.egress_policy)
        if (body.idle_policy !== undefined)
          runtime.idle_policy = asRecord(body.idle_policy)
        if (body.environment_variables !== undefined) {
          runtime.environment_variables = asRecord(
            body.environment_variables,
          ) as Record<string, string>
        }
        runtime.revision += 1
        return data(publicRuntime(runtime))
      }
      return error(405, 'unimplemented', 'method not allowed')
    }

    const action = rest[1] ?? ''
    if (action === 'files')
      return this.handleFile(method, runtime, query.path, raw)
    if (action === 'checkpoints' && method === 'POST') {
      const checkpoint: FakeCheckpoint = {
        id: randomUUID(),
        display_name:
          typeof body.name === 'string'
            ? body.name
            : `${runtime.display_name}-${this.checkpoints.size + 1}`,
        kind: typeof body.kind === 'string' ? body.kind : 'full',
        state: 'ready',
        source_runtime: { id: runtime.id, name: runtime.display_name },
      }
      this.checkpoints.set(checkpoint.id, checkpoint)
      return data(checkpoint, 201)
    }
    const transitions: Record<string, { from: Array<string>; to: string }> = {
      start: { from: ['shutdown'], to: 'running' },
      pause: { from: ['running'], to: 'paused' },
      resume: { from: ['paused', 'suspended'], to: 'running' },
      stop: { from: ['running', 'paused', 'suspended'], to: 'shutdown' },
    }
    const transition = transitions[action]
    if (transition && method === 'POST') {
      const conflict = this.checkRevision(runtime, query)
      if (conflict) return conflict
      if (!transition.from.includes(runtime.status)) {
        return error(
          400,
          'failed_precondition',
          `cannot ${action} a ${runtime.status} runtime`,
        )
      }
      runtime.desired_status = transition.to
      runtime.revision += 1
      if (this.transitionDelayMs === 0) {
        runtime.status = transition.to
      } else {
        setTimeout(() => {
          if (runtime.desired_status !== transition.to) return
          runtime.status = transition.to
          runtime.revision += 1
        }, this.transitionDelayMs).unref()
      }
      return data(publicRuntime(runtime))
    }
    return error(404, 'not_found', 'unknown path')
  }

  private createRuntime(
    body: Record<string, unknown>,
    idempotencyKey: string | null,
  ): Response {
    if (idempotencyKey) {
      const previous = this.runtimes.get(
        this.idempotency.get(idempotencyKey) ?? '',
      )
      if (previous) return data(publicRuntime(previous), 201)
    }
    const name =
      typeof body.name === 'string'
        ? body.name
        : `runtime-${this.runtimes.size + 1}`
    if (this.runtime(name))
      return error(409, 'already_exists', `runtime ${name} already exists`)
    let restoredFrom: string | undefined
    if (typeof body.checkpoint_id === 'string') {
      const checkpoint = this.checkpoints.get(body.checkpoint_id)
      if (!checkpoint)
        return error(
          404,
          'not_found',
          `checkpoint ${body.checkpoint_id} not found`,
        )
      restoredFrom = checkpoint.id
    }
    const runtime: FakeRuntime = {
      id: randomUUID(),
      display_name: name,
      status: this.statusAfterCreate,
      desired_status: 'running',
      revision: 1,
      ingress_specs: Array.isArray(body.ingress_specs)
        ? body.ingress_specs.map(asRecord)
        : [],
      egress_policy: asRecord(
        body.egress_policy ?? { mode: 'denylist', denied_hosts: [] },
      ),
      idle_policy: asRecord(body.idle_policy ?? { mode: 'disabled' }),
      environment_variables: asRecord(body.environment_variables) as Record<
        string,
        string
      >,
      create_body: body,
      ...(restoredFrom !== undefined ? { restored_from: restoredFrom } : {}),
    }
    this.runtimes.set(runtime.id, runtime)
    if (idempotencyKey) this.idempotency.set(idempotencyKey, runtime.id)
    return data(publicRuntime(runtime), 201)
  }

  private checkRevision(
    runtime: FakeRuntime,
    query: Record<string, string>,
  ): Response | undefined {
    if (query.expected_revision === undefined) {
      return error(400, 'invalid_argument', 'expected_revision is required')
    }
    if (this.failNextMutationWithConflict) {
      this.failNextMutationWithConflict = false
      runtime.revision += 1
      return error(409, 'failed_precondition', 'runtime revision is stale')
    }
    if (Number(query.expected_revision) !== runtime.revision) {
      return error(409, 'failed_precondition', 'runtime revision is stale')
    }
    return undefined
  }

  private async handleFile(
    method: string,
    runtime: FakeRuntime,
    path: string | undefined,
    raw: Uint8Array | undefined,
  ): Promise<Response> {
    if (runtime.status !== 'running') {
      return error(400, 'failed_precondition', `runtime is ${runtime.status}`)
    }
    if (!path || !path.startsWith('/')) {
      return error(400, 'invalid_argument', 'path must be absolute')
    }
    const target = resolve(path)
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      return error(
        400,
        'invalid_argument',
        `FakeRunta: ${path} is outside the fake root ${this.root}`,
      )
    }
    if (method === 'GET') {
      try {
        const bytes = await readFile(target)
        if (bytes.byteLength > this.maxFilePutBytes) {
          return error(
            422,
            'invalid_argument',
            `file is too large to return through the API; maximum is ${this.maxFilePutBytes} bytes`,
          )
        }
        return new Response(bytes, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })
      } catch {
        return error(404, 'not_found', `${path} not found`)
      }
    }
    if (method === 'PUT') {
      const bytes = raw ?? new Uint8Array(0)
      if (bytes.byteLength > this.maxFilePutBytes) {
        return error(413, 'invalid_argument', 'request body too large')
      }
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, bytes)
      return new Response(null, { status: 204 })
    }
    return error(405, 'unimplemented', 'method not allowed')
  }

  private handleCheckpoints(method: string, rest: Array<string>): Response {
    if (rest.length === 0) {
      if (method !== 'GET')
        return error(405, 'unimplemented', 'method not allowed')
      return new Response(
        JSON.stringify({
          data: [...this.checkpoints.values()],
          pagination: { has_more: false, next_cursor: null },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const id = rest[0] ?? ''
    const checkpoint =
      this.checkpoints.get(id) ??
      [...this.checkpoints.values()].find((entry) => entry.display_name === id)
    if (!checkpoint)
      return error(404, 'not_found', `checkpoint ${id} not found`)
    if (method === 'GET') return data(checkpoint)
    if (method === 'DELETE') {
      this.checkpoints.delete(checkpoint.id)
      return new Response(null, { status: 204 })
    }
    return error(405, 'unimplemented', 'method not allowed')
  }

  // --------------------------------------------------------------- WebSocket

  /** A `WebSocket` constructor bound to this fake. Pass it to `RuntaClient`. */
  get WebSocket(): new (
    url: string,
    options: { headers: Record<string, string> },
  ) => WebSocket {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const fake = this
    class FakeExecSocket extends EventTarget {
      static readonly CONNECTING = 0
      static readonly OPEN = 1
      static readonly CLOSING = 2
      static readonly CLOSED = 3
      readonly url: string
      readyState = 0
      bufferedAmount = 0
      binaryType: BinaryType = 'blob'
      private child: ChildProcessWithoutNullStreams | undefined
      private readonly runtime: FakeRuntime | undefined
      private pendingOutput = 0
      private exitCode: number | undefined

      constructor(url: string, options: { headers: Record<string, string> }) {
        super()
        this.url = url
        const headers = lowerCaseKeys(options.headers)
        const match = /\/v2\/runtimes\/([^/]+)\/exec\/stream$/.exec(
          new URL(url).pathname,
        )
        this.runtime = match
          ? fake.runtime(decodeURIComponent(match[1] ?? ''))
          : undefined
        queueMicrotask(() => {
          if (
            headers.authorization !== `Bearer ${fake.apiKey}` ||
            !this.runtime ||
            this.runtime.status !== 'running'
          ) {
            this.fail('exec stream handshake failed')
            return
          }
          this.readyState = 1
          this.dispatchEvent(new Event('open'))
        })
      }

      send(text: string): void {
        if (this.readyState !== 1)
          throw new Error('FakeRunta: socket is not open')
        const frame = asRecord(JSON.parse(text))
        if (!this.child) {
          if (frame.type !== 'start') {
            this.emit({
              type: 'error',
              message: 'first websocket frame must be start',
            })
            this.finish()
            return
          }
          this.start(frame)
          return
        }
        if (frame.type === 'stdin' && typeof frame.data_base64 === 'string') {
          this.child.stdin.write(Buffer.from(frame.data_base64, 'base64'))
        } else if (frame.type === 'close_stdin') {
          this.child.stdin.end()
        } else if (frame.type === 'signal') {
          if (frame.signal === 'INT') this.child.kill('SIGINT')
          else if (frame.signal === 'TERM') this.child.kill('SIGTERM')
          else
            this.emit({
              type: 'error',
              message: `unsupported signal ${String(frame.signal)}`,
            })
        }
      }

      close(): void {
        if (this.readyState >= 2) return
        if (
          this.child &&
          this.exitCode === undefined &&
          fake.killOnSocketClose
        ) {
          this.child.kill('SIGKILL')
        }
        this.finish()
      }

      private start(frame: Record<string, unknown>): void {
        const command = String(frame.command)
        const args = Array.isArray(frame.args) ? frame.args.map(String) : []
        const env = asRecord(frame.env) as Record<string, string>
        const runtime = this.runtime
        if (!runtime) return
        fake.execStarts.push({ runtimeId: runtime.id, command, args, env })
        const child = spawn(command, args, {
          cwd: fake.root,
          env: { ...process.env, ...runtime.environment_variables, ...env },
        })
        this.child = child
        fake.processes.add(child)
        const forward = (type: 'stdout' | 'stderr') => (chunk: Buffer) => {
          this.emit({ type, data_base64: chunk.toString('base64') })
        }
        child.stdout.on('data', forward('stdout'))
        child.stderr.on('data', forward('stderr'))
        child.stdin.on('error', () => undefined)
        child.on('error', (cause) => {
          fake.processes.delete(child)
          this.emit({
            type: 'error',
            message: `failed to start command: ${cause.message}`,
          })
          this.finish()
        })
        child.on('close', (code, signal) => {
          fake.processes.delete(child)
          // The real API reports -1 for a process that a signal terminated.
          this.exitCode = code ?? (signal ? -1 : 1)
          this.emit({ type: 'exit', code: this.exitCode })
          this.finish()
        })
      }

      /** Deliver a server frame on a later tick, in order. */
      private emit(frame: Record<string, unknown>): void {
        this.pendingOutput += 1
        queueMicrotask(() => {
          this.pendingOutput -= 1
          if (this.readyState === 3) return
          this.dispatchEvent(
            new MessageEvent('message', { data: JSON.stringify(frame) }),
          )
        })
      }

      private fail(message: string): void {
        this.dispatchEvent(Object.assign(new Event('error'), { message }))
        this.finish()
      }

      private finish(): void {
        if (this.readyState === 3) return
        this.readyState = 2
        // Let queued frames reach the client before the close event.
        const settle = (): void => {
          if (this.pendingOutput > 0) {
            queueMicrotask(settle)
            return
          }
          this.readyState = 3
          this.dispatchEvent(new Event('close'))
        }
        queueMicrotask(settle)
      }
    }
    return FakeExecSocket as unknown as new (
      url: string,
      options: { headers: Record<string, string> },
    ) => WebSocket
  }
}

function publicRuntime(runtime: FakeRuntime): Record<string, unknown> {
  const { create_body: _createBody, ...rest } = runtime
  return rest
}

function data(value: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data: value }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function error(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message }, request_id: 'fake' }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function lowerCaseKeys(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  )
}
