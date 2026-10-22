import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

const ROUTE = '/api/harness-waits'

interface Started {
  error?: string
  runId: string
  threadId: string
}

interface Wait {
  waitId: string
  kind: string
  runId: string
  expiresAt?: number
  message?: string
  turn?: boolean
  agent?: string
}

interface Debug {
  error?: string
  turn: { text?: string; interrupts?: number; error?: string }
  status: string
  pendingWaits: Array<Wait>
  transcript: Array<{ role: string; text: string }>
  records: Array<{ type: string } & Record<string, unknown>>
  modelCallsA: number
  modelCallsB: number
}

/** Start the turn of `scenario` on host A. */
async function start(
  request: APIRequestContext,
  scenario: 'approval' | 'expiry' | 'agent-approval',
) {
  const res = await request.post(`${ROUTE}/start`, { data: { scenario } })
  expect(res.ok()).toBe(true)
  const started: Started = await res.json()
  expect(started.error ?? null).toBeNull()
  return started
}

async function debug(request: APIRequestContext, runId: string) {
  const res = await request.get(`${ROUTE}/debug?runId=${runId}`)
  const read: Debug = await res.json()
  return read
}

/** Read the run until `isDone` is true for it. */
async function readUntil(
  request: APIRequestContext,
  runId: string,
  isDone: (read: Debug) => boolean,
) {
  let read: Debug | undefined
  await expect
    .poll(
      async () => {
        read = await debug(request, runId)
        return read.error ?? isDone(read)
      },
      // Short intervals: the test must see the wait before it expires.
      { timeout: 20_000, intervals: [100, 250] },
    )
    .toBe(true)
  return read!
}

const stop = (request: APIRequestContext, runId: string) =>
  request.post(`${ROUTE}/stop?runId=${runId}`)

/** Approve the wait `waitId` on host B with the answer `payload`. */
async function approve(
  request: APIRequestContext,
  { runId, threadId }: Started,
  waitId: string,
  payload: unknown = true,
) {
  const res = await request.post(`${ROUTE}/control?runId=${runId}`, {
    data: {
      threadId,
      input: {
        op: 'resolve',
        resume: [{ interruptId: waitId, status: 'resolved', payload }],
      },
    },
  })
  expect(res.ok()).toBe(true)
  expect(await res.json()).toMatchObject({ status: 'accepted' })
}

test.describe('harness: durable waits', () => {
  test('an approval asked on one server is answered on another', async ({
    request,
  }) => {
    const started = await start(request, 'approval')
    try {
      // The turn on host A stops before `deploy` runs. Host B reads the
      // approval wait from the log.
      const asked = await readUntil(
        request,
        started.runId,
        (read) => read.pendingWaits.length > 0,
      )
      expect(asked.status).toBe('requires_action')
      expect(asked.pendingWaits).toEqual([
        expect.objectContaining({
          kind: 'approval',
          message: expect.stringContaining('deploy'),
        }),
      ])
      const [wait] = asked.pendingWaits
      // Only host A called the model, and the tool did not run.
      expect(asked.modelCallsA).toBe(1)
      expect(asked.modelCallsB).toBe(0)
      expect(asked.transcript.map((message) => message.role)).toEqual([
        'user',
        'assistant',
      ])

      // The user approves on host B.
      await approve(request, started, wait!.waitId)

      const read = await readUntil(
        request,
        started.runId,
        (done) => done.status === 'idle' && done.transcript.length === 4,
      )
      // The first turn ended for the wait. The turn went on after the
      // answer: the tool ran, and the model answered with its result.
      expect(read.turn).toEqual({ text: '', interrupts: 1 })
      expect(read.transcript).toEqual([
        { role: 'user', text: '[harness-waits] approval' },
        expect.objectContaining({ role: 'assistant' }),
        { role: 'tool', text: '{"deployed":"v2"}' },
        { role: 'assistant', text: 'Deployed v2.' },
      ])
      expect(read.pendingWaits).toEqual([])
      // Host A released the log when its turn stopped, so the host that
      // took the answer ran the rest of the turn. Each host called the
      // model once.
      expect(read.modelCallsA).toBe(1)
      expect(read.modelCallsB).toBe(1)
      // The log keeps the wait and its answer.
      expect(read.records).toEqual([
        expect.objectContaining({
          type: 'harness.interrupt',
          interrupt: expect.objectContaining({ interruptId: wait!.waitId }),
        }),
        expect.objectContaining({
          type: 'harness.interrupt.end',
          interruptId: wait!.waitId,
          status: 'resolved',
          response: true,
        }),
      ])
    } finally {
      await stop(request, started.runId)
    }
  })

  test('an approval accepts the answer of a session view, and the tool runs', async ({
    request,
  }) => {
    const started = await start(request, 'approval')
    try {
      const asked = await readUntil(
        request,
        started.runId,
        (read) => read.pendingWaits.length > 0,
      )
      // A session view sends the core resolution `{ approved, payload }`.
      await approve(request, started, asked.pendingWaits[0]!.waitId, {
        approved: true,
        payload: 'always',
      })

      const read = await readUntil(
        request,
        started.runId,
        (done) => done.status === 'idle' && done.transcript.length === 4,
      )
      // `permissions()` took the answer as a yes: `deploy` ran, and the
      // model answered with its result.
      expect(read.transcript.slice(2)).toEqual([
        { role: 'tool', text: '{"deployed":"v2"}' },
        { role: 'assistant', text: 'Deployed v2.' },
      ])
    } finally {
      await stop(request, started.runId)
    }
  })

  test('the approval of an agent that the model calls as a tool is a wait of the turn, and the agent result reaches the answer', async ({
    request,
  }) => {
    const started = await start(request, 'agent-approval')
    try {
      // The model of `writer` calls `deploy`, and the turn stops for the
      // approval. The wait names the agent.
      const asked = await readUntil(
        request,
        started.runId,
        (read) => read.pendingWaits.length > 0,
      )
      expect(asked.status).toBe('requires_action')
      expect(asked.pendingWaits).toEqual([
        expect.objectContaining({
          kind: 'approval',
          turn: true,
          agent: 'writer',
          message: expect.stringContaining('deploy'),
        }),
      ])
      // The main model and the agent each called their model once.
      expect(asked.modelCallsA).toBe(2)
      expect(asked.modelCallsB).toBe(0)

      await approve(request, started, asked.pendingWaits[0]!.waitId)

      const read = await readUntil(
        request,
        started.runId,
        (done) => done.status === 'idle' && done.transcript.length === 4,
      )
      expect(read.turn).toEqual({ text: '', interrupts: 1 })
      // The agent went on from its approval, and the main model got the
      // result of the agent as the tool result.
      expect(read.transcript).toEqual([
        { role: 'user', text: '[harness-waits] agent-approval' },
        expect.objectContaining({ role: 'assistant' }),
        { role: 'tool', text: expect.stringContaining('Writer: deployed v2.') },
        { role: 'assistant', text: 'The writer deployed v2.' },
      ])
      expect(read.pendingWaits).toEqual([])
      // Each model got one more call: no new start of the agent.
      expect(read.modelCallsA + read.modelCallsB).toBe(4)
    } finally {
      await stop(request, started.runId)
    }
  })

  test('a wait that expires ends the turn', async ({ request }) => {
    const started = await start(request, 'expiry')
    try {
      // The durable tool asks. Host B sees the question and its expiry.
      const asked = await readUntil(
        request,
        started.runId,
        (read) => read.pendingWaits.length > 0,
      )
      expect(asked.pendingWaits).toEqual([
        expect.objectContaining({
          kind: 'question',
          message: 'Go on with the plan?',
          expiresAt: expect.any(Number),
        }),
      ])
      const [wait] = asked.pendingWaits

      // Nobody answers. The wait expires, `step.ask` rejects, and the model
      // gets the error as the tool result. The turn then ends.
      const read = await readUntil(
        request,
        started.runId,
        (done) => done.turn.text !== undefined || done.turn.error !== undefined,
      )
      expect(read.turn).toEqual({
        text: 'Nobody confirmed, so I stopped.',
        interrupts: 0,
      })
      expect(read.transcript).toEqual([
        { role: 'user', text: '[harness-waits] expiry' },
        expect.objectContaining({ role: 'assistant' }),
        {
          role: 'tool',
          text: expect.stringContaining('expired with no answer'),
        },
        { role: 'assistant', text: 'Nobody confirmed, so I stopped.' },
      ])
      expect(read.pendingWaits).toEqual([])
      expect(read.records).toEqual([
        expect.objectContaining({
          type: 'harness.wait',
          wait: expect.objectContaining({ waitId: wait!.waitId }),
        }),
        expect.objectContaining({
          type: 'harness.wait.settled',
          waitId: wait!.waitId,
          outcome: 'expired',
        }),
      ])
      // Host B never ran the turn.
      expect(read.modelCallsB).toBe(0)
    } finally {
      await stop(request, started.runId)
    }
  })
})
