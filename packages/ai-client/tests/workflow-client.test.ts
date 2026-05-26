import { describe, expect, it } from 'vitest'
import { WorkflowClient } from '../src/workflow-client'
import type {
  WorkflowClientState,
  WorkflowConnectionAdapter,
} from '../src/workflow-client'

/**
 * Build a connection adapter that yields the supplied chunks in order on
 * connect. The first call resolves once consumed; subsequent calls (e.g.
 * the abort POST inside `stop()`) are no-ops.
 */
function makeAdapter(chunks: Array<unknown>): WorkflowConnectionAdapter {
  let calls = 0
  return {
    async *connect() {
      calls++
      if (calls > 1) return
      for (const c of chunks) yield c
    },
  }
}

function waitTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('WorkflowClient — applyJsonPatch root replace (STATE_DELTA path "")', () => {
  it('replaces the whole state when the patch op targets the root', async () => {
    const client = new WorkflowClient({
      connection: makeAdapter([
        { type: 'RUN_STARTED', runId: 'r1', threadId: 'r1', timestamp: 1 },
        // Server emits a root-level replace when prev/next state types
        // differ (e.g., object → array). Path is the empty string per
        // RFC 6902 root-pointer convention.
        {
          type: 'STATE_DELTA',
          delta: [{ op: 'replace', path: '', value: [1, 2, 3] }],
        },
      ]),
    })

    await client.start({ topic: 'x' })

    expect(client.state.state).toEqual([1, 2, 3])
  })

  it('still applies nested-path ops after a root replace', async () => {
    const client = new WorkflowClient({
      connection: makeAdapter([
        { type: 'RUN_STARTED', runId: 'r1', threadId: 'r1', timestamp: 1 },
        {
          type: 'STATE_DELTA',
          delta: [
            { op: 'replace', path: '', value: { a: { b: 1 } } },
            { op: 'replace', path: '/a/b', value: 99 },
          ],
        },
      ]),
    })

    await client.start({ topic: 'x' })

    expect(client.state.state).toEqual({ a: { b: 99 } })
  })
})

describe('WorkflowClient — STEP_FINISHED failure detection', () => {
  it('marks a step `failed` only when content is the engine error envelope', async () => {
    const client = new WorkflowClient({
      connection: makeAdapter([
        { type: 'RUN_STARTED', runId: 'r1', threadId: 'r1', timestamp: 1 },
        {
          type: 'STEP_STARTED',
          stepId: 'agent-1',
          stepName: 'flaky',
          stepType: 'agent',
          timestamp: 2,
        },
        {
          type: 'STEP_FINISHED',
          stepId: 'agent-1',
          stepName: 'flaky',
          // Successful step that happens to return an `error` field —
          // common pattern in tagged-result domains. The static `'error' in
          // content` check used to misclassify this as failed.
          content: { error: null, value: 42 },
          timestamp: 3,
        },
      ]),
    })

    await client.start({ topic: 'x' })

    const step = client.state.steps.find((s) => s.stepId === 'agent-1')
    expect(step?.status).toBe('finished')
  })

  it('marks a step `failed` when content carries an engine error envelope', async () => {
    const client = new WorkflowClient({
      connection: makeAdapter([
        { type: 'RUN_STARTED', runId: 'r1', threadId: 'r1', timestamp: 1 },
        {
          type: 'STEP_STARTED',
          stepId: 'agent-1',
          stepName: 'truly-failed',
          stepType: 'agent',
          timestamp: 2,
        },
        {
          type: 'STEP_FINISHED',
          stepId: 'agent-1',
          stepName: 'truly-failed',
          content: {
            error: { name: 'Error', message: 'boom', stack: 'stack-trace' },
          },
          timestamp: 3,
        },
      ]),
    })

    await client.start({ topic: 'x' })

    const step = client.state.steps.find((s) => s.stepId === 'agent-1')
    expect(step?.status).toBe('failed')
  })
})

describe('WorkflowClient — stop() terminal-state guard', () => {
  it('does not let a late RUN_FINISHED overwrite the local aborted status', async () => {
    // Adapter that emits RUN_STARTED, then waits before emitting
    // RUN_FINISHED — so we can call stop() in the middle.
    let resolveFinished: () => void = () => {}
    const finishedReady = new Promise<void>((r) => (resolveFinished = r))

    const adapter: WorkflowConnectionAdapter = {
      async *connect(body) {
        if ((body as { abort?: boolean })?.abort) {
          // The abort POST itself returns nothing.
          return
        }
        yield {
          type: 'RUN_STARTED',
          runId: 'r1',
          threadId: 'r1',
          timestamp: 1,
        }
        await finishedReady
        yield {
          type: 'RUN_FINISHED',
          runId: 'r1',
          threadId: 'r1',
          timestamp: 2,
          output: { ok: true },
        }
      },
    }

    const client = new WorkflowClient({ connection: adapter })
    void client.start({ topic: 'x' })

    // Wait for the RUN_STARTED to land so we have a runId.
    while (!client.state.runId) await waitTick()
    expect(client.state.status).toBe('running')

    client.stop()
    expect(client.state.status).toBe('aborted')

    // Now release the delayed RUN_FINISHED. The handler must not flip
    // status back to 'finished'.
    resolveFinished()
    await waitTick()
    await waitTick()
    expect(client.state.status).toBe('aborted')
  })

  it('does not set the error field when the run errored with code "aborted"', async () => {
    // The engine emits RUN_ERROR { code: 'aborted' } on stop() — that's
    // user intent, not a failure, so the local error field stays null.
    const client = new WorkflowClient({
      connection: makeAdapter([
        { type: 'RUN_STARTED', runId: 'r1', threadId: 'r1', timestamp: 1 },
        {
          type: 'RUN_ERROR',
          runId: 'r1',
          threadId: 'r1',
          timestamp: 2,
          message: 'Workflow aborted',
          code: 'aborted',
        },
      ]),
    })

    await client.start({ topic: 'x' })

    expect(client.state.status).toBe('aborted')
    expect(client.state.error).toBeNull()
  })
})

describe('WorkflowClient — consumeStream error mapping', () => {
  it('surfaces a stream iteration error as { status: "error", error }', async () => {
    // Adapter whose iterator throws midstream. Without the consumeStream
    // try/catch the client would stay stuck on 'running' even though the
    // returned promise rejects, breaking UI recovery.
    const adapter: WorkflowConnectionAdapter = {
      async *connect() {
        yield {
          type: 'RUN_STARTED',
          runId: 'r1',
          threadId: 'r1',
          timestamp: 1,
        }
        throw new Error('connection blew up')
      },
    }

    const client = new WorkflowClient({ connection: adapter })
    await expect(client.start({ topic: 'x' })).rejects.toThrow(
      'connection blew up',
    )

    expect(client.state.status).toBe('error')
    expect(client.state.error?.message).toBe('connection blew up')
  })

  it('does not flip status to error if the stream errors after stop() set aborted', async () => {
    let resolveError: () => void = () => {}
    const errorReady = new Promise<void>((r) => (resolveError = r))

    const adapter: WorkflowConnectionAdapter = {
      async *connect(body) {
        if ((body as { abort?: boolean })?.abort) return
        yield {
          type: 'RUN_STARTED',
          runId: 'r1',
          threadId: 'r1',
          timestamp: 1,
        }
        await errorReady
        throw new Error('late connection failure')
      },
    }

    const client = new WorkflowClient({ connection: adapter })
    const pending = client.start({ topic: 'x' })

    while (!client.state.runId) await waitTick()
    client.stop()
    expect(client.state.status).toBe('aborted')

    resolveError()
    // The start promise rejects but the local state stays 'aborted' —
    // user intent wins over the late network failure.
    await expect(pending).rejects.toThrow('late connection failure')
    expect(client.state.status).toBe('aborted')
  })
})

describe('WorkflowClient — subscribe initial state', () => {
  it('subscribers can read the current state synchronously without an initial push', () => {
    const client = new WorkflowClient({ connection: makeAdapter([]) })
    let received: WorkflowClientState | null = null
    const unsubscribe = client.subscribe((s) => {
      received = s
    })
    // Per the current contract, subscribe doesn't push immediately — the
    // initial state is readable via `client.state`. Confirm both are
    // self-consistent at idle.
    expect(client.state.status).toBe('idle')
    expect(received).toBeNull()
    unsubscribe()
  })
})
