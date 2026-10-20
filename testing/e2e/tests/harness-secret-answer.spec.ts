import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

// Long enough for the redactor, which skips values under 6 characters.
const SECRET = 'e2e-secret-answer-correct-horse'
const ROUTE = '/api/harness-secret-answer'

interface Started {
  error?: string
  runId: string
  threadId: string
}

interface Debug {
  error?: string
  questionId: string | null
  turn: { text?: string; error?: string }
  transcript: Array<{ role: string; content: unknown }>
  events: Array<unknown>
  records: Array<unknown>
  saved: Array<string>
  stored: Array<{ id: string }> | null
}

/** Open the thread on hosts A and B, and start the turn on host A. */
async function start(
  request: APIRequestContext,
  testId: string,
  credentials: boolean,
) {
  const res = await request.post(`${ROUTE}/start`, {
    headers: { 'x-test-id': testId },
    data: { credentials },
  })
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
      { timeout: 20_000 },
    )
    .toBe(true)
  return read!
}

/** Send the secret answer to the handler of host B. */
async function answerOnB(
  request: APIRequestContext,
  { runId, threadId }: Started,
  questionId: string,
) {
  const res = await request.post(`${ROUTE}/control?runId=${runId}`, {
    data: { threadId, input: { op: 'answer', questionId, value: SECRET } },
  })
  expect(res.ok()).toBe(true)
  return res.json()
}

const stop = (request: APIRequestContext, runId: string) =>
  request.post(`${ROUTE}/stop?runId=${runId}`)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * The bodies of the model calls with the test id `testId`, in order, from
 * the aimock journal. Host B calls with `${testId}:b`.
 */
async function modelBodies(
  request: APIRequestContext,
  aimockPort: number,
  testId: string,
) {
  const res = await request.get(`http://127.0.0.1:${aimockPort}/v1/_requests`)
  const entries: unknown = await res.json()
  return (Array.isArray(entries) ? entries : [])
    .filter(
      (entry) =>
        isRecord(entry) &&
        isRecord(entry.headers) &&
        entry.headers['x-test-id'] === testId,
    )
    .map((entry) => JSON.stringify(isRecord(entry) ? entry.body : null))
}

test.describe('harness: a secret answer sent to a host that does not run the thread', () => {
  test('reaches the turn, and never shows in the transcript, the events, the log, or the model calls', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const started = await start(request, testId, true)
    try {
      const asked = await readUntil(
        request,
        started.runId,
        (read) => read.questionId !== null,
      )
      const receipt = await answerOnB(request, started, asked.questionId!)
      // Host B does not run the thread, so the answer waits for host A.
      expect(receipt).toMatchObject({ status: 'queued' })

      const read = await readUntil(
        request,
        started.runId,
        (done) => done.turn.text !== undefined || done.turn.error !== undefined,
      )
      expect(read.turn).toEqual({ text: 'Signed in.' })
      // Both model calls ran on host A.
      const bodies = await modelBodies(request, aimockPort, testId)
      expect(bodies).toHaveLength(2)
      expect(await modelBodies(request, aimockPort, `${testId}:b`)).toEqual([])

      // The secret is nowhere.
      expect(JSON.stringify(read.transcript)).not.toContain(SECRET)
      expect(JSON.stringify(read.events)).not.toContain(SECRET)
      expect(JSON.stringify(read.records)).not.toContain(SECRET)
      expect(JSON.stringify(bodies)).not.toContain(SECRET)
      // The tool put the secret in its result. The harness scrubbed it in
      // the transcript, and in the second model call.
      const toolResult = read.transcript.find((m) => m.role === 'tool')
      expect(toolResult?.content).toContain('password was [redacted]')
      expect(bodies[1]).toContain('password was [redacted]')

      // The answer went through the credential store, and host A deleted
      // it after it read it. Host A kept it in the scope of the thread, for
      // a run again of the tool call (`step.ask`).
      expect(read.saved).toEqual([
        expect.stringMatching(/^harness:answer:/),
        expect.stringMatching(/^harness:answer:.*#kept$/),
      ])
      expect(read.stored).toEqual([])
    } finally {
      await stop(request, started.runId)
    }
  })

  test('is refused when the hosts have no credential store', async ({
    request,
    testId,
  }) => {
    const started = await start(request, testId, false)
    try {
      const asked = await readUntil(
        request,
        started.runId,
        (read) => read.questionId !== null,
      )
      const receipt = await answerOnB(request, started, asked.questionId!)
      expect(receipt).toMatchObject({
        status: 'rejected',
        reason: 'secret_answer_needs_credentials',
      })

      // The question still waits on host A, and the secret is nowhere.
      const read = await debug(request, started.runId)
      expect(read.questionId).toBe(asked.questionId)
      expect(read.turn).toEqual({})
      expect(JSON.stringify(read.records)).not.toContain(SECRET)
      expect(JSON.stringify(read.events)).not.toContain(SECRET)
    } finally {
      await stop(request, started.runId)
    }
  })
})
