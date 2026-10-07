import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * Messages to a running background agent over the harness protocol. A steer
 * joins the agent's next model call, and a follow-up runs the agent again
 * on its own transcript. The agent waits for the `release` command, so the
 * steer arrives before its model call. aimock's journal shows what each
 * model call sent.
 */

type JournalEntry = {
  headers?: Record<string, string>
  body: { messages?: Array<{ role: string; content: unknown }> } | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** A journal entry with a `headers` record and a `messages` array body. */
function isJournalEntry(value: unknown): value is JournalEntry {
  if (!isRecord(value) || !isRecord(value.headers)) return false
  const { body } = value
  if (body === null) return true
  if (!isRecord(body)) return false
  return (
    body.messages === undefined ||
    (Array.isArray(body.messages) &&
      body.messages.every(
        (message) => isRecord(message) && typeof message.role === 'string',
      ))
  )
}

function client(
  request: APIRequestContext,
  testId: string,
  aimockPort: number,
) {
  const headers = {
    authorization: 'Bearer e2e-token',
    'x-test-id': testId,
    'x-aimock-port': String(aimockPort),
  }
  const json = { ...headers, 'content-type': 'application/json' }
  const control = async (threadId: string, input: unknown) =>
    (
      await request.post('/api/harness-protocol/control', {
        headers: json,
        data: { threadId, input },
      })
    ).json()
  const snapshot = async (threadId: string) =>
    (
      await request.get(`/api/harness-protocol/snapshot?threadId=${threadId}`, {
        headers,
      })
    ).json()
  /** This test's model calls, in order, from aimock's journal. */
  const modelCalls = async () => {
    const journal = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries: unknown = await journal.json()
    return (Array.isArray(entries) ? entries : [])
      .filter(isJournalEntry)
      .filter((entry) => entry.headers?.['x-test-id'] === testId)
  }
  return { control, snapshot, modelCalls }
}

/** The text of every message a model call sent, one per line. */
const textOf = (entry: JournalEntry | undefined) =>
  (entry?.body?.messages ?? [])
    .map((message) =>
      typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content),
    )
    .join('\n')

test.describe('harness agent messages', () => {
  test('steers a running agent, then runs it again with a follow-up', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = client(request, testId, aimockPort)
    const threadId = `agent-msg-${testId}`
    const started = await user.control(threadId, {
      op: 'agent',
      agent: 'drafter',
      input: { topic: '[harness-agent-msg] draft a post' },
    })
    expect(started).toMatchObject({ status: 'accepted' })

    const steer = await user.control(threadId, {
      op: 'agentMessage',
      operationId: started.operationId,
      message: '[harness-agent-msg] keep it short',
    })
    expect(steer).toMatchObject({
      status: 'accepted',
      operationId: started.operationId,
    })
    expect(
      await user.control(threadId, { op: 'command', name: 'release' }),
    ).toMatchObject({ status: 'accepted' })

    await expect.poll(async () => (await user.modelCalls()).length).toBe(1)
    const [first] = await user.modelCalls()
    expect(textOf(first)).toContain('[harness-agent-msg] draft a post')
    expect(textOf(first)).toContain('[harness-agent-msg] keep it short')

    // The run ended: no operation is active.
    await expect
      .poll(async () => (await user.snapshot(threadId)).activeOperations.length)
      .toBe(0)
    const followUp = await user.control(threadId, {
      op: 'agentMessage',
      operationId: started.operationId,
      message: '[harness-agent-msg] add a title',
      mode: 'followUp',
    })
    expect(followUp).toMatchObject({ status: 'accepted' })
    expect(followUp.operationId).not.toBe(started.operationId)

    await expect.poll(async () => (await user.modelCalls()).length).toBe(2)
    const second = (await user.modelCalls())[1]
    expect(textOf(second)).toContain('Short draft.')
    expect(textOf(second).endsWith('[harness-agent-msg] add a title')).toBe(
      true,
    )
  })

  test('refuses a message to a run it does not know', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = client(request, testId, aimockPort)
    expect(
      await user.control(`agent-msg-${testId}`, {
        op: 'agentMessage',
        operationId: 'op-agent-none',
        message: 'Hello.',
      }),
    ).toMatchObject({ status: 'rejected', reason: 'not_running' })
  })
})
