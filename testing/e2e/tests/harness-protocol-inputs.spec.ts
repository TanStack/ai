import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'
import { deploy } from '../src/lib/harness-protocol-tools'
import { test, expect } from './fixtures'
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

const sse = (text: string): Array<Chunk> =>
  text
    .split('\n\n')
    .filter((block) => block.startsWith('data: '))
    .map((block) => JSON.parse(block.slice('data: '.length)))

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

/** One user of the harness protocol route: its headers and its requests. */
function asUser(
  request: APIRequestContext,
  testId: string,
  aimockPort: number,
  token = 'e2e-token',
) {
  const headers = {
    authorization: `Bearer ${token}`,
    'x-test-id': testId,
    'x-aimock-port': String(aimockPort),
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
  const answers = async (threadId: string) => {
    const response = await request.get(
      `/api/harness-protocol/transcript?threadId=${threadId}`,
      { headers },
    )
    const transcript: Array<{ role: string; content: unknown }> =
      await response.json()
    return transcript
      .filter((message) => message.role === 'assistant')
      .map((message) => message.content)
  }
  return { headers, json, run, control, answers }
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
        if (!block.startsWith('data: ')) continue
        const chunk: Chunk = JSON.parse(block.slice('data: '.length))
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

  test('runs each input as the user who sent it', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const threadId = `sender-${testId}`
    const opener = asUser(request, testId, aimockPort)
    const bob = asUser(request, testId, aimockPort, 'e2e-token-bob')
    // The first user opens the session of the thread.
    const snapshot = await request.get(
      `/api/harness-protocol/snapshot?threadId=${threadId}`,
      { headers: opener.headers },
    )
    expect(snapshot.status()).toBe(200)

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
      const snapshot: { pendingQuestions: Array<{ questionId: string }> } =
        await (
          await request.get(
            `/api/harness-protocol/snapshot?threadId=${threadId}`,
            { headers: user.headers },
          )
        ).json()
      return snapshot.pendingQuestions[0]?.questionId
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
})
