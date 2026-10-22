import { createFileRoute } from '@tanstack/react-router'
import { EventType, defineAgent } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  createHarnessHost,
  defineHarness,
  harnessAgent,
  logIdOf,
} from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import type { StreamChunk } from '@tanstack/ai'
import type { HarnessSession } from '@tanstack/ai-harness'

/**
 * The agent tree of a harness session: agents that start agents.
 *
 * `POST` with `{ scenario }` starts a scenario and returns its id. `GET
 * ?runId=` returns `{ done: false }` until the scenario ends, then `{ done:
 * true, result }` with what the test checks. Each scenario opens its own host, and closes it at the end.
 *
 * - `group`: a lead agent runs the agents `a`, `b`, and `c` in a group with
 *   `concurrency: 2`. Each agent records when it starts and ends.
 * - `budget`: a lead agent runs a worker with `budget: { maxTokens: 50 }`.
 *   The model call of the worker uses 80 tokens.
 * - `state`: a lead agent runs two agents that add to the shared state
 *   `count`, then reads it.
 * - `harness-agent`: the model of a lead harness calls a child harness
 *   (`harnessAgent`) as a tool.
 *
 * A custom `fetch` answers with canned Anthropic streams, so no aimock
 * fixture is needed.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'
const MODEL = 'claude-sonnet-5-5'

type AnthropicEvent = { type: string } & Record<string, unknown>

const sseOf = (events: Array<AnthropicEvent>) =>
  events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')

/** The first event of an answer. The call uses `inputTokens` + 1 tokens. */
const messageStart = (id: string, inputTokens: number): AnthropicEvent => ({
  type: 'message_start',
  message: {
    id,
    type: 'message',
    role: 'assistant',
    content: [],
    model: MODEL,
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: 0 },
  },
})

const ending = (stopReason: string): Array<AnthropicEvent> => [
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]

/** An answer with the text `text`. */
const reply =
  (text: string, inputTokens = 5) =>
  (id: string) =>
    sseOf([
      messageStart(id, inputTokens),
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
      ...ending('end_turn'),
    ])

/** An answer that calls the tool `name` with `input`. */
const callTool =
  (name: string, input: Record<string, unknown>) => (id: string) =>
    sseOf([
      messageStart(id, 5),
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_child', name, input: {} },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: JSON.stringify(input),
        },
      },
      ...ending('tool_use'),
    ])

/** A model that answers with `answers`, in order. */
function scripted(answers: Array<(id: string) => string>) {
  let calls = 0
  const scriptedFetch: typeof fetch = async () => {
    calls += 1
    const answer = answers[calls - 1] ?? reply('No more answers.')
    return new Response(answer(`msg_agent_tree_${calls}`), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  return createAnthropicChat(MODEL, DUMMY_KEY, { fetch: scriptedFetch })
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const errorOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/** The fields of an agent run that the test checks. */
const runsOf = (session: HarnessSession) =>
  session.agentRuns().map((run) => ({
    runId: run.runId,
    agent: run.agent,
    status: run.status,
    parentRunId: run.parentRunId ?? null,
    error: run.error ?? null,
  }))

/** Open a harness with `agents` on a new host. */
async function openWith(
  name: string,
  agents: Parameters<typeof defineHarness>[0]['agents'],
) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const harness = defineHarness({
    name: `e2e/harness-agent-tree-${name}`,
    adapter: scripted([]),
    agents,
  })
  const session = await host.open(harness, {
    threadId: `e2e-harness-agent-tree-${name}-${crypto.randomUUID()}`,
  })
  return { host, session }
}

async function group() {
  const order: Array<string> = []
  let active = 0
  let maxActive = 0
  // An agent that records when it starts and ends, and works for `ms`.
  const worker = (name: string, ms: number) =>
    defineAgent({
      name,
      description: `Works on a topic for ${ms} ms`,
      inputSchema: z.object({ topic: z.string() }),
      run: async (ctx) => {
        order.push(`start ${name}`)
        active += 1
        maxActive = Math.max(maxActive, active)
        await sleep(ms)
        active -= 1
        order.push(`end ${name}`)
        return `${name}: ${ctx.input.topic}`
      },
    })
  const a = worker('a', 400)
  const b = worker('b', 100)
  const c = worker('c', 100)
  const lead = defineAgent({
    name: 'lead',
    description: 'Runs a, b, and c, two at a time',
    run: (ctx) => {
      if (!ctx.harness) throw new Error('This agent must run in a harness.')
      return ctx.harness.agents.group({ concurrency: 2 }, (g) => [
        g.start(a, { topic: 'auth' }),
        g.start(b, { topic: 'billing' }),
        g.start(c, { topic: 'search' }),
      ])
    },
  })
  const { host, session } = await openWith('group', [lead, a, b, c])
  try {
    const run = session.agents.lead.start(undefined)
    const results = await run
    return {
      results,
      leadRunId: run.id,
      runs: runsOf(session),
      order,
      maxActive,
    }
  } finally {
    await host.close()
  }
}

async function budget() {
  const worker = defineAgent({
    name: 'worker',
    description: 'Answers with one model call of 80 tokens',
    // 79 input tokens and 1 output token.
    run: (ctx) =>
      ctx.chat({ adapter: scripted([reply('A long answer.', 79)]) }),
  })
  const lead = defineAgent({
    name: 'lead',
    description: 'Runs the worker with a budget, and returns the error code',
    run: async (ctx) => {
      if (!ctx.harness) throw new Error('This agent must run in a harness.')
      return ctx.harness.agents
        .run(worker, undefined, { budget: { maxTokens: 50 } })
        .then(
          () => 'finished',
          (error: unknown) =>
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            typeof error.code === 'string'
              ? error.code
              : errorOf(error),
        )
    },
  })
  const { host, session } = await openWith('budget', [lead, worker])
  try {
    const run = session.agents.lead.start(undefined)
    const leadResult = await run
    return { leadResult, leadRunId: run.id, runs: runsOf(session) }
  } finally {
    await host.close()
  }
}

async function state() {
  const counter = () => ({ key: 'count', initial: 0 })
  const adder = defineAgent({
    name: 'adder',
    description: 'Adds `by` to the shared count',
    inputSchema: z.object({ by: z.number() }),
    run: (ctx) => {
      if (!ctx.harness) throw new Error('This agent must run in a harness.')
      return ctx.harness
        .state(counter())
        .update((count) => count + ctx.input.by)
    },
  })
  const lead = defineAgent({
    name: 'lead',
    description: 'Runs two adders at the same time, then reads the count',
    run: async (ctx) => {
      if (!ctx.harness) throw new Error('This agent must run in a harness.')
      await ctx.harness.agents.group({}, (g) => [
        g.start(adder, { by: 1 }),
        g.start(adder, { by: 10 }),
      ])
      return ctx.harness.state(counter()).get()
    },
  })
  const { host, session } = await openWith('state', [lead, adder])
  try {
    const count = await session.agents.lead.start(undefined)
    return { count, runs: runsOf(session) }
  } finally {
    await host.close()
  }
}

/** `metadata.tanstack.parentRunId` of `chunk`, if it has one. */
function parentRunIdOf(chunk: StreamChunk) {
  const metadata: unknown = 'metadata' in chunk ? chunk.metadata : undefined
  if (typeof metadata !== 'object' || metadata === null) return null
  if (!('tanstack' in metadata)) return null
  const { tanstack } = metadata
  if (typeof tanstack !== 'object' || tanstack === null) return null
  if (!('parentRunId' in tanstack)) return null
  return typeof tanstack.parentRunId === 'string' ? tanstack.parentRunId : null
}

async function childHarness() {
  const child = defineHarness({
    name: 'e2e/harness-agent-tree-child',
    description: 'Checks a change',
    // 40 input tokens and 1 output token.
    adapter: scripted([reply('Child answer.', 40)]),
  })
  const agent = harnessAgent(child)
  const lead = defineHarness({
    name: 'e2e/harness-agent-tree-lead',
    // Two model calls of 6 tokens each.
    adapter: scripted([
      callTool(agent.name, { prompt: 'Check the change.' }),
      reply('Done.'),
    ]),
    subagents: { agents: [agent] },
  })
  const persistence = memoryPersistence()
  const host = createHarnessHost({ persistence })
  const threadId = `e2e-harness-agent-tree-lead-${crypto.randomUUID()}`
  try {
    const session = await host.open(lead, { threadId })
    const turn = session.send('[harness-agent-tree] check it')
    const chunks: Array<StreamChunk> = []
    for await (const chunk of turn.stream()) chunks.push(chunk)
    const result = await turn
    const childText = chunks.find(
      (chunk) =>
        chunk.type === EventType.TEXT_MESSAGE_CONTENT &&
        chunk.delta.includes('Child answer.'),
    )
    // The thread of the child, from the log of the root thread.
    const records = await persistence.stores.log.read({
      logId: logIdOf({ logId: threadId }),
    })
    const childThread =
      records
        .map((entry) => entry.record.thread)
        .find(
          (thread): thread is string =>
            typeof thread === 'string' &&
            thread.startsWith(`${threadId}/agent/`),
        ) ?? null
    let openError: string | null = null
    if (childThread) {
      await host.open(child, { threadId: childThread }).then(
        () => {
          openError = 'host.open did not throw.'
        },
        (error: unknown) => {
          openError = errorOf(error)
        },
      )
    }
    return {
      text: result.text,
      turnId: turn.id,
      childTextParentRunId: childText ? parentRunIdOf(childText) : null,
      totalTokens: session.usage().total.totalTokens,
      threadId,
      childThread,
      openError,
    }
  } finally {
    await host.close()
  }
}

const scenarios = {
  group,
  budget,
  state,
  'harness-agent': childHarness,
}

type Scenario = keyof typeof scenarios

interface Run {
  done: boolean
  result?: unknown
  error?: string
}

// ponytail: the result of each scenario, kept in memory by run id.
const runs = new Map<string, Run>()
/** A result that nobody reads goes away after this time. */
const RUN_TTL_MS = 60_000

export const Route = createFileRoute('/api/harness-agent-tree')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { scenario } = (await request.json()) as { scenario: Scenario }
        if (!(scenario in scenarios)) {
          return Response.json({ error: `No scenario ${scenario}.` })
        }
        const runId = crypto.randomUUID()
        const run: Run = { done: false }
        runs.set(runId, run)
        setTimeout(() => runs.delete(runId), RUN_TTL_MS)
        scenarios[scenario]().then(
          (result) => {
            run.result = result
            run.done = true
          },
          (error: unknown) => {
            run.error = errorOf(error)
            run.done = true
          },
        )
        return Response.json({ runId })
      },
      GET: ({ request }) => {
        const runId = new URL(request.url).searchParams.get('runId') ?? ''
        const run = runs.get(runId)
        if (!run) return Response.json({ error: `No run ${runId}.` })
        if (run.error !== undefined) return Response.json({ error: run.error })
        return Response.json({ done: run.done, result: run.result ?? null })
      },
    },
  },
})
