import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * Activities on the harness protocol. The `x-harness-idle: close` header
 * picks the host that closes an idle session at once, so after the turn,
 * each read loads the thread from the log, as after a reload.
 */

const BASE = '/api/harness-protocol'

type Chunk = { type: string; content?: unknown }

/** The requests of one test to the harness protocol route. */
function harnessOf(
  request: APIRequestContext,
  testId: string,
  aimockPort: number,
) {
  const headers = {
    authorization: 'Bearer e2e-token',
    'x-test-id': testId,
    'x-aimock-port': String(aimockPort),
    'x-harness-idle': 'close',
  }
  const json = { ...headers, 'content-type': 'application/json' }
  const read = async (route: string, threadId: string) => {
    const query = new URLSearchParams({ threadId })
    return (await request.get(`${BASE}/${route}?${query}`, { headers })).json()
  }
  return {
    /** Run a turn with one user message. It gives the events of the turn. */
    run: async (threadId: string, runId: string, content: string) => {
      const response = await request.post(`${BASE}/run`, {
        headers: json,
        data: {
          threadId,
          runId,
          messages: [{ id: 'u1', role: 'user', content }],
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        },
      })
      // The stream ends when the turn ends.
      const events: Array<Chunk> = (await response.text())
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice(6)))
      return events
    },
    /** Run a command. The command can end after the answer. */
    command: async (threadId: string, name: string) =>
      (
        await request.post(`${BASE}/control`, {
          headers: json,
          data: { threadId, input: { op: 'command', name } },
        })
      ).json(),
    /** The activities of the snapshot of the thread. */
    snapshot: async (threadId: string) =>
      (await read('snapshot', threadId)).activities,
    /** The activities of a new session view, which loads the thread again. */
    view: (threadId: string) => read('view-activities', threadId),
  }
}

test.describe('harness activities', () => {
  test('keeps the last step of a tool activity in the snapshot and in a new view after the session closed', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const harness = harnessOf(request, testId, aimockPort)
    const threadId = `activities-${testId}`
    // The run id is also the input id, so each test needs its own.
    const runId = `activities-run-${testId}`
    // `deployWithProgress` sends step 1, then step 2, of one
    // `deploy.progress` activity.
    const events = await harness.run(
      threadId,
      runId,
      '[harness-activities] deploy with progress',
    )
    const steps = events
      .filter((event) => event.type === 'ACTIVITY_SNAPSHOT')
      .map((event) => event.content)

    expect(steps).toEqual([
      { step: 1, total: 2 },
      { step: 2, total: 2 },
    ])

    // One row: step 2 replaced step 1. The turn ran as the run id.
    const progress = {
      id: 'deploy-progress',
      activityType: 'deploy.progress',
      content: { step: 2, total: 2 },
      operationId: runId,
    }
    expect(await harness.snapshot(threadId)).toEqual([progress])
    expect(await harness.view(threadId)).toEqual([progress])
  })

  test('/compact keeps only the newest sandbox.status row in the snapshot and in a new view', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const harness = harnessOf(request, testId, aimockPort)
    const threadId = `sandboxes-${testId}`
    const runId = `sandboxes-run-${testId}`
    // `startSandboxes` sends a row for `sandbox-run-1`, then a row for
    // `sandbox-run-2`. The summary call of `/compact` has the transcript in
    // its user message, so in `fixtures/harness/activities.json` its fixture
    // comes before the turn fixtures.
    await harness.run(
      threadId,
      runId,
      '[harness-activities] start two sandboxes',
    )
    const older = {
      id: 'sandbox-run-1',
      activityType: 'sandbox.status',
      content: { status: 'ready', provider: 'e2e' },
      operationId: runId,
    }
    const newest = {
      id: 'sandbox-run-2',
      activityType: 'sandbox.status',
      content: { status: 'starting', provider: 'e2e' },
      operationId: runId,
    }
    expect(await harness.snapshot(threadId)).toEqual([older, newest])

    expect(await harness.command(threadId, 'compact')).toMatchObject({
      status: 'accepted',
    })

    // The command ends after the answer. Then only the newest row stays.
    await expect.poll(() => harness.snapshot(threadId)).toEqual([newest])
    expect(await harness.view(threadId)).toEqual([newest])
  })
})
