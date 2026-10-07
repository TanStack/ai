import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * Per-thread controls of a harness session over HTTP: usage totals, stored
 * settings (`configure`), `reset` with a handoff note, and `host.fork`
 * (through a test-only route). The model is the OpenAI adapter against
 * aimock, and aimock's journal shows what each model call sent.
 */

type JournalEntry = {
  headers?: Record<string, string>
  body: {
    model?: string
    messages?: Array<{ role: string; content: unknown }>
  } | null
}

type Message = {
  id?: string
  role: string
  content: unknown
  metadata?: { harness?: { reset?: unknown } }
}

const textOf = (sse: string) =>
  sse
    .split('\n\n')
    .filter((block) => block.startsWith('data: '))
    .map((block) => JSON.parse(block.slice('data: '.length)))
    .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
    .map((chunk) => chunk.delta)
    .join('')

/** The text of a message's content, for a string or a list of parts. */
const contentText = (content: unknown) =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .map((part) =>
            typeof part === 'object' && part !== null && 'text' in part
              ? String(part.text)
              : '',
          )
          .join('')
      : ''

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
  let runs = 0
  const prompt = async (threadId: string, content: string) => {
    runs += 1
    const response = await request.post('/api/harness-protocol/run', {
      headers: json,
      data: {
        threadId,
        runId: `run-${testId}-${runs}`,
        messages: [{ id: `u-${runs}`, role: 'user', content }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      },
    })
    expect(response.status()).toBe(200)
    return textOf(await response.text())
  }
  const control = async (threadId: string, input: unknown) =>
    (
      await request.post('/api/harness-protocol/control', {
        headers: json,
        data: { threadId, input },
      })
    ).json()
  const read = async (route: string, threadId: string) =>
    (
      await request.get(`/api/harness-protocol/${route}?threadId=${threadId}`, {
        headers,
      })
    ).json()
  /** This test's model calls, in order, from aimock's journal. */
  const modelCalls = async () => {
    const journal = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries = (await journal.json()) as Array<JournalEntry>
    return entries.filter((entry) => entry.headers?.['x-test-id'] === testId)
  }
  return { headers, json, prompt, control, read, modelCalls }
}

test.describe('harness thread controls', () => {
  test('counts the usage of a turn per model and per sender', async ({
    request,
    testId,
    aimockPort,
    baseURL,
  }) => {
    const user = client(request, testId, aimockPort)
    const threadId = `usage-${testId}`
    expect(await user.prompt(threadId, '[harness-usage] hello')).toBe(
      'Counted.',
    )

    const { usage } = await user.read('snapshot', threadId)
    // aimock reports no token counts for this adapter, so the call count is
    // what this test can check.
    expect(usage.total.calls).toBeGreaterThanOrEqual(1)
    expect(usage.bySender.e2e.calls).toBe(usage.total.calls)
    expect(Object.keys(usage.byModel).join(' ')).toContain('gpt-4o')

    // The session stream has a `harness.usage` event for a live total.
    const events = await fetch(
      `${baseURL}/api/harness-protocol/events?threadId=${threadId}&from=0`,
      { headers: user.headers },
    )
    const reader = events.body!.pipeThrough(new TextDecoderStream()).getReader()
    let feed = ''
    while (!feed.includes('"harness.usage"')) {
      const { value, done } = await reader.read()
      if (done) break
      feed += value
    }
    await reader.cancel()
    expect(feed).toContain('"harness.usage"')
  })

  test('runs the next turn with the stored model and instructions', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = client(request, testId, aimockPort)
    const threadId = `settings-${testId}`
    expect(
      await user.control(threadId, {
        op: 'configure',
        settings: { model: 'strong', instructions: 'Answer in one word.' },
      }),
    ).toMatchObject({ status: 'accepted' })
    expect(
      await user.control(threadId, {
        op: 'configure',
        settings: { model: 'missing' },
      }),
    ).toMatchObject({ status: 'rejected' })
    // The harness does not expose `plugins` to clients.
    expect(
      await user.control(threadId, {
        op: 'configure',
        settings: { plugins: { remove: ['e2e/settings'] } },
      }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })

    expect(await user.prompt(threadId, '[harness-settings] hi')).toBe('Strong.')
    const [call] = await user.modelCalls()
    expect(call?.body?.model).toBe('gpt-4.1')
    const system = (call?.body?.messages ?? [])
      .filter((message) => message.role === 'system')
      .map((message) => contentText(message.content))
      .join('\n')
    expect(system).toContain('Answer in one word.')

    const described = await user.read('describe', threadId)
    expect(described.settings).toMatchObject({
      model: 'strong',
      instructions: 'Answer in one word.',
    })
    expect(described.models).toEqual(expect.arrayContaining(['fast', 'strong']))
  })

  test('tells the next model call that the working folder changed', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = client(request, testId, aimockPort)
    const threadId = `cwd-${testId}`
    expect(
      await user.control(threadId, {
        op: 'configure',
        settings: { cwd: '/repo/app' },
      }),
    ).toMatchObject({ status: 'accepted' })
    expect(await user.prompt(threadId, '[harness-cwd] where')).toBe('Moved.')

    const [call] = await user.modelCalls()
    const seen = (call?.body?.messages ?? [])
      .filter((message) => message.role !== 'system')
      .map((message) => contentText(message.content))
    expect(seen).toEqual([
      'The working folder is now /repo/app. Paths are relative to it.',
      '[harness-cwd] where',
    ])
  })

  test('starts a fresh context with the handoff note after a reset', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = client(request, testId, aimockPort)
    const threadId = `reset-${testId}`
    const note = 'Summary: the user asked a first question.'
    expect(await user.prompt(threadId, '[harness-reset] first')).toBe(
      'First answer.',
    )
    expect(await user.control(threadId, { op: 'reset', note })).toMatchObject({
      status: 'accepted',
    })
    expect(await user.prompt(threadId, '[harness-reset] second')).toBe(
      'Second answer.',
    )

    // The model got only the note and the new message.
    const calls = await user.modelCalls()
    const last = calls.at(-1)?.body?.messages ?? []
    const seen = last
      .filter((message) => message.role !== 'system')
      .map((message) => contentText(message.content))
    expect(seen).toEqual([note, '[harness-reset] second'])

    // The transcript keeps every message, with the reset marker.
    const transcript: Array<Message> = await user.read('transcript', threadId)
    const texts = transcript.map((message) => contentText(message.content))
    expect(texts).toContain('[harness-reset] first')
    expect(texts).toContain('[harness-reset] second')
    expect(transcript.some((message) => message.metadata?.harness?.reset)).toBe(
      true,
    )
  })

  test('forks a thread at a message and leaves the source as it was', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = client(request, testId, aimockPort)
    const threadId = `fork-${testId}`
    expect(await user.prompt(threadId, '[harness-fork] one')).toBe('One.')
    expect(await user.prompt(threadId, '[harness-fork] two')).toBe('Two.')
    const source: Array<Message> = await user.read('transcript', threadId)
    const at = source.find((message) => message.role === 'assistant')?.id
    if (!at) throw new Error('The first answer has no message id.')

    const response = await request.post('/api/harness-protocol/fork', {
      headers: user.json,
      data: { threadId, newThreadId: `${threadId}-copy`, at },
    })
    expect(response.status()).toBe(200)
    const { transcript } = (await response.json()) as {
      transcript: Array<Message>
    }
    expect(transcript.map((message) => contentText(message.content))).toEqual([
      '[harness-fork] one',
      'One.',
    ])

    const after: Array<Message> = await user.read('transcript', threadId)
    expect(after).toHaveLength(source.length)
    // A fork onto a thread that has messages is refused.
    const again = await request.post('/api/harness-protocol/fork', {
      headers: user.json,
      data: { threadId, newThreadId: `${threadId}-copy`, at },
    })
    expect(again.status()).toBe(400)
  })
})
