export interface WorkflowApproval {
  approvalId: string
  description?: string
  title: string
}

export interface WorkflowError {
  code?: string
  message: string
}

export type WorkflowStatus =
  | 'aborted'
  | 'error'
  | 'finished'
  | 'idle'
  | 'paused'
  | 'running'

export interface WorkflowStep {
  finishedAt?: number
  /** Result from STEP_FINISHED.content */
  result?: unknown
  startedAt: number
  stepId: string
  stepName: string
  stepType?: 'agent' | 'approval' | 'nested-workflow' | 'step' | 'signal'
  status: 'failed' | 'finished' | 'running'
}

/** Generic signal waiting on the server side, surfaced for attach /
 *  resume UIs that aren't approval-shaped. */
export interface WorkflowSignalWait {
  signalName: string
  deadline?: number
  meta?: Record<string, unknown>
}

export interface WorkflowClientState<TState = unknown, TOutput = unknown> {
  /** Live text accumulating in the active agent step, for streaming UI. */
  currentStep: WorkflowStep | null
  currentText: string
  error: WorkflowError | null
  output: TOutput | null
  pendingApproval: WorkflowApproval | null
  /** Non-approval signal the run is currently waiting on. Surfaces when
   *  user code yields `waitForSignal(name)` or `sleep(...)`. Mutually
   *  exclusive with `pendingApproval` in practice. */
  pendingSignal: WorkflowSignalWait | null
  runId: string | null
  state: TState | null
  status: WorkflowStatus
  steps: Array<WorkflowStep>
}

/**
 * Minimal connection adapter interface for workflows. Accepts any body,
 * yields raw parsed event objects.
 */
export interface WorkflowConnectionAdapter {
  connect: (
    body: unknown,
    abortSignal?: AbortSignal,
  ) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>
}

export interface WorkflowClientOptions {
  /** Optional: arbitrary extra body fields to send with the start request. */
  body?: Record<string, unknown>
  /** Connection adapter for sending requests and receiving events. */
  connection: WorkflowConnectionAdapter
  onCustomEvent?: (name: string, value: Record<string, unknown>) => void
  onStateChange?: (state: WorkflowClientState) => void
}

const initialState: WorkflowClientState = {
  currentStep: null,
  currentText: '',
  error: null,
  output: null,
  pendingApproval: null,
  pendingSignal: null,
  runId: null,
  state: null,
  status: 'idle',
  steps: [],
}

/**
 * Headless workflow run client. Composes the same connection adapters as
 * ChatClient. Subscribers see a reducer-driven state that mirrors the
 * server-side workflow run.
 */
export class WorkflowClient<
  TInput = unknown,
  TOutput = unknown,
  TState = unknown,
> {
  private clientState: WorkflowClientState<TState, TOutput> = {
    ...initialState,
  } as WorkflowClientState<TState, TOutput>
  private opts: WorkflowClientOptions
  private subscribers = new Set<
    (s: WorkflowClientState<TState, TOutput>) => void
  >()

  constructor(opts: WorkflowClientOptions) {
    this.opts = opts
  }

  get state(): WorkflowClientState<TState, TOutput> {
    return this.clientState
  }

  subscribe(cb: (s: WorkflowClientState<TState, TOutput>) => void): () => void {
    this.subscribers.add(cb)
    return () => {
      this.subscribers.delete(cb)
    }
  }

  async approve(approved: boolean, feedback?: string): Promise<void> {
    if (!this.clientState.pendingApproval || !this.clientState.runId) {
      throw new Error('No pending approval')
    }
    const approvalId = this.clientState.pendingApproval.approvalId
    const runId = this.clientState.runId
    this.setState({
      pendingApproval: null,
      status: 'running',
    })
    const workflowStream = this.openStream({
      approval: { approvalId, approved, feedback },
      runId,
    })
    await this.consumeStream(workflowStream)
  }

  /**
   * Start a new run. `runId` is optional — when omitted the client
   * library generates one with `crypto.randomUUID()` so the request is
   * idempotent against double-submits and network retries. The server's
   * idempotency check (Q8) compares fingerprints on collision and either
   * serves the existing run as an attach snapshot or rejects with
   * `run_id_conflict`.
   */
  async start(
    input: TInput,
    options?: { runId?: string },
  ): Promise<void> {
    const runId = options?.runId ?? `run_${globalThis.crypto.randomUUID()}`
    this.setState({
      ...(initialState as WorkflowClientState<TState, TOutput>),
      runId,
      status: 'running',
    })
    const workflowStream = this.openStream({ input, runId })
    await this.consumeStream(workflowStream)
  }

  /**
   * Attach to an existing run by `runId`. Resets local state and reads
   * the server's snapshot (state + completed steps + pending pause) so
   * the UI can rebuild from scratch. Used for browser tab refresh,
   * shared run links, and reconnect after a network drop.
   */
  async attach(runId: string): Promise<void> {
    this.setState({
      ...(initialState as WorkflowClientState<TState, TOutput>),
      runId,
      status: 'running',
    })
    const workflowStream = this.openStream({ attach: true, runId })
    await this.consumeStream(workflowStream)
  }

  /**
   * Generic signal delivery — wakes a run paused on
   * `waitForSignal(name)`. `signalId` is an idempotency token the
   * caller is responsible for picking (typically a UUID derived from
   * the upstream event identifier).
   */
  async signal(
    name: string,
    payload: unknown,
    options?: { signalId?: string },
  ): Promise<void> {
    if (!this.clientState.runId) throw new Error('No run in progress')
    const runId = this.clientState.runId
    const signalId =
      options?.signalId ??
      globalThis.crypto.randomUUID()
    this.setState({
      pendingApproval: null,
      pendingSignal: null,
      status: 'running',
    })
    const workflowStream = this.openStream({
      runId,
      signal: { signalId, name, payload },
    })
    await this.consumeStream(workflowStream)
  }

  stop(): void {
    if (!this.clientState.runId) return
    this.openStream({
      abort: true,
      runId: this.clientState.runId,
    })
    this.setState({ status: 'aborted' })
  }

  // ---------- internal ----------

  private async consumeStream(stream: AsyncIterable<unknown>): Promise<void> {
    for await (const raw of stream) {
      this.handleChunk(raw as Record<string, unknown>)
    }
  }

  private handleChunk(chunk: Record<string, unknown>): void {
    const type = chunk.type as string
    switch (type) {
      case 'CUSTOM': {
        const name = chunk.name as string
        const value = chunk.value as Record<string, unknown>
        if (
          name === 'approval-requested' &&
          (value as { kind?: string }).kind === 'workflow'
        ) {
          this.setState({
            pendingApproval: {
              approvalId: value.approvalId as string,
              description: value.description as string | undefined,
              title: value.title as string,
            },
            status: 'paused',
          })
        } else if (name === 'steps-snapshot') {
          // Attach response: rebuild the steps array from the
          // persisted log. Each entry has a synthetic stepId derived
          // from its index so subsequent STEP_FINISHED events (if any
          // are tailed live after the snapshot) can match by stepId.
          const stepRecords = value.steps as Array<{
            index: number
            kind: WorkflowStep['stepType']
            name: string
            result?: unknown
            error?: { message: string }
            startedAt: number
            finishedAt?: number
          }>
          const steps: Array<WorkflowStep> = stepRecords.map((r) => ({
            startedAt: r.startedAt,
            finishedAt: r.finishedAt,
            status: r.error ? 'failed' : 'finished',
            stepId: `snapshot:${r.index}`,
            stepName: r.name,
            stepType: r.kind,
            result: r.error ? { error: r.error } : r.result,
          }))
          this.setState({ steps })
        } else if (name === 'run.paused') {
          // The run is waiting for a signal. For the '__approval'
          // signal we already populated pendingApproval; for anything
          // else, surface as pendingSignal so a UI can render a
          // generic "waiting on X" affordance.
          const signalName = value.signalName as string
          if (signalName === '__approval') {
            // approval-requested already handled above; ignore.
          } else {
            this.setState({
              pendingSignal: {
                signalName,
                deadline: value.deadline as number | undefined,
                meta: value.meta as Record<string, unknown> | undefined,
              },
              status: 'paused',
            })
          }
        } else {
          this.opts.onCustomEvent?.(name, value)
        }
        break
      }
      case 'RUN_ERROR': {
        const code = chunk.code as string | undefined
        this.setState({
          error: {
            code,
            message: chunk.message as string,
          },
          status: code === 'aborted' ? 'aborted' : 'error',
        })
        break
      }
      case 'RUN_FINISHED':
        this.setState({
          status: 'finished',
          output: chunk.output as TOutput,
        } as Partial<WorkflowClientState<TState, TOutput>>)
        break
      case 'RUN_STARTED':
        this.setState({
          runId: chunk.runId as string,
          status: 'running',
        } as Partial<WorkflowClientState<TState, TOutput>>)
        break
      case 'STATE_DELTA': {
        const next = applyJsonPatch(
          this.clientState.state,
          chunk.delta as Array<Record<string, unknown>>,
        )
        this.setState({ state: next as TState })
        break
      }
      case 'STATE_SNAPSHOT':
        this.setState({ state: chunk.snapshot as TState })
        break
      case 'STEP_FINISHED': {
        const stepId = chunk.stepId as string
        const content: unknown = chunk.content
        const isFailed =
          content !== null &&
          typeof content === 'object' &&
          'error' in (content as Record<string, unknown>)
        const updated = this.clientState.steps.map((s) =>
          s.stepId === stepId
            ? {
                ...s,
                finishedAt: chunk.timestamp as number,
                result: content,
                status: isFailed ? ('failed' as const) : ('finished' as const),
              }
            : s,
        )
        this.setState({ currentStep: null, currentText: '', steps: updated })
        break
      }
      case 'STEP_STARTED': {
        const step: WorkflowStep = {
          startedAt: chunk.timestamp as number,
          status: 'running',
          stepId: chunk.stepId as string,
          stepName: chunk.stepName as string,
          stepType: chunk.stepType as WorkflowStep['stepType'],
        }
        this.setState({
          currentStep: step,
          currentText: '',
          steps: [...this.clientState.steps, step],
        })
        break
      }
      case 'TEXT_MESSAGE_CONTENT':
        this.setState({
          currentText: this.clientState.currentText + (chunk.delta as string),
        })
        break
    }
  }

  private openStream(
    body: Record<string, unknown>,
    abortSignal?: AbortSignal,
  ): AsyncIterable<unknown> {
    const fullBody = { ...this.opts.body, ...body }
    const conn = this.opts.connection
    return (async function* () {
      yield* await conn.connect(fullBody, abortSignal)
    })()
  }

  private setState(patch: Partial<WorkflowClientState<TState, TOutput>>): void {
    this.clientState = { ...this.clientState, ...patch }
    for (const sub of this.subscribers) sub(this.clientState)
    this.opts.onStateChange?.(this.clientState as WorkflowClientState)
  }
}

// Minimal RFC 6902 patch applier — keeps the client zero-dep on json-patch libs.
// Handles replace/add/remove on nested paths and array indices.
function applyJsonPatch(
  base: unknown,
  ops: Array<Record<string, unknown>>,
): unknown {
  const doc =
    base === null || base === undefined
      ? {}
      : (structuredClone(base) as Record<string, unknown>)
  for (const op of ops) {
    const segments = String(op.path)
      .split('/')
      .slice(1)
      .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    if (op.op === 'replace' || op.op === 'add') {
      setAt(doc, segments, op.value)
    } else if (op.op === 'remove') {
      removeAt(doc, segments)
    }
  }
  return doc
}

function removeAt(
  target: Record<string, unknown>,
  segments: Array<string>,
): void {
  if (segments.length === 0) return
  const last = segments[segments.length - 1]!
  let cursor: Record<string, unknown> = target
  for (let i = 0; i < segments.length - 1; i++) {
    cursor = cursor[segments[i]!] as Record<string, unknown>
  }
  if (Array.isArray(cursor))
    (cursor as unknown as Array<unknown>).splice(Number(last), 1)
  else delete cursor[last]
}

function setAt(
  target: Record<string, unknown>,
  segments: Array<string>,
  value: unknown,
): void {
  if (segments.length === 0) return
  const last = segments[segments.length - 1]!
  let cursor: Record<string, unknown> = target
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!
    if (cursor[seg] === undefined) cursor[seg] = {}
    cursor = cursor[seg] as Record<string, unknown>
  }
  cursor[last] = value
}
