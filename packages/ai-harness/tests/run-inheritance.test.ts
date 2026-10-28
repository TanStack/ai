import { describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import {
  after,
  gate,
  mockAdapter,
  storedThreadState,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { Reply } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { AnyHarness, AgentRunInfo, HarnessPersistence } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't'

/** An agent whose one model call waits until its run is aborted. */
function hanging(name: string) {
  const { adapter } = mockAdapter(untilAborted())
  return defineAgent({
    name,
    description: `The ${name} agent`,
    run: (ctx) => ctx.chat({ adapter }),
  })
}

/** An agent whose one model call answers `answer` once `until` resolves. */
function gated(name: string, until: Promise<void>, answer = `${name} done`) {
  const { adapter } = mockAdapter(after(until, answer))
  return defineAgent({
    name,
    description: `The ${name} agent`,
    run: (ctx) => ctx.chat({ adapter }),
  })
}

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

/** A turn plugin that counts its disposes. */
function turnPlugin() {
  const disposed = vi.fn()
  const plugin = definePlugin({
    name: 'test/turn-plugin',
    lifetime: 'turn',
    setup: async (ctx) => {
      await ctx.resources.acquire(
        () => undefined,
        () => disposed(),
      )
    },
  })
  return { plugin, disposed }
}

async function open(
  harness: AnyHarness,
  persistence: HarnessPersistence = memoryPersistence(),
) {
  const host = createHarnessHost({ persistence })
  const session = await host.open(harness, { threadId: THREAD })
  return { host, session }
}

/** The agent run of `agent`, once the session lists it. */
async function runOf(
  session: { agentRuns: () => Array<AgentRunInfo> },
  agent: string,
) {
  let found: AgentRunInfo | undefined
  await waitFor(
    () => {
      found = session.agentRuns().find((run) => run.agent === agent)
      expect(found?.status).toBe('running')
    },
    { timeout: 5000 },
  )
  return found!
}

/** A lead model that starts `agent` in the background, then answers. */
function leadStarting(agent: string, ...replies: Array<Reply>) {
  return mockAdapter([
    () => toolCall(agent, { prompt: 'Go', background: true }, 'call-1'),
    ...(replies.length > 0 ? replies : [() => text('Started.')]),
    () => text('Got it.'),
  ]).adapter
}

describe('turn plugins in the runs a turn starts', () => {
  it('dispose after the turn and its background run settle, not before', async () => {
    const { plugin, disposed } = turnPlugin()
    const done = gate()
    const { host, session } = await open(
      defineHarness({
        name: 'test/run-inheritance',
        adapter: leadStarting('worker'),
        subagents: { agents: [gated('worker', done.opened)] },
        plugins: () => [plugin],
      }),
    )

    await session.send('go')
    const worker = await runOf(session, 'worker')
    // The turn ended, but its background run still uses the plugins.
    expect(disposed).not.toHaveBeenCalled()

    done.open()
    await session.agentRun(worker.operationId)
    await waitFor(() => expect(disposed).toHaveBeenCalled(), {
      timeout: 5000,
    })
    await host.close()
    // The turn the wake started disposes its own plugins.
    expect(disposed).toHaveBeenCalledTimes(2)
  })

  it('dispose once on close while the background run still goes', async () => {
    const { plugin, disposed } = turnPlugin()
    const { host, session } = await open(
      defineHarness({
        name: 'test/run-inheritance',
        adapter: leadStarting('worker'),
        subagents: { agents: [hanging('worker')] },
        plugins: () => [plugin],
      }),
    )

    await session.send('go')
    await runOf(session, 'worker')
    expect(disposed).not.toHaveBeenCalled()

    await session.close()
    await host.close()

    expect(disposed).toHaveBeenCalledTimes(1)
  })
})

/** An agent that starts `child`, then waits until its run is aborted. */
function starting(child: ReturnType<typeof hanging>) {
  return defineAgent({
    name: 'lead',
    description: 'Starts a child, then waits',
    run: (ctx) => {
      // The test reads the end of the child from the session.
      Promise.resolve(ctx.harness!.agents.start(child)).catch(() => {})
      return ctx.chat({ adapter: mockAdapter(untilAborted()).adapter })
    },
  })
}

describe('the signal of a child run', () => {
  it('stops when the turn that started it is cancelled', async () => {
    const { host, session } = await open(
      defineHarness({
        name: 'test/run-inheritance',
        // The turn waits after the start, so the cancel finds it running.
        adapter: leadStarting('worker', untilAborted()),
        subagents: { agents: [hanging('worker')] },
      }),
    )

    const turn = session.send('go')
    const ended = expect(turn).rejects.toThrow()
    const worker = await runOf(session, 'worker')
    const stopped = expect(session.agentRun(worker.operationId)).rejects
    await turn.cancel()
    await ended

    await stopped.toThrow()
    expect(session.agentRun(worker.operationId)?.status()).toBe('cancelled')
    await host.close()
  })

  it('stops when the agent run that started it is cancelled', async () => {
    const child = hanging('child')
    const { host, session } = await open(
      defineHarness({
        name: 'test/run-inheritance',
        adapter: mockAdapter([]).adapter,
        agents: [starting(child), child],
      }),
    )

    const run = session.agent('lead')!.start()
    const ended = expect(run).rejects.toThrow()
    const started = await runOf(session, 'child')
    const stopped = expect(session.agentRun(started.operationId)).rejects
    await run.cancel()
    await ended

    await stopped.toThrow()
    expect(session.agentRun(started.operationId)?.status()).toBe('cancelled')
    await host.close()
  })

  it('fails with code budget when the run that started it uses its budget', async () => {
    const child = hanging('child')
    const model = mockAdapter([() => textWithTokens('long answer', 80)])
    const lead = defineAgent({
      name: 'lead',
      description: 'Starts a child, then uses its budget',
      run: (ctx) => {
        Promise.resolve(ctx.harness!.agents.start(child)).catch(() => {})
        return ctx.chat({ adapter: model.adapter })
      },
    })
    const { host, session } = await open(
      defineHarness({
        name: 'test/run-inheritance',
        adapter: mockAdapter([]).adapter,
        agents: [lead, child],
      }),
    )

    const run = session.agent('lead')!.start(undefined, {
      budget: { maxTokens: 50 },
    })
    await expect(run).rejects.toMatchObject({ code: 'budget' })
    const started = session.agentRuns().find((item) => item.agent === 'child')

    await expect(session.agentRun(started!.operationId)).rejects.toMatchObject({
      code: 'budget',
    })
    await host.close()
  })

  it('goes on when the agent run that started it completes', async () => {
    const done = gate()
    const child = gated('child', done.opened, 'child done')
    const lead = defineAgent({
      name: 'lead',
      description: 'Starts a child, then ends',
      run: async (ctx) => {
        ctx.harness!.agents.start(child)
        return 'lead done'
      },
    })
    const { host, session } = await open(
      defineHarness({
        name: 'test/run-inheritance',
        adapter: mockAdapter([]).adapter,
        agents: [lead, child],
      }),
    )

    expect(await session.agent('lead')!.start()).toBe('lead done')
    const started = await runOf(session, 'child')

    done.open()
    expect(await session.agentRun(started.operationId)).toBe('child done')
    await host.close()
  })

  it('gives the child back on a recoverable close, with no cancelled end in the log', async () => {
    const persistence = memoryPersistence()
    const child = hanging('child')
    const { host, session } = await open(
      defineHarness({
        name: 'test/run-inheritance',
        adapter: mockAdapter([]).adapter,
        agents: [starting(child), child],
      }),
      persistence,
    )

    const run = session.agent('lead')!.start()
    Promise.resolve(run).catch(() => {})
    const started = await runOf(session, 'child')
    await host.close({ recoverable: true })

    // Neither run ended in the log, so the next host runs them again.
    const { tree } = await storedThreadState(persistence.stores.log, {
      threadId: THREAD,
    })
    expect(tree.get(started.operationId)?.status).toBe('running')
    expect(tree.get(run.id)?.status).toBe('running')
  })
})

describe('ctx.harness in a tool-mode child', () => {
  /** A child the lead model calls as a tool. Its code runs `helper`. */
  function starter(seen: Array<string>) {
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      run: async () => 'helped',
    })
    return defineAgent({
      name: 'starter',
      description: 'Runs a helper',
      run: async (ctx) => {
        try {
          const result = await ctx.harness!.agents.run(helper)
          seen.push(String(result))
        } catch (error) {
          seen.push(error instanceof Error ? error.message : String(error))
        }
        return 'started'
      },
    })
  }

  /** A lead model that calls `starter` `times` times, one call at a time. */
  function calling(
    limits: { maxCalls: number },
    seen: Array<string>,
    times = 1,
  ) {
    const calls = Array.from(
      { length: times },
      (_, at) => () => toolCall('starter', { prompt: 'Go' }, `call-${at}`),
    )
    return defineHarness({
      name: 'test/run-inheritance',
      adapter: mockAdapter([...calls, () => text('Done.')]).adapter,
      subagents: { agents: [starter(seen)], limits },
    })
  }

  it('starts a run as a child of the turn', async () => {
    const seen: Array<string> = []
    const { host, session } = await open(calling({ maxCalls: 2 }, seen))

    await session.send('go')

    expect(seen).toEqual(['helped'])
    const helper = session.agentRuns().find((run) => run.agent === 'helper')
    expect(helper?.status).toBe('completed')
    expect(helper?.parentRunId).toBeDefined()
    await host.close()
  })

  it("counts the start against the turn's tree budget", async () => {
    const seen: Array<string> = []
    // The first tool-mode child and its run take two calls of the tree, and
    // the second child the third. Its run is one too many.
    const { host, session } = await open(calling({ maxCalls: 3 }, seen, 2))

    await session.send('go')

    expect(seen).toEqual(['helped', 'subagent limit reached (maxCalls 3)'])
    await host.close()
  })
})
