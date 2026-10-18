import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import { isRecord } from '../src/utils'
import { gate, mockAdapter, text } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { HarnessSession } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })

/** One model call that answers `content` and reports `tokens` tokens. */
function textWithTokens(content: string, tokens: number): Array<StreamChunk> {
  return text(content).map((chunk) =>
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
  await expect(session.append([{ type: 'app.ping' }])).rejects.toThrow()
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
        const missing = await ctx.harness.agents.run('missing').then(
          () => 'ran',
          (error: unknown) => why(error),
        )
        const helped = await ctx.harness.agents.run(helper)
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
      session.agents.worker.start({ n }, { attach: 'none' }),
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

    const first = session.agents.worker.start(undefined, { attach: 'none' })
    const second = session.agents.worker.start(undefined, { attach: 'none' })
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
        const got = await Promise.resolve()
          .then(() => ctx.harness.agents.run(helper))
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
      resume: true,
      attach: 'none',
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
        ctx.harness.agents
          .run(worker, undefined, { budget: { maxTokens: 50 } })
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
        await ctx.harness.agents.run(spender)
        return Promise.resolve()
          .then(() => ctx.harness.agents.run(helper))
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
      attach: 'none',
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
      resume: true,
      limits: { timeoutMs: 400 },
      attach: 'none',
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

  it('runs a failed run again when its live onModelError answers retry', async () => {
    let attempt = 0
    const flaky = defineAgent({
      name: 'flaky',
      description: 'Fails once',
      run: async () => {
        attempt += 1
        if (attempt === 1) throw new Error('model overloaded')
        return 'worked'
      },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-model-error',
        adapter: mockAdapter([]).adapter,
        agents: [flaky],
      }),
      { threadId: THREAD },
    )
    const asked: Array<{ message: string; retries: number }> = []

    const run = session.agents.flaky.start(undefined, {
      attach: 'none',
      onModelError: ({ error, retries }) => {
        asked.push({ message: error.message, retries })
        return 'retry'
      },
    })

    await expect(run).resolves.toBe('worked')
    expect(asked).toEqual([
      { message: expect.stringContaining('model overloaded'), retries: 0 },
    ])
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
      resume: true,
      attach: 'none',
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
})
