import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import type {
  ActivityRecord,
  ActivitySnapshotEvent,
  SandboxStatusContent,
} from '@tanstack/ai'

/**
 * Server-side sandbox instance durability.
 *
 * Two independent runs (separate HTTP requests → fresh middleware contexts) for
 * the same thread. The resume uses only the harness route's module-singleton
 * `SandboxInstanceStore` passed to `withSandbox`, plus `withLocks`. The
 * second run must RESUME the sandbox the first created. The route's
 * `withPersistence` stores the `sandbox.status` activity row of each run.
 *
 * Provider-free (fixed AG-UI stream + fake sandbox provider); exempt from aimock.
 */
interface DurabilityResult {
  create: number
  resume: number
  providerSandboxId: string | null
  latestRunId: string | null
  events: Array<string>
  activities: Array<
    Pick<ActivitySnapshotEvent, 'messageId' | 'activityType' | 'content'>
  >
  storedActivities: Array<ActivityRecord>
  /** The message and row ids of the thread, in the order of a reload. */
  reloadOrder: Array<string>
}

/**
 * POST one run of `threadId` to the harness route and return its JSON. With
 * `failBoot: true`, the sandbox start of the run throws.
 */
async function postRun(
  request: APIRequestContext,
  threadId: string,
  runId: string,
  options: {
    failBoot?: boolean
    toolCall?: boolean
    history?: Array<Record<string, unknown>>
  } = {},
) {
  const response = await request.post('/api/sandbox-durability', {
    data: { threadId, runId, ...options },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as DurabilityResult
}

/** The `ready` content of run 1, which created the sandbox. */
function createdStatus(first: DurabilityResult): SandboxStatusContent {
  const sandboxId = first.providerSandboxId
  if (sandboxId === null) throw new Error('run 1 did not create a sandbox')
  return { status: 'ready', provider: 'fake', sandboxId, resumed: false }
}

/** A streamed `sandbox.status` snapshot of the activity row `messageId`. */
function statusSnapshot(messageId: string, content: SandboxStatusContent) {
  return { messageId, activityType: 'sandbox.status', content }
}

/**
 * A stored `sandbox.status` row. Its `index` only places the row in the UI,
 * so the check leaves it out.
 */
function storedStatus(id: string, content: SandboxStatusContent) {
  return expect.objectContaining({
    id,
    activityType: 'sandbox.status',
    content,
  })
}

test.describe('sandbox instance durability (server-side resume)', () => {
  test('a second run resumes the persisted sandbox instead of creating a new one', async ({
    request,
  }) => {
    const threadId = `sandbox-durability-${Date.now()}`

    const firstBody = await postRun(request, threadId, 'run-1')
    expect(firstBody.create).toBe(1)
    expect(firstBody.resume).toBe(0)
    expect(firstBody.providerSandboxId).not.toBeNull()

    const secondBody = await postRun(request, threadId, 'run-2')

    expect(secondBody.create).toBe(1)
    expect(secondBody.resume).toBe(1)
    expect(secondBody.providerSandboxId).toBe(firstBody.providerSandboxId)
    expect(secondBody.latestRunId).toBe('run-2')
  })

  // Core sends RUN_STARTED before the first middleware CUSTOM event, so the
  // lifecycle events come right after it, while setup still runs.
  test('sandbox lifecycle events stream while the sandbox starts', async ({
    request,
  }) => {
    const threadId = `sandbox-lifecycle-${Date.now()}`

    const firstBody = await postRun(request, threadId, 'run-1')
    expect(firstBody.events).toEqual([
      'RUN_STARTED',
      'sandbox.starting',
      'sandbox.created',
    ])

    const secondBody = await postRun(request, threadId, 'run-2')
    expect(secondBody.events).toEqual([
      'RUN_STARTED',
      'sandbox.starting',
      'sandbox.resumed',
    ])
  })

  // Each run has one `sandbox.status` row. A snapshot replaces the row, so the
  // store keeps its last state. The second run must keep the first run's row.
  test('each run streams its sandbox.status row and the store keeps both rows', async ({
    request,
  }) => {
    const threadId = `sandbox-status-${Date.now()}`

    const first = await postRun(request, threadId, 'run-1')
    const firstReady = createdStatus(first)
    expect(first.activities).toEqual([
      statusSnapshot('sandbox-run-1', { status: 'starting', provider: 'fake' }),
      statusSnapshot('sandbox-run-1', firstReady),
    ])

    const second = await postRun(request, threadId, 'run-2')
    const secondReady = { ...firstReady, resumed: true }
    expect(second.activities).toEqual([
      statusSnapshot('sandbox-run-2', { status: 'starting', provider: 'fake' }),
      statusSnapshot('sandbox-run-2', secondReady),
    ])
    expect(second.storedActivities).toEqual([
      storedStatus('sandbox-run-1', firstReady),
      storedStatus('sandbox-run-2', secondReady),
    ])
    // After a reload, each row is right after the user message of its run.
    expect(second.reloadOrder).toEqual([
      'user-run-1',
      'sandbox-run-1',
      'user-run-2',
      'sandbox-run-2',
    ])
  })

  // A harness adapter sends a tool call with no text, so the store keeps that
  // message with no id. The client sends the turn again under its own ids.
  // That is not a reload of the turn, so its row must stay.
  test('a tool call turn keeps its row when the client sends its own ids', async ({
    request,
  }) => {
    const threadId = `sandbox-tool-call-${Date.now()}`

    await postRun(request, threadId, 'run-1', { toolCall: true })
    const second = await postRun(request, threadId, 'run-2', {
      history: [
        { id: 'user-run-1', role: 'user', content: 'go' },
        {
          id: 'client-a1',
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call-run-1',
              type: 'function',
              function: { name: 'bash', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call-run-1', content: 'done' },
      ],
    })

    expect(second.reloadOrder).toEqual([
      'user-run-1',
      'sandbox-run-1',
      'client-a1',
      'user-run-2',
      'sandbox-run-2',
    ])
  })

  // The start of run 3 throws, so the run fails before it starts. The store
  // must keep its `failed` row, and the rows of the earlier runs.
  test('a sandbox start that throws keeps its failed row in the store', async ({
    request,
  }) => {
    const threadId = `sandbox-failed-${Date.now()}`

    const firstReady = createdStatus(await postRun(request, threadId, 'run-1'))
    await postRun(request, threadId, 'run-2')
    const third = await postRun(request, threadId, 'run-3', { failBoot: true })

    expect(third.storedActivities).toEqual([
      storedStatus('sandbox-run-1', firstReady),
      storedStatus('sandbox-run-2', { ...firstReady, resumed: true }),
      storedStatus('sandbox-run-3', {
        status: 'failed',
        provider: 'fake',
        error: 'sandbox boot failed',
      }),
    ])
  })
})
