/**
 * This oracle owns the promise that a reloaded chat is the chat the user saw
 * live: `modelMessagesToUIMessages` over the transcript the server stores
 * gives the same `UIMessage[]` that `StreamProcessor` built from the stream,
 * and each tool-call part's `output` is the value the tool returned. It owns
 * the reload in `messages.ts` and the tool-output paths in `processor.ts`.
 *
 * ```ts
 * // a tool returns '42'
 * part.output                                   // → '42' (live)
 * modelMessagesToUIMessages(transcript)         // → the live chat
 * part.output                                   // → '42' (after reload)
 * modelMessagesToUIMessages(convertMessagesToModelMessages(reloaded)) // → reloaded
 * modelMessagesToUIMessages(transcript)         // → returns, never throws
 * ```
 *
 * Why does a tool that returns the string `'42'` show the number `42`? The
 * wire's `TOOL_CALL_RESULT.content` and a stored `role: 'tool'` message both
 * hold the result as one string, and `normalizeToolResult` writes the string
 * `'42'` and the number `42` as the same text. A reader that parses the
 * content as JSON cannot tell them apart, so every string result that is
 * also JSON text (`'42'`, `'true'`, `'null'`, `'"x"'`, `'[1]'`, `'{"a":1}'`)
 * changes type.
 *
 * Three moving parts make the promise hard. The live chat is built from
 * events by `StreamProcessor`. The transcript is the server's own
 * `ModelMessage[]`: `ctx.messages` at the end of a `chat()` run, or, after
 * the client answers a client tool, the client's chat converted by
 * `convertMessagesToModelMessages`, which `chat()` stores as its messages
 * on the next request. The reload is `modelMessagesToUIMessages` over that
 * transcript.
 *
 * Reload equals live: for every `chat()` run (thinking, text, server tools
 * that succeed or throw, over one to three model calls, optionally ending in
 * client tool calls that the client answers), the reload equals the live
 * chat. `ModelMessage.id` documents that "a hydrated message keeps the same
 * identity as its live stream"; the whole message is decision by Alem Tuzlak
 * (GitHub AlemTuzlak), 2026-11-12. The comparison leaves out `createdAt`,
 * and these live-only hints, by the same decision: `metadata.tanstack.model`
 * and `metadata.tanstack.index` on tool-call parts, `metadata.tanstack.index`
 * on assistant messages, and `metadata.tanstack.state: 'output-error'` on a
 * failed tool result. A thinking part has no `stepId`: it was a streaming
 * key, now kept inside the processor (decision by Alem Tuzlak, GitHub
 * AlemTuzlak, 2026-11-13). Tool output keeps its value and type: for
 * every JSON value a tool returns, `part.output` deep-equals it, live and
 * after reload, for server and client tools (`docs/tools/client-tools.md`,
 * "typed `part.input` and `part.output`"). A string result stays a string,
 * also when it is JSON text: `chat()` does not parse it (decision by Alem
 * Tuzlak, GitHub AlemTuzlak, 2026-11-13). A second reload changes nothing.
 * The reload never throws on a transcript that `chat()` wrote.
 *
 * The model reads the planned tool values from the plan: they are the
 * expected outputs. Reload equality and the second reload are relations
 * between two production results, so the check compares them; calibrations
 * show each one rejects a changed chat. The driver runs the real `chat()`
 * with `fakeText`, wrapped to act as the OpenAI, Anthropic and Gemini
 * adapters do: `parentMessageId` on `TOOL_CALL_START` (without it, client
 * and server each mint an id for a turn with no text), and a new message id
 * for each model call (fakeText reuses `${runId}-text` within one run). Constructed histories
 * reach a JSON-text string result on both tool paths, a throwing tool, a
 * turn with no text, thinking, and two server rounds.
 *
 * Limits: the HTTP wire between client and server (`uiMessagesToWire`,
 * `chatParamsFromRequest`) is not exercised; the transcript goes in
 * process. Tool values are JSON values without `-0`, since JSON has no
 * `-0` (decision by Alem Tuzlak, GitHub AlemTuzlak, 2026-11-12); content-part arrays (multimodal results), approvals, subagents and
 * `RUN_ERROR` runs are not generated. Warnings are not observed. `Date` is
 * frozen during a run, so every `createdAt` is the same instant: the second
 * reload compares it, but no history has two different times.
 */
import fc from 'fast-check'
import { vi } from 'vitest'
import { differs, oracleProperty, pass, violation } from '@tanstack/oracles'
import type { Observation, Verdict } from '@tanstack/oracles'
import { chat } from '../src/activities/chat/index'
import {
  convertMessagesToModelMessages,
  modelMessagesToUIMessages,
} from '../src/activities/chat/messages'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { fakeText } from '../src/testing'
import type { FakeResponse } from '../src/testing'
import type { ModelMessage, Tool } from '../src/types'

// ---------------------------------------------------------------------------
// Histories
// ---------------------------------------------------------------------------

type Json = fc.JsonValue

interface ServerCall {
  /** The tool throws instead of returning `value`. */
  fails: boolean
  input: { [k: string]: Json }
  value: Json
}
interface ClientCall {
  input: { [k: string]: Json }
  value: Json
}
interface Round {
  thinking: string | null
  text: string | null
  calls: Array<ServerCall>
}
interface Ending {
  thinking: string | null
  /** Required when there are no client calls: the run ends with an answer. */
  text: string | null
  /** Client tool calls the run ends on. */
  clientCalls: Array<ClientCall>
  /** The client answers them with `addToolResult` before the reload. When
   * false, the chat reloads while they wait. */
  answered: boolean
}
interface History {
  rounds: Array<Round>
  ending: Ending
}

const hasNegativeZero = (value: unknown): boolean =>
  Object.is(value, -0) ||
  (value !== null &&
    typeof value === 'object' &&
    Object.values(value).some(hasNegativeZero))
const isJson = (value: unknown): value is Json =>
  value === null ||
  ['boolean', 'string'].includes(typeof value) ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'object' && Object.values(value).every(isJson))
const withoutNegativeZero = (value: Json): Json =>
  Object.is(value, -0)
    ? 0
    : Array.isArray(value)
      ? value.map(withoutNegativeZero)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value).map(([k, v]) => [
              k,
              v === undefined ? null : withoutNegativeZero(v),
            ]),
          )
        : value

// JSON has no -0, so a tool value is a JSON value without it (a limit).
const jsonValue: fc.Arbitrary<Json> = fc
  .jsonValue({ maxDepth: 2 })
  .map(withoutNegativeZero, (value) => {
    if (!isJson(value) || hasNegativeZero(value))
      throw new Error('not a JSON tool value without -0')
    return value
  })

// The class of Finding 1: strings that are also JSON text.
const jsonTextString = jsonValue.map(
  (value) => JSON.stringify(value),
  (text) => {
    if (typeof text !== 'string') throw new Error('not a string')
    const value: Json = JSON.parse(text)
    if (JSON.stringify(value) !== text) throw new Error('not canonical JSON')
    return value
  },
)

const toolValue: fc.Arbitrary<Json> = fc.oneof(
  jsonTextString,
  fc.string({ unit: 'binary', maxLength: 12 }),
  jsonValue,
)
const toolInput = fc.dictionary(
  fc.string({ unit: 'binary', maxLength: 4 }),
  jsonValue,
  { maxKeys: 3 },
)
const words = fc.string({ unit: 'grapheme', minLength: 1, maxLength: 8 })
const maybeWords = fc.option(words, { nil: null })

const round: fc.Arbitrary<Round> = fc.record({
  thinking: maybeWords,
  text: maybeWords,
  calls: fc.array(
    fc.record({ fails: fc.boolean(), input: toolInput, value: toolValue }),
    { minLength: 1, maxLength: 2 },
  ),
})
const ending: fc.Arbitrary<Ending> = fc.oneof(
  fc.record({
    thinking: maybeWords,
    text: words,
    clientCalls: fc.array(fc.record({ input: toolInput, value: toolValue }), {
      maxLength: 0,
    }),
    answered: fc.constant(true),
  }),
  fc.record({
    thinking: maybeWords,
    text: maybeWords,
    clientCalls: fc.array(fc.record({ input: toolInput, value: toolValue }), {
      minLength: 1,
      maxLength: 2,
    }),
    answered: fc.boolean(),
  }),
)
const history: fc.Arbitrary<History> = fc.record({
  rounds: fc.array(round, { maxLength: 2 }),
  ending,
})

const serverCallId = (r: number, i: number) => `call-${r}-${i}`
const clientCallId = (i: number) => `ask-${i}`

const isJsonText = (value: Json) => {
  if (typeof value !== 'string') return false
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

// Reach is a predicate over the plan.
const STATES = [
  'json-text string from a server tool',
  'json-text string from a client tool',
  'throwing server tool',
  'turn with tool calls and no text',
  'thinking',
  'two server rounds',
  'client call waits at reload',
] as const
function reachedStates(plan: History): Array<string> {
  const served = plan.rounds.flatMap((r) => r.calls)
  const states: Array<string> = []
  if (served.some((c) => !c.fails && isJsonText(c.value)))
    states.push(STATES[0])
  if (
    plan.ending.answered &&
    plan.ending.clientCalls.some((c) => isJsonText(c.value))
  )
    states.push(STATES[1])
  if (served.some((c) => c.fails)) states.push(STATES[2])
  if (plan.rounds.some((r) => r.text === null)) states.push(STATES[3])
  if ([...plan.rounds, plan.ending].some((r) => r.thinking !== null))
    states.push(STATES[4])
  if (plan.rounds.length === 2) states.push(STATES[5])
  if (!plan.ending.answered) states.push(STATES[6])
  return states
}

const answered: Round = {
  thinking: null,
  text: 'call',
  calls: [{ fails: false, input: {}, value: '42' }],
}
const constructed = [
  {
    name: 'a server tool returns the string 42',
    enters: [STATES[0]],
    build: (g: History): History => ({
      ...g,
      rounds: [answered, ...g.rounds].slice(0, 2),
    }),
  },
  {
    name: 'the client answers with a JSON object string',
    enters: [STATES[1]],
    build: (g: History): History => ({
      ...g,
      ending: {
        ...g.ending,
        clientCalls: [{ input: {}, value: '{"a":1}' }],
        answered: true,
      },
    }),
  },
  {
    name: 'the chat reloads while a client call waits',
    enters: [STATES[6]],
    build: (g: History): History => ({
      ...g,
      ending: {
        ...g.ending,
        clientCalls: [{ input: { q: 1 }, value: 'unused' }],
        answered: false,
      },
    }),
  },
  {
    name: 'a server tool throws',
    enters: [STATES[2]],
    build: (g: History): History => ({
      ...g,
      rounds: [
        { ...answered, calls: [{ fails: true, input: {}, value: null }] },
        ...g.rounds,
      ].slice(0, 2),
    }),
  },
  {
    name: 'a model call has tool calls and no text',
    enters: [STATES[3]],
    build: (g: History): History => ({
      ...g,
      rounds: [{ ...answered, text: null }, ...g.rounds].slice(0, 2),
    }),
  },
  {
    name: 'the answer starts with thinking',
    enters: [STATES[4]],
    build: (g: History): History => ({
      ...g,
      ending: { ...g.ending, thinking: 'hmm', text: g.ending.text ?? 'ok' },
    }),
  },
  {
    name: 'two server rounds',
    enters: [STATES[5]],
    build: (g: History): History => ({
      ...g,
      rounds: [answered, { ...answered, text: 'again' }],
    }),
  },
]

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

interface Expected {
  /** Tool call id → the value its tool returned. Throwing tools are absent. */
  outputs: Array<{ id: string; value: Json }>
}

// Tool output keeps its value and type: the expected output of each call is
// the value the plan has the tool return.
function model(plan: History): Expected {
  return {
    outputs: [
      ...plan.rounds.flatMap((r, ri) =>
        r.calls.flatMap((c, i) =>
          c.fails ? [] : [{ id: serverCallId(ri, i), value: c.value }],
        ),
      ),
      // A waiting client call has no output yet.
      ...(plan.ending.answered ? plan.ending.clientCalls : []).map((c, i) => ({
        id: clientCallId(i),
        value: c.value,
      })),
    ],
  }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function responses(plan: History): Array<FakeResponse> {
  const step = (
    r: { thinking: string | null; text: string | null },
    toolCalls: FakeResponse['toolCalls'],
  ): FakeResponse => ({
    ...(r.thinking !== null && { thinking: r.thinking }),
    ...(r.text !== null && { text: r.text }),
    ...(toolCalls && toolCalls.length > 0 && { toolCalls }),
  })
  return [
    ...plan.rounds.map((r, ri) =>
      step(
        r,
        r.calls.map((c, i) => ({
          id: serverCallId(ri, i),
          name: c.fails ? 'fail' : 'echo',
          input: c.input,
        })),
      ),
    ),
    step(
      plan.ending,
      plan.ending.clientCalls.map((c, i) => ({
        id: clientCallId(i),
        name: 'ask',
        input: c.input,
      })),
    ),
  ]
}

/**
 * The adapter as real providers send it: each model call has its own message
 * ids (fakeText derives them from the run id, which every call of one run
 * shares), and tool calls name that call's text message.
 */
function asRealAdapter(fake: ReturnType<typeof fakeText>) {
  let call = 0
  const adapter = Object.create(fake) as typeof fake
  adapter.chatStream = async function* (options) {
    const n = ++call
    // One model call's text and tool calls share its message id.
    const textMessageId = `${options.runId}-text-${n}`
    for await (const event of fake.chatStream(options)) {
      if (event.type === 'TOOL_CALL_START')
        yield { ...event, parentMessageId: textMessageId }
      else if ('messageId' in event && typeof event.messageId === 'string')
        yield { ...event, messageId: `${event.messageId}-${n}` }
      else yield event
    }
  }
  return adapter
}

/** Observations are data: Dates become ISO strings, undefined drops out. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value))
const errorText = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

async function driver(
  plan: History,
  observe: (checkpoint: string, value: unknown) => void,
) {
  const values = new Map<string, Json>()
  plan.rounds.forEach((r, ri) =>
    r.calls.forEach((c, i) => values.set(serverCallId(ri, i), c.value)),
  )
  const tools: Array<Tool> = [
    {
      name: 'echo',
      description: 'Returns its planned value',
      execute: (_input: unknown, context?: { toolCallId?: string }) =>
        values.get(context?.toolCallId ?? ''),
    },
    {
      name: 'fail',
      description: 'Throws',
      execute: () => {
        throw new Error('tool failed')
      },
    },
    { name: 'ask', description: 'A client tool' },
  ]
  const fake = fakeText()
  fake.setResponses(responses(plan))

  // A fixed user id, run id and a frozen Date keep two runs of one history
  // equal.
  vi.useFakeTimers({ toFake: ['Date'], now: 0 })
  try {
    await runAndReload(plan, observe, tools, fake)
  } finally {
    vi.useRealTimers()
  }
}

async function runAndReload(
  plan: History,
  observe: (checkpoint: string, value: unknown) => void,
  tools: Array<Tool>,
  fake: ReturnType<typeof fakeText>,
) {
  const processor = new StreamProcessor()
  const userId = processor.addUserMessage('go', 'user-1').id
  let transcript: Array<ModelMessage> = []
  const runErrors: Array<string> = []
  try {
    for await (const chunk of chat({
      threadId: 'thread',
      runId: 'run-1',
      adapter: asRealAdapter(fake),
      messages: [{ role: 'user', content: 'go', id: userId }],
      tools,
      middleware: [
        {
          name: 'capture-transcript',
          onFinish(ctx) {
            transcript = [...ctx.messages]
          },
        },
      ],
    })) {
      if (chunk.type === 'RUN_ERROR') runErrors.push(chunk.message)
      processor.processChunk(chunk)
    }
    processor.finalizeStream()
    // The client answers its tool calls; the next request stores its chat.
    if (plan.ending.answered && plan.ending.clientCalls.length > 0) {
      plan.ending.clientCalls.forEach((c, i) =>
        processor.addToolResult(clientCallId(i), c.value),
      )
      transcript = convertMessagesToModelMessages(processor.getMessages())
    }
  } catch (error) {
    runErrors.push(errorText(error))
  }
  observe('run errors', runErrors)
  observe('live chat', data(processor.getMessages()))

  let reloaded
  try {
    reloaded = modelMessagesToUIMessages(transcript)
    observe('reload chat', data(reloaded))
  } catch (error) {
    observe('reload error', errorText(error))
    return
  }
  try {
    observe(
      'reload twice',
      data(modelMessagesToUIMessages(convertMessagesToModelMessages(reloaded))),
    )
  } catch (error) {
    observe('reload error', errorText(error))
  }
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

type Chat = Array<{
  id: string
  role: string
  metadata?: { tanstack?: Record<string, unknown> }
  parts: Array<{
    type: string
    id?: string
    output?: unknown
    metadata?: { tanstack?: Record<string, unknown> }
    [k: string]: unknown
  }>
  [k: string]: unknown
}>

const seen = (observations: ReadonlyArray<Observation>, checkpoint: string) =>
  observations.find((o) => o.checkpoint === checkpoint)

/** Setup: the run itself must not fail, or no law can be judged. */
function setupFailure(
  observations: ReadonlyArray<Observation>,
  law: string,
): Verdict | undefined {
  const errors = seen(observations, 'run errors')?.value
  if (!Array.isArray(errors) || errors.length > 0)
    return violation(
      'run errors',
      `the chat() run failed: ${JSON.stringify(errors)}`,
      law,
    )
  return undefined
}

/** Drop the live-only hints that the decision leaves out of the comparison. */
function withoutLiveOnlyHints(messages: Chat): unknown {
  const prune = (
    holder: { metadata?: { tanstack?: Record<string, unknown> } },
    keys: Array<string>,
  ) => {
    const tanstack = holder.metadata?.tanstack
    if (!tanstack) return
    for (const key of keys) {
      if (key === 'state' && tanstack.state !== 'output-error') continue
      delete tanstack[key]
    }
    if (Object.keys(tanstack).length === 0) delete holder.metadata!.tanstack
    if (Object.keys(holder.metadata!).length === 0) delete holder.metadata
  }
  const copy = structuredClone(messages)
  for (const message of copy) {
    delete message.createdAt
    if (message.role === 'assistant') prune(message, ['index'])
    for (const part of message.parts) {
      delete part.createdAt
      if (part.type === 'tool-call') prune(part, ['model', 'index'])
      if (part.type === 'tool-result') prune(part, ['state'])
    }
  }
  return copy
}

const outputsOf = (messages: Chat) =>
  new Map(
    messages
      .flatMap((m) => m.parts)
      .filter((p) => p.type === 'tool-call')
      .map((p) => [p.id, p.output]),
  )

const RELOAD_EQUALS_LIVE = 'reload equals live'
const OUTPUT_KEEPS_TYPE = 'tool output keeps its value and type'
const SECOND_RELOAD = 'a second reload changes nothing'
const NO_THROW = 'reload never throws'

const history$ = {
  arbitrary: history,
  states: [...STATES],
  runs: 40,
  fixedSeeds: [20261112],
  constructed,
}

const shared = {
  histories: history$,
  model,
  driver,
  reached: (plan: History) => reachedStates(plan),
}

oracleProperty<History, Expected>({
  id: 'chat-reload/reload-equals-live',
  law: {
    statement:
      'For every chat() run, modelMessagesToUIMessages over the stored transcript equals the chat StreamProcessor built live, leaving out createdAt and the live-only hints (tool-call metadata.tanstack.model and .index, assistant metadata.tanstack.index, tool-result metadata.tanstack.state "output-error").',
    authority:
      'ModelMessage.id: "a hydrated message keeps the same identity as its live stream" (docs/reference/interfaces/ModelMessage.md). Decision by Alem Tuzlak (GitHub AlemTuzlak), 2026-11-12: the whole message survives the reload; the listed metadata hints are live-only. 2026-11-13: ThinkingPart has no stepId.',
    limits:
      'In-process transcript, not the HTTP wire. No approvals, subagents, multimodal results or RUN_ERROR runs.',
  },
  owns: [
    'src/activities/chat/messages.ts#modelMessagesToUIMessages',
    'src/activities/chat/stream/processor.ts#StreamProcessor.handleToolCallResultEvent',
  ],
  ...shared,
  check: (_plan, observations) => {
    const failed = setupFailure(observations, RELOAD_EQUALS_LIVE)
    if (failed) return failed
    const live = seen(observations, 'live chat')?.value as Chat
    const reload = seen(observations, 'reload chat')?.value as Chat | undefined
    if (!reload)
      return violation(
        'reload chat',
        'the reload produced no chat',
        RELOAD_EQUALS_LIVE,
      )
    return (
      differs(
        'reload chat',
        RELOAD_EQUALS_LIVE,
        withoutLiveOnlyHints(reload),
        withoutLiveOnlyHints(live),
        'the reloaded chat differs from the live chat',
      ) ?? pass
    )
  },
  calibrations: [
    {
      name: 'the reload loses the last part of a message',
      law: RELOAD_EQUALS_LIVE,
      corrupt: (trace) =>
        trace.map((o) =>
          o.checkpoint === 'reload chat'
            ? {
                ...o,
                value: (o.value as Chat).map((m, i, all) =>
                  i === all.length - 1
                    ? { ...m, parts: m.parts.slice(0, -1) }
                    : m,
                ),
              }
            : o,
        ),
    },
  ],
})

oracleProperty<History, Expected>({
  id: 'chat-reload/output-keeps-type',
  law: {
    statement:
      "For every JSON value a server or client tool returns, the tool-call part's output deep-equals that value, with the same type, in the live chat and after reload.",
    authority:
      'docs/tools/client-tools.md, "Show the tool call in your UI": a check on part.name "gives you typed part.input and part.output". Decision by Alem Tuzlak (GitHub AlemTuzlak), 2026-11-13: a server tool that returns a string keeps that string; chat() does not parse JSON text.',
    limits:
      'JSON values without -0: decision by Alem Tuzlak (GitHub AlemTuzlak), 2026-11-12, since JSON has no -0. Content-part arrays are not generated.',
  },
  owns: [
    'src/activities/chat/messages.ts#modelMessagesToUIMessages',
    'src/activities/chat/stream/processor.ts#StreamProcessor.handleToolCallResultEvent',
  ],
  ...shared,
  check: (_plan, observations, expected) => {
    const failed = setupFailure(observations, OUTPUT_KEEPS_TYPE)
    if (failed) return failed
    for (const checkpoint of ['live chat', 'reload chat']) {
      const messages = seen(observations, checkpoint)?.value as Chat | undefined
      if (!messages)
        return violation(
          checkpoint,
          'no chat to read outputs from',
          OUTPUT_KEEPS_TYPE,
        )
      const outputs = outputsOf(messages)
      for (const { id, value } of expected.outputs) {
        const verdict = differs(
          checkpoint,
          OUTPUT_KEEPS_TYPE,
          outputs.get(id),
          value,
          `tool call ${id}: output differs from the value the tool returned`,
        )
        if (verdict) return verdict
      }
    }
    return pass
  },
  calibrations: [
    {
      name: 'a string output arrives parsed',
      law: OUTPUT_KEEPS_TYPE,
      corrupt: (trace, plan) => {
        const target = model(plan).outputs[0]
        if (!target) return undefined
        return trace.map((o) =>
          o.checkpoint === 'live chat'
            ? {
                ...o,
                value: (o.value as Chat).map((m) => ({
                  ...m,
                  parts: m.parts.map((p) =>
                    p.id === target.id
                      ? { ...p, output: { wrapped: target.value } }
                      : p,
                  ),
                })),
              }
            : o,
        )
      },
    },
  ],
})

oracleProperty<History, Expected>({
  id: 'chat-reload/second-reload',
  law: {
    statement:
      'For every transcript chat() wrote, modelMessagesToUIMessages(convertMessagesToModelMessages(reloaded)) equals the reloaded chat.',
    authority:
      'Decision by Alem Tuzlak (GitHub AlemTuzlak), 2026-11-12: a second reload changes nothing.',
    limits: 'Same histories as reload equals live.',
  },
  owns: [
    'src/activities/chat/messages.ts#modelMessagesToUIMessages',
    'src/activities/chat/stream/processor.ts#StreamProcessor.handleToolCallResultEvent',
  ],
  ...shared,
  check: (_plan, observations) => {
    const failed = setupFailure(observations, SECOND_RELOAD)
    if (failed) return failed
    const once = seen(observations, 'reload chat')?.value
    const twice = seen(observations, 'reload twice')?.value
    if (twice === undefined)
      return violation(
        'reload twice',
        'the second reload produced no chat',
        SECOND_RELOAD,
      )
    return (
      differs(
        'reload twice',
        SECOND_RELOAD,
        twice,
        once,
        'the second reload differs from the first',
      ) ?? pass
    )
  },
  calibrations: [
    {
      name: 'the second reload drops a message',
      law: SECOND_RELOAD,
      corrupt: (trace) =>
        trace.map((o) =>
          o.checkpoint === 'reload twice'
            ? { ...o, value: (o.value as Chat).slice(0, -1) }
            : o,
        ),
    },
  ],
})

oracleProperty<History, Expected>({
  id: 'chat-reload/no-throw',
  law: {
    statement:
      'For every transcript chat() wrote, modelMessagesToUIMessages returns without throwing.',
    authority:
      'The reload path of @tanstack/ai-persistence (reconstruct.ts) calls it on every stored thread; its contract returns UIMessage[].',
    limits: 'Same histories as reload equals live.',
  },
  owns: [
    'src/activities/chat/messages.ts#modelMessagesToUIMessages',
    'src/activities/chat/stream/processor.ts#StreamProcessor.handleToolCallResultEvent',
  ],
  ...shared,
  check: (_plan, observations) => {
    const failed = setupFailure(observations, NO_THROW)
    if (failed) return failed
    const error = seen(observations, 'reload error')
    return error
      ? violation(
          'reload error',
          `the reload threw: ${String(error.value)}`,
          NO_THROW,
        )
      : pass
  },
  calibrations: [
    {
      name: 'the reload throws',
      law: NO_THROW,
      corrupt: (trace) => [
        ...trace,
        { checkpoint: 'reload error', value: 'TypeError: boom' },
      ],
    },
  ],
})
