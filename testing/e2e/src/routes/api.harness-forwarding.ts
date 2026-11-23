import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryLogState, memoryLogStore } from '@tanstack/ai-persistence'
import { z } from 'zod'
import type { AnyTool } from '@tanstack/ai'

/**
 * Two hosts on one log backend, as two instances of a serverless app on one
 * database. Each host has its own log store and its own model. The first
 * host runs a turn. While it runs, the second host gets a follow-up for the
 * same thread. The follow-up waits in the log for the owner (receipt
 * `queued`), and the owner runs it after its turn.
 *
 * `?scenario=` picks another case on the same two hosts:
 *
 * - `status`: the owner runs a turn. The route returns the statuses that
 *   `host.events()` of the other host shows for the thread.
 * - `cancel`: the model of the owner waits until the turn stops. The other
 *   host gets `POST control` with a `cancel` input for the turn.
 * - `approval`: the owner stops for the approval of a tool, and the user
 *   approves it on the owner. While the tool runs, the route returns the
 *   snapshots of the other host: of `host.observe`, and of its open session.
 *
 * A custom `fetch` answers with canned Anthropic streams and holds the first
 * answer until the follow-up is in, so no aimock fixture is needed.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'
const MODEL = 'claude-sonnet-5-5'

const reply = (id: string, text: string) =>
  [
    {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        content: [],
        model: MODEL,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 0 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    { type: 'message_stop' },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')

/** An answer that calls the tool `name` with no arguments. */
const toolUseReply = (id: string, name: string) =>
  [
    {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        content: [],
        model: MODEL,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 0 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: `toolu_${id}`, name, input: {} },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{}' },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    { type: 'message_stop' },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')

/** The text of each message of the transcript. */
const textsOf = (messages: Array<{ role: string; content: unknown }>) =>
  messages.map((message) => ({
    role: message.role,
    text: typeof message.content === 'string' ? message.content : '',
  }))

/**
 * A model whose answers are `texts`, in order: a text, or `{ tool }` for a
 * call of that tool. The first answer waits for `until`. `calls` counts the
 * requests that reach it. With `hang`, each request waits until the turn
 * stops, and then fails.
 */
function scriptedModel(
  texts: Array<string | { tool: string }>,
  until: Promise<void>,
  { hang = false } = {},
) {
  const counter = { calls: 0 }
  const scriptedFetch: typeof fetch = async (_input, init) => {
    counter.calls += 1
    if (hang) {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        const stop = () => reject(signal.reason ?? new Error('Stopped.'))
        if (signal.aborted) stop()
        signal.addEventListener('abort', stop, { once: true })
      })
    }
    if (counter.calls === 1) await until
    const answer = texts[counter.calls - 1] ?? 'No more answers.'
    const id = `msg_forwarding_${counter.calls}`
    const body =
      typeof answer === 'string'
        ? reply(id, answer)
        : toolUseReply(id, answer.tool)
    return new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const adapter = createAnthropicChat(MODEL, DUMMY_KEY, {
    fetch: scriptedFetch,
  })
  return { adapter, counter }
}

/** Wait until `check()` is true, for at most 10 s. */
async function waitUntil(check: () => boolean) {
  const deadline = Date.now() + 10_000
  while (!check()) {
    if (Date.now() > deadline) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const NAME = 'e2e/harness-forwarding'
const THREAD = 'e2e-harness-forwarding'

/** Two hosts on one log backend, each with the session of the thread open. */
async function twoHosts(
  ownerModel: ReturnType<typeof scriptedModel>,
  otherModel: ReturnType<typeof scriptedModel>,
  tools: Array<AnyTool> = [],
) {
  const logState = memoryLogState()
  const ownerHost = createHarnessHost({
    persistence: { stores: { log: memoryLogStore({ state: logState }) } },
  })
  const otherHost = createHarnessHost({
    persistence: { stores: { log: memoryLogStore({ state: logState }) } },
  })
  const close = async () => {
    await ownerHost.close()
    await otherHost.close()
  }
  try {
    const owner = await ownerHost.open(
      defineHarness({ name: NAME, adapter: ownerModel.adapter, tools }),
      { threadId: THREAD },
    )
    const otherHarness = defineHarness({
      name: NAME,
      adapter: otherModel.adapter,
      tools,
    })
    const other = await otherHost.open(otherHarness, { threadId: THREAD })
    return { ownerHost, otherHost, owner, other, otherHarness, close }
  } catch (error) {
    await close()
    throw error
  }
}

/** The follow-up from the other host waits in the log for the owner. */
async function followUp() {
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const ownerModel = scriptedModel(['One.', 'Two.'], released)
  const otherModel = scriptedModel(['Not on this host.'], released)
  const { owner, other, close } = await twoHosts(ownerModel, otherModel)
  try {
    const turn = owner.send('[harness-forwarding] go')
    await turn.receipt
    const receipt = await other.send('[harness-forwarding] and then', {
      mode: 'followUp',
    }).receipt
    release()
    const first = await turn
    const settled = (await other.settled({ inputId: receipt.inputId })).outcome
    return {
      receipt: { status: receipt.status },
      first: first.text,
      followUp: settled,
      ownerCalls: ownerModel.counter.calls,
      otherCalls: otherModel.counter.calls,
      transcript: textsOf(await owner.transcript()),
    }
  } finally {
    await close()
  }
}

/** The statuses of the thread on the host that does not own it. */
async function status() {
  const ownerModel = scriptedModel(['One.'], Promise.resolve())
  const otherModel = scriptedModel(['Not on this host.'], Promise.resolve())
  const { otherHost, owner, close } = await twoHosts(ownerModel, otherModel)
  const reading = new AbortController()
  try {
    const statuses: Array<string> = []
    const read = (async () => {
      for await (const event of otherHost.events({ signal: reading.signal })) {
        if (event.type === 'status' && event.threadId === THREAD)
          statuses.push(event.status)
      }
    })()
    // The first status shows that the feed reads, so start the turn now.
    await waitUntil(() => statuses.length > 0)
    const turn = await owner.send('[harness-forwarding] status')
    await waitUntil(() => statuses.length >= 3)
    reading.abort()
    await read
    return {
      statuses,
      text: turn.text,
      ownerCalls: ownerModel.counter.calls,
      otherCalls: otherModel.counter.calls,
    }
  } finally {
    reading.abort()
    await close()
  }
}

/** A cancel that the other host gets stops the turn on the owner. */
async function cancel() {
  const ownerModel = scriptedModel([], Promise.resolve(), { hang: true })
  const otherModel = scriptedModel(['Not on this host.'], Promise.resolve())
  const { otherHost, owner, otherHarness, close } = await twoHosts(
    ownerModel,
    otherModel,
  )
  try {
    const turn = owner.send('[harness-forwarding] cancel')
    const ended = Promise.resolve(turn).then(
      (result) => ({ text: result.text }),
      (error: unknown) => ({
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    const { operationId } = await turn.receipt
    await waitUntil(() => ownerModel.counter.calls > 0)
    const handler = createHarnessHandler({
      host: otherHost,
      harness: otherHarness,
      openAccess: true,
    })
    const response = await handler(
      new Request('http://local/api/harness/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: THREAD,
          input: { op: 'cancel', operationId },
        }),
      }),
    )
    const receipt: { status: string } = await response.json()
    // A turn that does not stop ends the wait after 10 s.
    const outcome = await Promise.race([
      ended,
      new Promise((resolve) =>
        setTimeout(() => resolve({ error: 'The turn did not stop.' }), 10_000),
      ),
    ])
    return {
      receipt: { status: receipt.status },
      outcome,
      turnStatus: turn.status(),
      ownerCalls: ownerModel.counter.calls,
      otherCalls: otherModel.counter.calls,
    }
  } finally {
    await close()
  }
}

/**
 * The snapshots of the other host while the owner runs a tool that the user
 * approved. The approval is answered, so neither snapshot lists it.
 */
async function approval() {
  let started!: () => void
  const running = new Promise<void>((resolve) => {
    started = resolve
  })
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const deploy = toolDefinition({
    name: 'deploy',
    description: 'Deploy',
    inputSchema: z.object({}),
    needsApproval: true,
  }).server(async () => {
    started()
    await released
    return 'deployed'
  })
  const ownerModel = scriptedModel(
    [{ tool: 'deploy' }, 'Deployed.'],
    Promise.resolve(),
  )
  const otherModel = scriptedModel(['Not on this host.'], Promise.resolve())
  const { otherHost, owner, other, otherHarness, close } = await twoHosts(
    ownerModel,
    otherModel,
    [deploy],
  )
  try {
    await owner.send('[harness-forwarding] approval')
    const [wait] = owner.snapshot().pendingWaits
    if (!wait) throw new Error('The turn did not stop for approval.')
    const receipt = await owner.resolve({
      resume: [{ interruptId: wait.waitId, status: 'resolved', payload: true }],
    })
    await running
    const view = await otherHost.observe(otherHarness, { threadId: THREAD })
    const summary = (snapshot: {
      status: string
      pendingWaits: Array<{ waitId: string }>
    }) => ({
      status: snapshot.status,
      waits: snapshot.pendingWaits.map(({ waitId }) => waitId),
    })
    // The other host follows the log: wait until it has the resumed turn.
    await waitUntil(() => other.snapshot().status === 'running')
    const observed = summary(await view.snapshot())
    const open = summary(other.snapshot())
    release()
    await waitUntil(() => owner.snapshot().status === 'idle')
    return {
      receipt: { status: receipt.status },
      observed,
      open,
      ownerCalls: ownerModel.counter.calls,
      otherCalls: otherModel.counter.calls,
    }
  } finally {
    release()
    await close()
  }
}

const scenarios = { followUp, status, cancel, approval }

export const Route = createFileRoute('/api/harness-forwarding')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const picked = new URL(request.url).searchParams.get('scenario')
        const scenario =
          picked === 'status' || picked === 'cancel' || picked === 'approval'
            ? picked
            : 'followUp'
        try {
          return Response.json(await scenarios[scenario]())
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  },
})
