import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin, logIdOf } from '../src'
import { isRecord } from '../src/utils'
import {
  appendToLog,
  gate,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { AgentActions, HarnessSession } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })

/** One model call that answers `content` and reports `tokens` tokens. */
function textWithTokens(content: string, tokens: number): Array<StreamChunk> {
  return withUsage(text(content), tokens)
}

/** The model call `chunks`, reporting `tokens` tokens. */
function withUsage(chunks: Array<StreamChunk>, tokens: number) {
  return chunks.map((chunk) =>
    chunk.type === EventType.RUN_FINISHED
      ? {
          ...chunk,
          usage: {
            promptTokens: tokens - 10,
            completionTokens: 10,
            totalTokens: tokens,
          },
        }
      : chunk,
  )
}

/** One model call that fails with `message` before any output. */
const runError = (message: string): Array<StreamChunk> => [
  { type: EventType.RUN_ERROR, message, timestamp: Date.now() },
]

/** The text of `error`, for an agent that returns why a start failed. */
const why = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/** A promise that resolves when `signal` aborts. */
const untilAbort = (signal: AbortSignal | undefined) =>
  new Promise<void>((resolve) => {
    if (!signal || signal.aborted) return resolve()
    signal.addEventListener('abort', () => resolve(), { once: true })
  })

function durablePersistence() {
  const { metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), metadata } }
}

type Durable = ReturnType<typeof durablePersistence>

/**
 * Stop the host of `session`: its log refuses writes, so the session stops,
 * and `running` rejects. Then the log works again for the next host.
 */
async function stopHost(
  log: LogStore,
  session: HarnessSession,
  running: PromiseLike<unknown>,
) {
  const refuse = vi
    .spyOn(log, 'append')
    .mockRejectedValue(new Error('the host is gone'))
  await expect(
    session.appendRecords({ records: [{ type: 'app.ping' }] }),
  ).rejects.toThrow()
  await expect(running).rejects.toThrow()
  refuse.mockRestore()
}

/** The id of the first `agent` input in the log. */
async function firstAgentInput(log: LogStore) {
  const record = (await log.read({ logId: LOG }))
    .map((entry) => entry.record)
    .find(
      (entry) =>
        entry.type === 'harness.input' &&
        isRecord(entry.input) &&
        entry.input.op === 'agent',
    )
  return String(record?.inputId)
}

describe('limits of agent starts', () => {
  it('gives the call of a start back when its run fails before it applies', async () => {
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      run: async () => 'helped',
    })
    const lead = defineAgent({
      name: 'lead',
      description: 'Starts an unknown agent, then the helper',
      run: async (ctx) => {
        const missing = await ctx.harness!.agents.run('missing').then(
          () => 'ran',
          (error: unknown) => why(error),
        )
        const helped = await ctx.harness!.agents.run(helper)
        return { missing, helped }
      },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-limits',
        adapter: mockAdapter([]).adapter,
        agents: [lead, helper],
        // The lead is the first call of its tree, so one child is left.
        subagents: { agents: [], limits: { maxCalls: 2 } },
      }),
      { threadId: THREAD },
    )

    await expect(session.agents.lead.start()).resolves.toEqual({
      missing: 'Unknown agent: missing',
      helped: 'helped',
    })
    await host.close()
  })

  it('queues the fourth top-level start with maxConcurrent 3, and runs it when a slot frees', async () => {
    const gates = [gate(), gate(), gate(), gate()]
    const started: Array<number> = []
    const worker = defineAgent({
      name: 'worker',
      description: 'Waits for its gate',
      inputSchema: z.object({ n: z.number() }),
      run: async (ctx) => {
        started.push(ctx.input.n)
        await gates[ctx.input.n]?.opened
        return `done ${ctx.input.n}`
      },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-limits',
        adapter: mockAdapter([]).adapter,
        agents: [worker],
        subagents: { agents: [], limits: { maxConcurrent: 3 } },
      }),
      { threadId: THREAD },
    )

    const runs = [0, 1, 2, 3].map((n) =>
      session.agents.worker.start({ n }, { addResultNote: false }),
    )
    await waitFor(() => expect(started).toEqual([0, 1, 2]))
    const statusOf = (index: number) =>
      session.agentRuns().find((run) => run.runId === runs[index]?.id)?.status
    expect(statusOf(3)).toBe('queued')
    expect([0, 1, 2].map(statusOf)).toEqual(['running', 'running', 'running'])

    gates[0]?.open()
    await expect(runs[0]).resolves.toBe('done 0')
    await waitFor(() => expect(started).toEqual([0, 1, 2, 3]))
    expect(statusOf(3)).toBe('running')

    for (const entry of gates) entry.open()
    await expect(Promise.all(runs)).resolves.toHaveLength(4)
    await host.close()
  })

  /**
   * A session with maxConcurrent 1: the agent `lead` calls the plugin tool
   * `startHelper`, which runs `body` with the `ctx.agents` of the plugin.
   * The model of `lead` answers after `answered` opens.
   */
  async function pluginToolSession(
    body: (agents: AgentActions) => PromiseLike<unknown>,
    answered: Promise<void> = Promise.resolve(),
  ) {
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      run: async () => 'helped',
    })
    const startHelper = toolDefinition({
      name: 'startHelper',
      description: 'Runs the helper',
      inputSchema: z.object({}),
    })
    let tool: ReturnType<typeof startHelper.server> | undefined
    const starter = definePlugin({
      name: 'test/starter',
      setup: (ctx) => {
        tool = startHelper.server(async () => ({ got: await body(ctx.agents) }))
      },
    })
    const model = mockAdapter([
      () => toolCall('startHelper', {}),
      () => text('done'),
    ])
    const lead = defineAgent({
      name: 'lead',
      description: 'Calls the plugin tool',
      run: async (ctx) => {
        const result = await ctx.chat({
          adapter: model.adapter,
          tools: tool ? [tool] : [],
          stream: false,
        })
        await answered
        return result
      },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-limits',
        adapter: mockAdapter([]).adapter,
        agents: [lead, helper],
        plugins: () => [starter],
        subagents: { agents: [], limits: { maxConcurrent: 1 } },
      }),
      { threadId: THREAD },
    )
    return { host, session, helper }
  }

  it('runs a plugin start in a tool call of an agent run as its child, with no parent option, under maxConcurrent 1', async () => {
    const { host, session } = await pluginToolSession((agents) =>
      agents.run('helper'),
    )

    const run = session.agents.lead.start(undefined, { addResultNote: false })
    await expect(run).resolves.toContain('done')
    const helped = session.agentRuns().find((item) => item.agent === 'helper')
    expect(helped).toMatchObject({ status: 'completed', parentRunId: run.id })
    await host.close()
  })

  it('runs a plugin start with parent: null as a top-level run, which waits for a maxConcurrent slot', async () => {
    const answered = gate()
    const { host, session } = await pluginToolSession((agents) => {
      void agents
        .start('helper', undefined, { parent: null, addResultNote: false })
        .then(undefined, () => undefined)
      return Promise.resolve('started')
    }, answered.opened)

    const run = session.agents.lead.start(undefined, { addResultNote: false })
    const helperRun = () =>
      session.agentRuns().find((item) => item.agent === 'helper')
    await waitFor(() => expect(helperRun()?.status).toBe('queued'))
    expect(helperRun()?.parentRunId).toBeUndefined()
    answered.open()
    await expect(run).resolves.toContain('done')
    await waitFor(() => expect(helperRun()?.status).toBe('completed'))
    await host.close()
  })

  it('runs a plugin start with parent: ctx.context.run as a child, so a run that awaits it under maxConcurrent 1 ends', async () => {
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      run: async () => 'helped',
    })
    let pluginAgents: AgentActions | undefined
    const starter = definePlugin({
      name: 'test/starter',
      setup: (ctx) => {
        pluginAgents = ctx.agents
      },
    })
    const lead = defineAgent({
      name: 'lead',
      description: 'Runs the helper through the plugin, as a tool does',
      // `parentRunId` is the run id of `ctx.context.run` in a tool.
      run: async (ctx) =>
        pluginAgents?.run(helper, undefined, {
          parent: { runId: ctx.parentRunId },
        }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-limits',
        adapter: mockAdapter([]).adapter,
        agents: [lead, helper],
        plugins: () => [starter],
        subagents: { agents: [], limits: { maxConcurrent: 1 } },
      }),
      { threadId: THREAD },
    )

    const run = session.agents.lead.start(undefined, { addResultNote: false })
    await expect(run).resolves.toBe('helped')
    const helped = session.agentRuns().find((item) => item.agent === 'helper')
    expect(helped?.parentRunId).toBe(run.id)
    await host.close()
  })

  it('cancels a start that waits for a slot, and ends its queued node', async () => {
    const opened = gate()
    const worker = defineAgent({
      name: 'worker',
      description: 'Waits for the gate',
      run: async () => {
        await opened.opened
        return 'done'
      },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-limits',
        adapter: mockAdapter([]).adapter,
        agents: [worker],
        subagents: { agents: [], limits: { maxConcurrent: 1 } },
      }),
      { threadId: THREAD },
    )

    const first = session.agents.worker.start(undefined, {
      addResultNote: false,
    })
    const second = session.agents.worker.start(undefined, {
      addResultNote: false,
    })
    const statusOf = (id: string) =>
      session.agentRuns().find((run) => run.runId === id)?.status
    await waitFor(() => expect(statusOf(second.id)).toBe('queued'))

    await session.cancel({ operationId: second.id })
    await expect(second).rejects.toThrow('Cancelled before it started.')
    expect(statusOf(second.id)).toBe('cancelled')

    opened.open()
    await expect(first).resolves.toBe('done')
    await host.close()
  })

  /**
   * A host with maxConcurrent 1 that stops while `worker` 0 runs and
   * `worker` 1 waits for a slot. Returns the run that waited.
   */
  async function stopWithQueuedStart(persistence: Durable) {
    const { log } = persistence.stores
    const ran: Array<number> = []
    const worker = defineAgent({
      name: 'worker',
      description: 'Waits until it is stopped, for n 0',
      inputSchema: z.object({ n: z.number() }),
      run: async (ctx) => {
        ran.push(ctx.input.n)
        if (ctx.input.n === 0) await untilAbort(ctx.abortSignal)
        return `done ${ctx.input.n}`
      },
    })
    const harness = defineHarness({
      name: 'test/agent-limits',
      adapter: mockAdapter([]).adapter,
      agents: [worker],
      subagents: { agents: [], limits: { maxConcurrent: 1 } },
    })
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(harness, { threadId: THREAD })
    const first = sessionA.agents.worker.start(
      { n: 0 },
      { addResultNote: false },
    )
    const queued = sessionA.agents.worker.start(
      { n: 1 },
      { addResultNote: false },
    )
    await waitFor(() => expect(ran).toEqual([0]))
    const receipt = await queued.receipt
    expect(receipt.status).toBe('queued')
    void Promise.resolve(queued).catch(() => {})
    await stopHost(log, sessionA, first)
    return { hostA, harness, ran, queued, inputId: receipt.inputId }
  }

  it('runs a start that waited for a slot on the next host, with the same run id', async () => {
    const persistence = durablePersistence()
    const { hostA, harness, ran, queued, inputId } =
      await stopWithQueuedStart(persistence)

    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(harness, { threadId: THREAD })
    await expect(sessionB.settled({ inputId })).resolves.toMatchObject({
      outcome: 'completed',
      operationId: queued.id,
    })
    expect(ran).toEqual([0, 1])
    expect(
      sessionB.agentRuns().find((run) => run.runId === queued.id),
    ).toMatchObject({ status: 'completed', result: 'done 1' })
    await hostA.close().catch(() => {})
    await hostB.close()
  })

  it('settles a cancelled start that waited for a slot aborted on the next host', async () => {
    const persistence = durablePersistence()
    const { hostA, harness, ran, queued, inputId } =
      await stopWithQueuedStart(persistence)
    // The cancel reached the log, and the host stopped before it settled.
    await appendToLog(persistence.stores.log, { threadId: THREAD }, [
      { type: 'harness.input.abort', inputId },
    ])

    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(harness, { threadId: THREAD })
    await expect(sessionB.settled({ inputId })).resolves.toMatchObject({
      outcome: 'aborted',
    })
    expect(ran).toEqual([0])
    expect(
      sessionB.agentRuns().find((run) => run.runId === queued.id)?.status,
    ).toBe('cancelled')
    await hostA.close().catch(() => {})
    await hostB.close()
  })

  it('keeps the maxCalls count of a resumed run after a restart', async () => {
    const persistence = durablePersistence()
    const { log } = persistence.stores
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      run: async () => 'helped',
    })
    let attempt = 0
    const lead = defineAgent({
      name: 'lead',
      description: 'Starts the helper, then waits on its first attempt',
      run: async (ctx) => {
        attempt += 1
        // A new key on the second attempt: a new child, not the one that
        // the first attempt started.
        const options = attempt === 1 ? {} : { key: 'again' }
        const got = await Promise.resolve()
          .then(() => ctx.harness!.agents.run(helper, undefined, options))
          .then(String, (error: unknown) => `refused: ${why(error)}`)
        if (attempt === 1) await untilAbort(ctx.abortSignal)
        return got
      },
    })
    const harness = defineHarness({
      name: 'test/agent-limits',
      adapter: mockAdapter([]).adapter,
      agents: [lead, helper],
      subagents: { agents: [], limits: { maxCalls: 2 } },
    })
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(harness, { threadId: THREAD })
    const running = sessionA.agents.lead.start(undefined, {
      runAgainAfterCrash: true,
      addResultNote: false,
    })
    await waitFor(() =>
      expect(
        sessionA.agentRuns().find((run) => run.agent === 'helper')?.status,
      ).toBe('completed'),
    )
    await stopHost(log, sessionA, running)
    const inputId = await firstAgentInput(log)

    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(harness, { threadId: THREAD })
    await expect(sessionB.settled({ inputId })).resolves.toMatchObject({
      outcome: 'completed',
    })
    const settled = await sessionB.settled({ inputId })
    expect(sessionB.agentResult({ runId: settled?.operationId ?? '' })).toBe(
      'refused: subagent limit reached (maxCalls 2)',
    )
    await hostA.close().catch(() => {})
    await hostB.close()
  })
})

describe('the budget of an agent run', () => {
  it('fails a run over its token budget with code budget, and its parent sees the error', async () => {
    const model = mockAdapter([() => textWithTokens('long answer', 80)])
    const worker = defineAgent({
      name: 'worker',
      description: 'Answers',
      run: (ctx) => ctx.chat({ adapter: model.adapter }),
    })
    const lead = defineAgent({
      name: 'lead',
      description: 'Runs the worker with a budget',
      run: async (ctx) =>
        ctx
          .harness!.agents.run(worker, undefined, { budget: { maxTokens: 50 } })
          .then(
            () => 'finished',
            (error: unknown) =>
              isRecord(error) && typeof error.code === 'string'
                ? error.code
                : why(error),
          ),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-budget',
        adapter: mockAdapter([]).adapter,
        agents: [lead, worker],
      }),
      { threadId: THREAD },
    )

    await expect(session.agents.lead.start()).resolves.toBe('budget')
    const child = session.agentRuns().find((run) => run.agent === 'worker')
    expect(child).toMatchObject({
      status: 'failed',
      budget: { maxTokens: 50 },
      error: { code: 'budget' },
    })
    await host.close()
  })

  it('counts the usage of a child in the budget of its parent, and refuses a child with no budget left', async () => {
    const model = mockAdapter([() => textWithTokens('used it all', 50)])
    const spender = defineAgent({
      name: 'spender',
      description: 'Uses the whole budget',
      run: (ctx) => ctx.chat({ adapter: model.adapter }),
    })
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      run: async () => 'helped',
    })
    const lead = defineAgent({
      name: 'lead',
      description: 'Runs the spender, then the helper',
      run: async (ctx) => {
        await ctx.harness!.agents.run(spender)
        return Promise.resolve()
          .then(() => ctx.harness!.agents.run(helper))
          .then(String, why)
      },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-budget',
        adapter: mockAdapter([]).adapter,
        agents: [lead, spender, helper],
      }),
      { threadId: THREAD },
    )

    const run = session.agents.lead.start(undefined, {
      budget: { maxTokens: 50 },
    })
    await expect(run).resolves.toBe(
      `The agent run ${run.id} has no budget left.`,
    )
    // No helper run started.
    expect(session.agentRuns().map((item) => item.agent)).toEqual([
      'lead',
      'spender',
    ])
    await host.close()
  })
})

describe('the budget of an agent run after a restart', () => {
  it('counts the model use of the attempt before, so maxTokens holds across a restart', async () => {
    const persistence = durablePersistence()
    const { log } = persistence.stores
    const noop = toolDefinition({
      name: 'noop',
      description: 'Does nothing',
      inputSchema: z.object({}),
    }).server(() => Promise.resolve({ ok: true }))
    const worker = (adapter: AnyTextAdapter) =>
      defineAgent({
        name: 'worker',
        description: 'Calls a tool, then answers',
        run: (ctx) => ctx.chat({ adapter, tools: [noop] }),
      })
    const harness = (adapter: AnyTextAdapter) =>
      defineHarness({
        name: 'test/agent-budget',
        adapter: mockAdapter([]).adapter,
        agents: [worker(adapter)],
      })
    // 60 tokens on host A, then 60 more on host B: over the 100 of the run.
    const first = mockAdapter([
      () => withUsage(toolCall('noop', {}), 60),
      untilAborted(),
    ])
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(harness(first.adapter), {
      threadId: THREAD,
    })
    const running = sessionA.agents.worker.start(undefined, {
      runAgainAfterCrash: true,
      addResultNote: false,
      budget: { maxTokens: 100 },
    })
    await waitFor(() => expect(first.calls).toHaveLength(2))
    await stopHost(log, sessionA, running)
    const inputId = await firstAgentInput(log)

    const second = mockAdapter([() => textWithTokens('done', 60)])
    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(harness(second.adapter), {
      threadId: THREAD,
    })
    await expect(sessionB.settled({ inputId })).resolves.toMatchObject({
      outcome: 'failed',
      error: { code: 'budget' },
    })
    await hostA.close().catch(() => {})
    await hostB.close()
  })
})

describe('per-run limits of an agent run', () => {
  it('fails a run past its limits.timeoutMs with code timeout', async () => {
    const worker = defineAgent({
      name: 'worker',
      description: 'Waits until it is stopped',
      run: async (ctx) => {
        await untilAbort(ctx.abortSignal)
        return 'stopped'
      },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-timeout',
        adapter: mockAdapter([]).adapter,
        agents: [worker],
      }),
      { threadId: THREAD },
    )

    const run = session.agents.worker.start(undefined, {
      limits: { timeoutMs: 20 },
      addResultNote: false,
    })
    await expect(run).rejects.toMatchObject({ code: 'timeout' })
    expect(session.agentRuns()[0]).toMatchObject({
      status: 'failed',
      error: { code: 'timeout' },
    })
    await host.close()
  })

  it('keeps the first deadline when another host takes the run over', async () => {
    const persistence = durablePersistence()
    const { log } = persistence.stores
    const worker = defineAgent({
      name: 'worker',
      description: 'Waits until it is stopped',
      run: async (ctx) => {
        await untilAbort(ctx.abortSignal)
        return 'stopped'
      },
    })
    const harness = defineHarness({
      name: 'test/agent-timeout',
      adapter: mockAdapter([]).adapter,
      agents: [worker],
    })
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(harness, { threadId: THREAD })
    const running = sessionA.agents.worker.start(undefined, {
      runAgainAfterCrash: true,
      // Long enough that a slow CI coverage run takes the run over first.
      limits: { timeoutMs: 2_000 },
      addResultNote: false,
    })
    await waitFor(() => expect(sessionA.agentRuns()[0]?.status).toBe('running'))
    await stopHost(log, sessionA, running)
    const inputId = await firstAgentInput(log)

    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(harness, { threadId: THREAD })
    await expect(sessionB.settled({ inputId })).resolves.toMatchObject({
      outcome: 'failed',
      error: { code: 'timeout' },
    })
    // Both attempts applied the input with the deadline of the first.
    const deadlines = (await log.read({ logId: LOG }))
      .map((entry) => entry.record)
      .filter(
        (record) =>
          record.type === 'harness.input.applied' && record.inputId === inputId,
      )
      .map((record) => record.timeoutAt)
    expect(deadlines).toHaveLength(2)
    expect(typeof deadlines[0]).toBe('number')
    expect(deadlines[1]).toBe(deadlines[0])
    await hostA.close().catch(() => {})
    await hostB.close()
  })

  it('calls only the failed model call again on retry, so a tool side effect does not repeat', async () => {
    const sent: Array<string> = []
    const sendEmail = toolDefinition({
      name: 'sendEmail',
      description: 'Sends an email',
      inputSchema: z.object({}),
    }).server(() => {
      sent.push('email')
      return Promise.resolve({ sent: true })
    })
    // The call after the tool result fails once.
    let failed = false
    const model = mockAdapter(
      (options: { messages: Array<{ role: string }> }) => {
        if (!options.messages.some((message) => message.role === 'tool')) {
          return toolCall('sendEmail', {})
        }
        if (failed) return text('Sent.')
        failed = true
        return runError('429 rate limit')
      },
    )
    const mailer = defineAgent({
      name: 'mailer',
      description: 'Sends an email, then answers',
      run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [sendEmail] }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-model-error',
        adapter: mockAdapter([]).adapter,
        agents: [mailer],
      }),
      { threadId: THREAD },
    )
    const asked: Array<{ message: string; retries: number }> = []

    const run = session.agents.mailer.start(undefined, {
      addResultNote: false,
      onModelError: ({ error, retries }) => {
        asked.push({ message: error.message, retries })
        return 'retry'
      },
    })

    await expect(run).resolves.toContain('Sent.')
    expect(sent).toEqual(['email'])
    expect(model.calls).toHaveLength(3)
    expect(asked).toEqual([{ message: '429 rate limit', retries: 0 }])
    await host.close()
  })

  it('stops a permanent model error after 3 calls, also when onModelError always answers retry', async () => {
    const model = mockAdapter(() => runError('invalid api key'))
    const worker = defineAgent({
      name: 'worker',
      description: 'Calls a model that always fails',
      run: (ctx) => ctx.chat({ adapter: model.adapter }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-model-error',
        adapter: mockAdapter([]).adapter,
        agents: [worker],
      }),
      { threadId: THREAD },
    )
    const onModelError = vi.fn(() => 'retry' as const)

    const run = session.agents.worker.start(undefined, {
      addResultNote: false,
      onModelError,
    })

    await expect(run).rejects.toThrow('invalid api key')
    expect(model.calls).toHaveLength(3)
    expect(onModelError).toHaveBeenCalledTimes(3)
    await host.close()
  })

  it('warns once when another host takes over a run with onModelError', async () => {
    const persistence = durablePersistence()
    const { log } = persistence.stores
    let attempt = 0
    const worker = defineAgent({
      name: 'worker',
      description: 'Waits on its first attempt',
      run: async (ctx) => {
        attempt += 1
        if (attempt === 1) await untilAbort(ctx.abortSignal)
        return 'done'
      },
    })
    const harness = defineHarness({
      name: 'test/agent-model-error',
      adapter: mockAdapter([]).adapter,
      agents: [worker],
    })
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(harness, { threadId: THREAD })
    const running = sessionA.agents.worker.start(undefined, {
      runAgainAfterCrash: true,
      addResultNote: false,
      onModelError: () => 'retry',
    })
    await waitFor(() => expect(sessionA.agentRuns()[0]?.status).toBe('running'))
    await stopHost(log, sessionA, running)
    const inputId = await firstAgentInput(log)

    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(harness, { threadId: THREAD })
    await expect(sessionB.settled({ inputId })).resolves.toMatchObject({
      outcome: 'completed',
    })
    const warnings = (await log.read({ logId: LOG }))
      .map(({ record }) => record.event)
      .filter(
        (event) =>
          isRecord(event) &&
          event.name === 'harness.plugin.warning' &&
          isRecord(event.value) &&
          event.value.plugin === 'harness:agents' &&
          String(event.value.message).includes('onModelError'),
      )
    expect(warnings).toHaveLength(1)
    await hostA.close().catch(() => {})
    await hostB.close()
  })

  it('retries with onModelError as data, only a transient error by default', async () => {
    /** A worker whose model fails first with `message`, then answers. */
    const failsOnce = (message: string) => {
      let calls = 0
      const model = mockAdapter(() => {
        calls += 1
        return calls === 1 ? runError(message) : text('done')
      })
      const agent = defineAgent({
        name: 'worker',
        description: 'Calls a model that fails once',
        run: (ctx) => ctx.chat({ adapter: model.adapter }),
      })
      return { agent, model }
    }
    const open = async (agent: ReturnType<typeof failsOnce>['agent']) => {
      const host = createHarnessHost({ persistence: memoryPersistence() })
      const session = await host.open(
        defineHarness({
          name: 'test/agent-model-error',
          adapter: mockAdapter([]).adapter,
          agents: [agent],
        }),
        { threadId: THREAD },
      )
      return { host, session }
    }

    const busy = failsOnce('503 overloaded')
    const first = await open(busy.agent)
    await expect(
      first.session.agents.worker.start(undefined, {
        addResultNote: false,
        onModelError: { retries: 1 },
      }),
    ).resolves.toContain('done')
    expect(busy.model.calls).toHaveLength(2)
    await first.host.close()

    const denied = failsOnce('invalid api key')
    const second = await open(denied.agent)
    await expect(
      second.session.agents.worker.start(undefined, {
        addResultNote: false,
        onModelError: { retries: 2 },
      }),
    ).rejects.toThrow('invalid api key')
    expect(denied.model.calls).toHaveLength(1)
    await second.host.close()

    const retried = failsOnce('invalid api key')
    const third = await open(retried.agent)
    await expect(
      third.session.agents.worker.start(undefined, {
        addResultNote: false,
        onModelError: { retries: 1, transientOnly: false },
      }),
    ).resolves.toContain('done')
    expect(retried.model.calls).toHaveLength(2)
    await third.host.close()
  })

  it('keeps onModelError as data in the log, so the host that takes over retries too', async () => {
    const persistence = durablePersistence()
    const { log } = persistence.stores
    let calls = 0
    const model = mockAdapter(() => {
      calls += 1
      return calls === 1 ? runError('503 overloaded') : text('done')
    })
    let attempt = 0
    const worker = defineAgent({
      name: 'worker',
      description: 'Waits on its first attempt, then calls a model',
      run: async (ctx) => {
        attempt += 1
        if (attempt === 1) {
          await untilAbort(ctx.abortSignal)
          return 'stopped'
        }
        return ctx.chat({ adapter: model.adapter })
      },
    })
    const harness = defineHarness({
      name: 'test/agent-model-error',
      adapter: mockAdapter([]).adapter,
      agents: [worker],
    })
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(harness, { threadId: THREAD })
    const running = sessionA.agents.worker.start(undefined, {
      runAgainAfterCrash: true,
      addResultNote: false,
      onModelError: { retries: 1 },
    })
    await waitFor(() => expect(sessionA.agentRuns()[0]?.status).toBe('running'))
    await stopHost(log, sessionA, running)
    const inputId = await firstAgentInput(log)

    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(harness, { threadId: THREAD })
    await expect(sessionB.settled({ inputId })).resolves.toMatchObject({
      outcome: 'completed',
    })
    expect(model.calls).toHaveLength(2)
    const warnings = (await log.read({ logId: LOG }))
      .map(({ record }) => record.event)
      .filter(
        (event) =>
          isRecord(event) &&
          event.name === 'harness.plugin.warning' &&
          isRecord(event.value) &&
          String(event.value.message).includes('onModelError'),
      )
    expect(warnings).toEqual([])
    await hostA.close().catch(() => {})
    await hostB.close()
  })
})
