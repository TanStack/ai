import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'
import { deploy } from '../src/lib/harness-protocol-tools'
import { test, expect } from './fixtures'
import { openHarnessThread } from './helpers'
import type { APIRequestContext } from '@playwright/test'

type Chunk = {
  type: string
  runId?: string
  name?: string
  delta?: string
  content?: string
  outcome?: {
    type: string
    interrupts?: Array<{ id: string; metadata?: Record<string, any> }>
  }
}

// Each event has an `id:` line (its log cursor) before its `data:` line.
const sse = (text: string): Array<Chunk> =>
  text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)))

const textOf = (chunks: Array<Chunk>) =>
  chunks
    .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
    .map((chunk) => chunk.delta)
    .join('')

const toolResults = (chunks: Array<Chunk>) =>
  chunks
    .filter((chunk) => chunk.type === 'TOOL_CALL_RESULT')
    .map((chunk) => chunk.content)

/** The interrupt that `RUN_FINISHED` stops the turn for. */
const interruptOf = (chunks: Array<Chunk>) => {
  const finished = chunks.find((chunk) => chunk.type === 'RUN_FINISHED')
  const interrupt = finished?.outcome?.interrupts?.[0]
  if (!interrupt) throw new Error('The turn did not stop for an approval.')
  return interrupt
}

type Snapshot = {
  pendingWaits: Array<{ waitId: string; message?: string }>
  waitingInputs: Array<{ inputId: string; delivery: string }>
}

type JournalEntry = {
  headers?: Record<string, string>
  body: { messages?: Array<{ role: string; content: unknown }> } | null
}

/**
 * The custom events of a session stream, from its start. It reads until
 * `isDone` is true for the events so far.
 */
async function customEvents(
  url: string,
  headers: Record<string, string>,
  isDone: (events: Array<{ name?: string; value?: unknown }>) => boolean,
) {
  const response = await fetch(url, { headers })
  if (!response.body) throw new Error('The session stream has no body.')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  const events: Array<{ name?: string; value?: unknown }> = []
  let buffer = ''
  while (!isDone(events)) {
    const read = await reader.read()
    if (read.done) break
    buffer += read.value
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      // Each event has an `id:` line before its `data:` line.
      const data = block.split('\n').find((line) => line.startsWith('data: '))
      if (!data) continue
      const frame: {
        event?: { type: string; name?: string; value?: unknown }
      } = JSON.parse(data.slice('data: '.length))
      if (frame.event?.type === 'CUSTOM') {
        events.push({ name: frame.event.name, value: frame.event.value })
      }
    }
  }
  await reader.cancel()
  return events
}

/** One user of the harness protocol route: its headers and its requests. */
function asUser(
  request: APIRequestContext,
  testId: string,
  aimockPort: number,
  token = 'e2e-token',
  extraHeaders: Record<string, string> = {},
) {
  const headers = {
    authorization: `Bearer ${token}`,
    'x-test-id': testId,
    'x-aimock-port': String(aimockPort),
    ...extraHeaders,
  }
  const json = { ...headers, 'content-type': 'application/json' }
  const run = (body: object) =>
    request.post('/api/harness-protocol/run', {
      headers: json,
      data: { messages: [], tools: [], context: [], state: {}, ...body },
    })
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
  const transcript = (
    threadId: string,
  ): Promise<Array<{ id?: string; role: string; content: unknown }>> =>
    read('transcript', threadId)
  const answers = async (threadId: string) =>
    (await transcript(threadId))
      .filter((message) => message.role === 'assistant')
      .map((message) => message.content)
  const snapshot = (threadId: string): Promise<Snapshot> =>
    read('snapshot', threadId)
  /** The question that the thread waits for, or `undefined`. */
  const question = async (threadId: string) =>
    (await snapshot(threadId)).pendingWaits[0]
  return {
    headers,
    json,
    run,
    control,
    transcript,
    answers,
    snapshot,
    question,
  }
}

const userMessage = (content: string) => [{ id: 'u1', role: 'user', content }]

test.describe('harness protocol inputs', () => {
  test('answers an approval on POST run with the run id the client sent', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort)
    const threadId = `runid-${testId}`
    const runId = `client-run-${testId}`
    const body = {
      threadId,
      runId,
      messages: userMessage('[harness-runid] deploy prod'),
      forwardedProps: {},
    }

    const first = sse(await (await user.run(body)).text())
    expect(first.find((chunk) => chunk.type === 'RUN_STARTED')?.runId).toBe(
      runId,
    )
    const interrupt = interruptOf(first)
    // A client matches the interrupt against the run id it sent.
    expect(
      interrupt.metadata?.['tanstack:interruptBinding']?.interruptedRunId,
    ).toBe(runId)

    // The same request again runs nothing: the model is not called again.
    const retry = await user.run(body)
    expect(retry.status()).toBe(200)
    expect(await retry.text()).not.toContain('Deployed to prod.')

    // A ChatClient with `persistence` reads this when the page loads.
    const hydrate = await (
      await request.get(`/api/harness-protocol/run?threadId=${threadId}`, {
        headers: user.headers,
      })
    ).json()
    expect(
      hydrate.messages.map((message: { role: string }) => message.role),
    ).toEqual(['user', 'assistant'])
    expect(hydrate.interrupts).toMatchObject({
      runId,
      pending: [{ id: interrupt.id }],
    })

    const resumed = sse(
      await (
        await user.run({
          threadId,
          runId: `${runId}-resume`,
          parentRunId: runId,
          forwardedProps: {},
          resume: [
            {
              interruptId: interrupt.id,
              status: 'resolved',
              payload: { approved: true },
            },
          ],
        })
      ).text(),
    )
    expect(resumed.find((chunk) => chunk.type === 'RUN_STARTED')?.runId).toBe(
      `${runId}-resume`,
    )
    expect(toolResults(resumed).join('')).toContain('prod')
    expect(textOf(resumed)).toBe('Deployed to prod.')
  })

  test('accepts a resolve sent as soon as RUN_FINISHED arrives', async ({
    request,
    baseURL,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort)
    const threadId = `fast-resolve-${testId}`
    // Read the stream as it arrives, and answer on RUN_FINISHED.
    const response = await fetch(`${baseURL}/api/harness-protocol/run`, {
      method: 'POST',
      headers: user.json,
      body: JSON.stringify({
        threadId,
        runId: `fast-${testId}`,
        messages: userMessage('[harness-fast-resolve] deploy stage'),
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      }),
    })
    if (!response.body) throw new Error('POST run has no stream.')
    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader()
    let buffer = ''
    let receipt: unknown
    while (receipt === undefined) {
      const read = await reader.read()
      if (read.done) break
      buffer += read.value
      let end = buffer.indexOf('\n\n')
      while (end !== -1 && receipt === undefined) {
        const block = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        end = buffer.indexOf('\n\n')
        const data = block.split('\n').find((line) => line.startsWith('data: '))
        if (!data) continue
        const chunk: Chunk = JSON.parse(data.slice('data: '.length))
        if (chunk.type !== 'RUN_FINISHED') continue
        receipt = await user.control(threadId, {
          op: 'resolve',
          resume: [
            {
              interruptId: interruptOf([chunk]).id,
              status: 'resolved',
              payload: { approved: true },
            },
          ],
        })
      }
    }
    await reader.cancel()

    expect(receipt).toMatchObject({ status: 'accepted' })
    await expect
      .poll(() => user.answers(threadId))
      .toContain('Deployed to stage.')
  })

  test('gives forwardedProps to the tools as the input context', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort)
    const chunks = sse(
      await (
        await user.run({
          threadId: `context-${testId}`,
          runId: `context-run-${testId}`,
          messages: userMessage('[harness-context] probe'),
          forwardedProps: { screen: 'settings' },
        })
      ).text(),
    )
    expect(toolResults(chunks).join('')).toContain('"screen":"settings"')
    expect(textOf(chunks)).toBe('Probed the context.')
  })

  test('runs an exposed tool with no model call, and refuses another tool', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const threadId = `tool-op-${testId}`
    const user = asUser(request, testId, aimockPort)

    const receipt = await user.control(threadId, {
      op: 'tool',
      name: 'probe',
      args: {},
      inputId: `tool-op-input-${testId}`,
    })
    expect(receipt).toMatchObject({
      inputId: `tool-op-input-${testId}`,
      status: 'accepted',
    })
    // The tool gets its thread in its context. No model call happened, so
    // no aimock fixture answers this thread.
    await expect
      .poll(async () => JSON.stringify(await user.transcript(threadId)))
      .toMatch(new RegExp(`threadId[\\\\":]+${threadId}`))

    expect(
      await user.control(threadId, { op: 'tool', name: 'deploy', args: {} }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })
  })

  test('adds an exposed record that the next turn reads', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const threadId = `append-${testId}`
    const user = asUser(request, testId, aimockPort, 'e2e-token', {
      'x-harness-durable': '1',
    })

    expect(
      await user.control(threadId, {
        op: 'append',
        records: [
          { type: 'app.signal', text: '[harness-append] the build failed' },
        ],
      }),
    ).toMatchObject({ status: 'accepted' })
    expect(
      await user.control(threadId, {
        op: 'append',
        records: [{ type: 'app.secret', text: 'no' }],
      }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })

    await user.control(threadId, { op: 'continue' })
    await expect
      .poll(() => user.answers(threadId))
      .toContain('I will look at the build.')
  })

  test('runs each input as the user who sent it', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const threadId = `sender-${testId}`
    const opener = asUser(request, testId, aimockPort)
    const bob = asUser(request, testId, aimockPort, 'e2e-token-bob')
    // The first user opens the session of the thread.
    await openHarnessThread(request, opener.headers, threadId)

    const chunks = sse(
      await (
        await bob.run({
          threadId,
          runId: `sender-run-${testId}`,
          messages: userMessage('[harness-sender] who am i'),
          forwardedProps: {},
        })
      ).text(),
    )
    expect(toolResults(chunks).join('')).toContain('"id":"bob"')
    expect(textOf(chunks)).toBe('You are the sender.')
  })

  test('lets a ChatClient answer an approval on POST run', async ({
    baseURL,
    testId,
    aimockPort,
  }) => {
    const client = new ChatClient({
      connection: fetchServerSentEvents(`${baseURL}/api/harness-protocol/run`, {
        headers: {
          authorization: 'Bearer e2e-token',
          'x-test-id': testId,
          'x-aimock-port': String(aimockPort),
        },
      }),
      threadId: `chatclient-${testId}`,
      tools: [deploy.client()],
    })
    const assistantText = () =>
      client
        .getMessages()
        .filter((message) => message.role === 'assistant')
        .flatMap((message) => message.parts)
        .flatMap((part) => (part.type === 'text' ? [part.content] : []))
        .join('')

    await client.sendMessage('[harness-chatclient] deploy dev')
    const [interrupt] = client.getInterrupts()
    expect(interrupt).toMatchObject({ canResolve: true })

    client.resolveInterrupts(true)
    await expect.poll(assistantText).toContain('Deployed to dev.')
    client.dispose()
  })

  test('lets a reloaded ChatClient join the turn that still runs', async ({
    request,
    baseURL,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort)
    const threadId = `rejoin-${testId}`
    const connection = () =>
      fetchServerSentEvents(`${baseURL}/api/harness-protocol/run`, {
        headers: user.headers,
      })
    /** Each message as its role and its text, to compare two clients. */
    const shape = (client: ChatClient) =>
      client.getMessages().map((message) => ({
        role: message.role,
        text: message.parts
          .flatMap((part) => (part.type === 'text' ? [part.content] : []))
          .join(''),
      }))
    const pendingQuestion = async () => {
      const response = await request.get(
        `/api/harness-protocol/snapshot?threadId=${threadId}`,
        { headers: user.headers },
      )
      // 404 until the turn of the first tab opens the thread.
      if (response.status() === 404) return undefined
      const snapshot: { pendingWaits: Array<{ waitId: string }> } =
        await response.json()
      return snapshot.pendingWaits[0]?.waitId
    }

    // The first tab starts a turn. Its tool waits for an answer.
    const first = new ChatClient({ connection: connection(), threadId })
    const sent = first.sendMessage('[harness-rejoin] ask my name')
    await expect.poll(pendingQuestion).toBeTruthy()

    // The page reloads: a new client loads the thread from the server and
    // joins the turn that still runs.
    const reloaded = new ChatClient({
      connection: connection(),
      threadId,
      persistence: true,
    })
    reloaded.attach()
    await expect
      .poll(() => reloaded.getMessages().map((message) => message.role))
      .toEqual(['user', 'assistant'])

    expect(
      await user.control(threadId, {
        op: 'answer',
        questionId: await pendingQuestion(),
        value: 'Otto',
      }),
    ).toMatchObject({ status: 'accepted' })
    await sent
    await expect.poll(() => shape(reloaded).at(-1)?.text).toBe('Hello, Otto.')
    // The joined client shows the same messages as the tab that sent it.
    expect(shape(reloaded)).toEqual(shape(first))
    first.dispose()
    reloaded.dispose()
  })

  test('cancels one waiting input and moves another into the running turn', async ({
    request,
    baseURL,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort)
    const threadId = `waiting-${testId}`
    const dropped = `drop-${testId}`
    const moved = `move-${testId}`
    // The turn waits for an answer, so the next inputs wait too.
    expect(
      await user.control(threadId, {
        op: 'prompt',
        message: '[harness-queue] ask my name',
      }),
    ).toMatchObject({ status: 'accepted' })
    await expect.poll(() => user.question(threadId)).toBeTruthy()
    for (const [inputId, message] of [
      [dropped, '[harness-queue-dropped] never runs'],
      [moved, '[harness-queue-moved] say it now'],
    ]) {
      expect(
        await user.control(threadId, { op: 'followUp', message, inputId }),
      ).toMatchObject({ status: 'queued' })
    }
    expect((await user.snapshot(threadId)).waitingInputs).toMatchObject([
      { inputId: dropped, delivery: 'queue' },
      { inputId: moved, delivery: 'queue' },
    ])

    expect(
      await user.control(threadId, { op: 'cancelInput', inputId: dropped }),
    ).toMatchObject({ status: 'accepted' })
    // A cancelled input does not wait any more.
    expect(
      await user.control(threadId, { op: 'cancelInput', inputId: dropped }),
    ).toMatchObject({ status: 'rejected', reason: 'not_waiting' })
    expect(
      await user.control(threadId, {
        op: 'setDelivery',
        inputId: moved,
        delivery: 'steer',
      }),
    ).toMatchObject({ status: 'accepted' })
    expect((await user.snapshot(threadId)).waitingInputs).toMatchObject([
      { inputId: moved, delivery: 'steer' },
    ])

    // The session stream tells every client about both changes.
    const events = await customEvents(
      `${baseURL}/api/harness-protocol/events?threadId=${threadId}&from=0`,
      user.headers,
      (seen) => seen.some((event) => event.name === 'harness.input.delivery'),
    )
    expect(events).toContainEqual({
      name: 'harness.input.settled',
      value: expect.objectContaining({ inputId: dropped, outcome: 'aborted' }),
    })
    expect(events).toContainEqual({
      name: 'harness.input.delivery',
      value: { inputId: moved, delivery: 'steer' },
    })

    // After the answer, the moved input joins the next model call.
    const asked = await user.question(threadId)
    expect(
      await user.control(threadId, {
        op: 'answer',
        questionId: asked?.waitId,
        value: 'Otto',
      }),
    ).toMatchObject({ status: 'accepted' })
    await expect
      .poll(() => user.answers(threadId))
      .toContain('Hello, Otto. I got the moved message.')
    const sent = (await user.transcript(threadId))
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
    expect(sent).toEqual([
      '[harness-queue] ask my name',
      '[harness-queue-moved] say it now',
    ])
  })

  test('moves a running tool call to the background', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort)
    const threadId = `background-${testId}`
    // Before the tool runs, there is nothing to move.
    expect(await user.control(threadId, { op: 'background' })).toMatchObject({
      status: 'rejected',
      reason: 'not_running',
    })
    expect(
      await user.control(threadId, {
        op: 'prompt',
        message: '[harness-background] build it',
      }),
    ).toMatchObject({ status: 'accepted' })
    // `slowBuild` waits for `release`. A client needs no `expose` entry.
    await expect
      .poll(
        async () => (await user.control(threadId, { op: 'background' })).status,
      )
      .toBe('accepted')

    // The tool call answers at once, and the turn ends.
    await expect
      .poll(() => user.answers(threadId))
      .toContain('The build runs in the background.')
    const results = (await user.transcript(threadId))
      .filter((message) => message.role === 'tool')
      .map((message) => message.content)
    expect(String(results[0])).toContain('The job moved to the background.')

    // When the job ends, a note wakes the session.
    expect(
      await user.control(threadId, { op: 'command', name: 'release' }),
    ).toMatchObject({ status: 'accepted' })
    await expect
      .poll(() => user.answers(threadId))
      .toContain('The build is done.')
  })

  test('asks an MCP elicitation as a question and sends the answer to the server', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort, 'e2e-token', {
      'x-harness-mcp': '1',
    })
    const threadId = `elicit-${testId}`
    expect(
      await user.control(threadId, {
        op: 'prompt',
        message: '[harness-elicit] what is the forecast',
      }),
    ).toMatchObject({ status: 'accepted' })
    await expect.poll(() => user.question(threadId)).toBeTruthy()
    const asked = await user.question(threadId)
    expect(asked).toMatchObject({
      message: 'Which city?',
      schema: { type: 'object', properties: { value: { type: 'string' } } },
    })

    expect(
      await user.control(threadId, {
        op: 'answer',
        questionId: asked?.waitId,
        value: { value: 'Paris' },
      }),
    ).toMatchObject({ status: 'accepted' })
    await expect
      .poll(() => user.answers(threadId))
      .toContain('The forecast for Paris is sunny.')

    // The server got the answer: the tool result has the city.
    const result = (await user.transcript(threadId)).find(
      (message) => message.role === 'tool',
    )
    expect(JSON.stringify(result?.content)).toContain('Forecast for Paris')
  })

  test('asks each elicitation/create request of a spec 2025 server, two in one tool call', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort, 'e2e-token', {
      'x-harness-mcp': '2025',
    })
    const threadId = `elicit-2025-${testId}`
    expect(
      await user.control(threadId, {
        op: 'prompt',
        message: '[harness-elicit-2025] book a trip',
      }),
    ).toMatchObject({ status: 'accepted' })
    for (const [message, value] of [
      ['Which city?', 'Paris'],
      ['Which seat?', '12A'],
    ]) {
      await expect
        .poll(async () => (await user.question(threadId))?.message)
        .toBe(message)
      const asked = await user.question(threadId)
      expect(
        await user.control(threadId, {
          op: 'answer',
          questionId: asked?.waitId,
          value: { value },
        }),
      ).toMatchObject({ status: 'accepted' })
    }
    await expect
      .poll(() => user.answers(threadId))
      .toContain('Your trip to Paris is booked, seat 12A.')

    // The server got both answers in the same tool call.
    const result = (await user.transcript(threadId)).find(
      (message) => message.role === 'tool',
    )
    expect(JSON.stringify(result?.content)).toContain('Booked Paris, seat 12A')
  })

  test('answers the stored user message on continue, with no new message', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort)
    const threadId = `continue-${testId}`
    expect(
      await user.control(threadId, {
        op: 'prompt',
        message: '[harness-continue] name a color',
      }),
    ).toMatchObject({ status: 'accepted' })
    await expect.poll(() => user.answers(threadId)).toEqual(['Red.'])
    // A fork through the prompt ends with the user message.
    const at = (await user.transcript(threadId))[0]?.id
    if (!at) throw new Error('The prompt has no message id.')
    const forked = await request.post('/api/harness-protocol/sessions', {
      headers: user.json,
      data: { op: 'fork', threadId, through: at },
    })
    const fork: { threadId: string } = await forked.json()

    expect(await user.control(fork.threadId, { op: 'continue' })).toMatchObject(
      { status: 'accepted' },
    )
    await expect
      .poll(async () =>
        (await user.transcript(fork.threadId)).map(
          (message) => `${message.role}: ${String(message.content)}`,
        ),
      )
      .toEqual(['user: [harness-continue] name a color', 'assistant: Blue.'])
  })

  test('gives the model the ephemeral messages of a prompt, and never stores them', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort)
    const threadId = `ephemeral-prompt-${testId}`
    const message = '[harness-ephemeral-prompt] name a fruit'
    const note = '[harness-ephemeral-prompt] note: answer in one word'
    expect(
      await user.control(threadId, {
        op: 'prompt',
        message,
        ephemeral: [{ role: 'user', content: note }],
      }),
    ).toMatchObject({ status: 'accepted' })

    // The fixture answers only when the note is the last user message.
    await expect.poll(() => user.answers(threadId)).toEqual(['Apple.'])
    expect(JSON.stringify(await user.transcript(threadId))).not.toContain(note)
    const journal = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries: Array<JournalEntry> = await journal.json()
    const sent = entries
      .filter((entry) => entry.headers?.['x-test-id'] === testId)
      .at(-1)
      ?.body?.messages?.slice(-2)
      .map((sentMessage) => sentMessage.content)
    expect(sent).toEqual([message, note])
  })

  test('gives the model the ephemeral messages of continue, and never stores them', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort)
    const threadId = `ephemeral-continue-${testId}`
    const note = '[harness-ephemeral-continue] note: pick another color'
    expect(
      await user.control(threadId, {
        op: 'prompt',
        message: '[harness-ephemeral-continue] name a color',
      }),
    ).toMatchObject({ status: 'accepted' })
    await expect.poll(() => user.answers(threadId)).toEqual(['Red.'])
    // A fork through the prompt ends with the user message.
    const at = (await user.transcript(threadId))[0]?.id
    if (!at) throw new Error('The prompt has no message id.')
    const forked = await request.post('/api/harness-protocol/sessions', {
      headers: user.json,
      data: { op: 'fork', threadId, through: at },
    })
    const fork: { threadId: string } = await forked.json()

    expect(
      await user.control(fork.threadId, {
        op: 'continue',
        ephemeral: [{ role: 'user', content: note }],
      }),
    ).toMatchObject({ status: 'accepted' })
    // The fixture answers only when the note is the last user message.
    await expect
      .poll(async () =>
        (await user.transcript(fork.threadId)).map(
          (message) => `${message.role}: ${String(message.content)}`,
        ),
      )
      .toEqual([
        'user: [harness-ephemeral-continue] name a color',
        'assistant: Green.',
      ])
  })

  test('rejects continue on an empty thread with nothing_to_continue', async ({
    request,
    baseURL,
    testId,
    aimockPort,
  }) => {
    const user = asUser(request, testId, aimockPort)
    const threadId = `continue-empty-${testId}`
    const inputId = `empty-${testId}`
    await user.control(threadId, { op: 'continue', inputId })

    // The session checks the transcript when the turn starts, and tells
    // every client.
    const events = await customEvents(
      `${baseURL}/api/harness-protocol/events?threadId=${threadId}&from=0`,
      user.headers,
      (seen) => seen.some((event) => event.name === 'harness.input.rejected'),
    )
    expect(events).toContainEqual({
      name: 'harness.input.rejected',
      value: { inputId, reason: 'nothing_to_continue' },
    })
    expect(await user.transcript(threadId)).toEqual([])
  })
})
