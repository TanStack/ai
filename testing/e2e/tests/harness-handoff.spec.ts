import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

const ROUTE = '/api/harness-handoff'

interface Started {
  error?: string
  runId: string
  threadId: string
}

interface Debug {
  error?: string
  status: string
  handoffs: Array<Record<string, unknown>>
  transcript: Array<{
    role: string
    text: string
    harness: { agent?: string; operator?: string } | null
  }>
  view: Array<{ role: string; agent: string | null; text: string }>
  waits: Array<{ waitId: string; kind: string; message?: string }>
  mainCalls: number
  billingCalls: number
  /** The messages of the first request of `billing`, as Anthropic gets them. */
  billingMessages: Array<{ role: string; content: unknown }>
}

/** Open the thread of `scenario` for olga, shared with bea. */
async function start(
  request: APIRequestContext,
  scenario: 'agent' | 'human' | 'code',
) {
  const res = await request.post(`${ROUTE}/start`, { data: { scenario } })
  expect(res.ok()).toBe(true)
  const started: Started = await res.json()
  expect(started.error ?? null).toBeNull()
  return started
}

/** Send one protocol input as `user`. Returns the receipt. */
async function control(
  request: APIRequestContext,
  { runId, threadId }: Started,
  input: Record<string, unknown>,
  user = 'olga',
) {
  const res = await request.post(`${ROUTE}/control?runId=${runId}`, {
    data: { threadId, input },
    headers: { authorization: user },
  })
  expect(res.ok()).toBe(true)
  const receipt: { status: string; reason?: string } = await res.json()
  return receipt
}

/** Wait until the input `inputId` ends, and return how it ended. */
async function outcomeOf(
  request: APIRequestContext,
  runId: string,
  inputId: string,
) {
  let outcome: string | undefined
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `${ROUTE}/settled?runId=${runId}&inputId=${inputId}`,
        )
        const settled: { error?: string; outcome?: string } = await res.json()
        outcome = settled.outcome
        return settled.error ?? outcome !== undefined
      },
      { timeout: 20_000 },
    )
    .toBe(true)
  return outcome
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

/** The role and text of each message, and who wrote it. */
const lines = (read: Debug) =>
  read.transcript.map(({ role, text, harness }) => ({
    role,
    text,
    by: harness?.agent ?? harness?.operator ?? null,
  }))

const stop = (request: APIRequestContext, runId: string) =>
  request.post(`${ROUTE}/stop?runId=${runId}`)

test.describe('harness: handoffs inside one session', () => {
  test('the main model hands the turn to an agent, the agent answers in the same turn, and the next turn goes to it', async ({
    request,
  }) => {
    const started = await start(request, 'agent')
    try {
      const sent = await control(request, started, {
        op: 'prompt',
        message: 'refund please',
        inputId: 'in-1',
      })
      expect(sent.status).toBe('accepted')
      expect(await outcomeOf(request, started.runId, 'in-1')).toBe('completed')

      const first = await readUntil(request, started.runId, (read) =>
        read.view.some((message) => message.agent === 'billing'),
      )
      // The session stream has one handoff event.
      expect(first.handoffs).toEqual([
        {
          from: null,
          to: 'billing',
          note: 'Refund for order 42.',
          by: 'tool',
          runId: expect.any(String),
        },
      ])
      // The answer of the turn comes from billing, and has its name.
      expect(lines(first)).toEqual([
        { role: 'user', text: 'refund please', by: null },
        { role: 'assistant', text: '', by: null },
        {
          role: 'tool',
          text: 'Handed off to billing. billing answers next.',
          by: null,
        },
        {
          role: 'assistant',
          text: 'billing:\nYour refund is on its way.',
          by: 'billing',
        },
      ])
      expect(first.mainCalls).toBe(1)
      expect(first.billingCalls).toBe(1)

      // The router picks nothing, so the active agent answers.
      await control(request, started, {
        op: 'prompt',
        message: 'and now?',
        inputId: 'in-2',
      })
      expect(await outcomeOf(request, started.runId, 'in-2')).toBe('completed')
      const second = await readUntil(
        request,
        started.runId,
        (read) => read.transcript.length === 6,
      )
      expect(lines(second).slice(4)).toEqual([
        { role: 'user', text: 'and now?', by: null },
        { role: 'assistant', text: 'billing:\nBilling again.', by: 'billing' },
      ])
      expect(second.mainCalls).toBe(1)
      expect(second.billingCalls).toBe(2)
      expect(second.handoffs).toHaveLength(1)
      // A client view names the agent on its messages.
      expect(
        second.view
          .filter((message) => message.role === 'assistant')
          .map((message) => message.agent),
      ).toEqual([null, 'billing', 'billing'])
    } finally {
      await stop(request, started.runId)
    }
  })

  test('a router and a code handoff put a handoff note in the request of the target model', async ({
    request,
  }) => {
    const started = await start(request, 'code')
    try {
      await control(request, started, {
        op: 'prompt',
        message: 'refund please',
        inputId: 'in-1',
      })
      expect(await outcomeOf(request, started.runId, 'in-1')).toBe('completed')

      const read = await readUntil(request, started.runId, (done) =>
        done.view.some((message) => message.agent === 'billing'),
      )
      expect(read.handoffs).toEqual([
        expect.objectContaining({ from: null, to: 'triage', by: 'router' }),
        expect.objectContaining({
          from: 'triage',
          to: 'billing',
          note: 'Refund for order 42.',
          by: 'code',
        }),
      ])
      expect(read.mainCalls).toBe(0)
      expect(read.billingCalls).toBe(1)
      // The model of billing gets the note of its handoff last: a `handoff`
      // tool call with the note, and its result.
      const [noteCall, noteResult] = read.billingMessages.slice(-2)
      expect(noteCall).toMatchObject({
        role: 'assistant',
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'tool_use',
            name: 'handoff',
            input: { to: 'billing', note: 'Refund for order 42.' },
          }),
        ]),
      })
      expect(noteResult).toMatchObject({ role: 'user' })
      expect(JSON.stringify(noteResult)).toContain(
        'Handed off to billing. billing answers next.',
      )
      expect(lines(read).at(-1)).toEqual({
        role: 'assistant',
        text: 'billing:\nYour refund is on its way.',
        by: 'billing',
      })
    } finally {
      await stop(request, started.runId)
    }
  })

  test('a handoff to a person pauses the session until an operator gives it back', async ({
    request,
  }) => {
    const started = await start(request, 'human')
    try {
      await control(request, started, {
        op: 'prompt',
        message: 'I want a person.',
        inputId: 'in-1',
      })
      expect(await outcomeOf(request, started.runId, 'in-1')).toBe(
        'interrupted',
      )
      // The operator bea sees the human wait over the protocol.
      const res = await request.get(
        `${ROUTE}/snapshot?runId=${started.runId}&threadId=${started.threadId}`,
        { headers: { authorization: 'bea' } },
      )
      const snapshot: { pendingWaits: Debug['waits'] } = await res.json()
      expect(snapshot.pendingWaits).toEqual([
        expect.objectContaining({
          kind: 'human',
          message: 'The user asks for a person.',
        }),
      ])
      const waitId = snapshot.pendingWaits[0]!.waitId

      // A user message during the pause gets no model answer.
      await control(request, started, {
        op: 'prompt',
        message: 'Hello? Anyone there?',
        inputId: 'in-2',
      })
      expect(await outcomeOf(request, started.runId, 'in-2')).toBe(
        'interrupted',
      )

      // The operator bea replies.
      const reply = await control(
        request,
        started,
        {
          op: 'prompt',
          message: 'Hi, I am Bea. I can help.',
          as: 'operator',
          inputId: 'op-1',
        },
        'bea',
      )
      expect(reply.status).toBe('accepted')
      expect(await outcomeOf(request, started.runId, 'op-1')).toBe('completed')

      const paused = await readUntil(request, started.runId, (read) =>
        read.view.some(
          (message) => message.text === 'Hi, I am Bea. I can help.',
        ),
      )
      expect(paused.handoffs).toEqual([
        {
          from: null,
          to: { human: true },
          note: 'The user asks for a person.',
          by: 'tool',
          runId: expect.any(String),
          waitId,
          agents: ['billing'],
        },
      ])
      expect(lines(paused).slice(3)).toEqual([
        { role: 'user', text: 'Hello? Anyone there?', by: null },
        { role: 'assistant', text: 'Hi, I am Bea. I can help.', by: 'bea' },
      ])
      expect(paused.mainCalls).toBe(1)
      expect(paused.waits).toHaveLength(1)

      // The operator gives the thread back to the main model.
      const answered = await control(
        request,
        started,
        { op: 'answer', questionId: waitId, value: { resume: true } },
        'bea',
      )
      expect(answered.status).toBe('accepted')
      await control(request, started, {
        op: 'prompt',
        message: 'Thanks.',
        inputId: 'in-3',
      })
      expect(await outcomeOf(request, started.runId, 'in-3')).toBe('completed')

      const back = await readUntil(
        request,
        started.runId,
        (read) => read.transcript.length === 7,
      )
      expect(lines(back).slice(5)).toEqual([
        { role: 'user', text: 'Thanks.', by: null },
        { role: 'assistant', text: 'The main model is back.', by: null },
      ])
      expect(back.waits).toEqual([])
      expect(back.mainCalls).toBe(2)
      expect(back.handoffs.at(-1)).toEqual({
        from: { human: true },
        to: null,
        by: 'operator',
        runId: expect.any(String),
      })
    } finally {
      await stop(request, started.runId)
    }
  })
})
