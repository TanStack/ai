import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { gate, messageTexts, mockAdapter, text, toolCall } from './helpers'
import type { AnyTool, SubagentRouterPick } from '@tanstack/ai'
import type {
  AnyAgent,
  HarnessPlugin,
  HarnessRouterContext,
  HarnessRouting,
  HarnessSession,
  HarnessSubagents,
  HarnessTurnOptions,
  Operation,
} from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

/** An agent that answers `answer`, and keeps the messages of each run. */
function textAgent(name: string, answer: string) {
  const runs: Array<Array<string>> = []
  const agent = defineAgent({
    name,
    description: `Answers ${answer}`,
    run: async (ctx) => {
      runs.push(messageTexts({ messages: ctx.messages }))
      return answer
    },
  })
  return { agent, runs }
}

const pricer = defineAgent({
  name: 'pricer',
  description: 'Prices a vendor',
  inputSchema: z.object({ vendor: z.string() }),
  run: async (ctx) => `Price for ${ctx.input.vendor}`,
})

/**
 * A child model that asks approval to remove `a.txt`, then reports. `make`
 * builds a new `cleaner` agent on the same child model, for a plugin that
 * builds its agents in each `setup`.
 */
function cleaner() {
  const execute = vi.fn(async () => ({ removed: true }))
  const remove = toolDefinition({
    name: 'remove',
    description: 'Remove a file',
    needsApproval: true,
    inputSchema: z.object({ path: z.string() }),
  }).server(execute)
  const child = mockAdapter([
    () => toolCall('remove', { path: 'a.txt' }, 'call_c'),
    () => text('Removed a.txt'),
  ])
  const make = () =>
    defineAgent({
      name: 'cleaner',
      description: 'Removes files',
      run: (ctx) => ctx.chat({ adapter: child.adapter, tools: [remove] }),
    })
  return { make, execute }
}

/** A router that answers `picks` in order, and keeps the context of each call. */
function scriptedRouter(...picks: Array<SubagentRouterPick>) {
  const seen: Array<HarnessRouterContext> = []
  const router = (ctx: HarnessRouterContext) => {
    seen.push(ctx)
    return picks[seen.length - 1] ?? 'main'
  }
  return { router, seen }
}

/** A session whose harness has `routing`. `durable` gives the host a log. */
async function openRouting(options: {
  durable?: boolean
  router: HarnessRouting['router']
  strategy?: HarnessRouting['strategy']
  agents?: ReadonlyArray<AnyAgent>
  subagents?: HarnessSubagents<ReadonlyArray<AnyAgent>>
  plugins?: () => ReadonlyArray<HarnessPlugin>
  tools?: ReadonlyArray<AnyTool>
  turn?: HarnessTurnOptions
  replies?: Array<Reply>
}) {
  const { stores } = memoryPersistence()
  const { runs, metadata } = stores
  const persistence = options.durable
    ? { stores: { log: memoryLogStore(), runs, metadata } }
    : { stores }
  const main = mockAdapter(options.replies ?? [])
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/routing',
      adapter: main.adapter,
      agents: options.agents ?? [],
      ...(options.subagents ? { subagents: options.subagents } : {}),
      ...(options.plugins ? { plugins: options.plugins } : {}),
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.turn ? { turn: options.turn } : {}),
      routing: {
        router: options.router,
        ...(options.strategy ? { strategy: options.strategy } : {}),
      },
    }),
    { threadId: THREAD },
  )
  return { host, session, runs, main }
}

async function transcriptTexts(session: HarnessSession) {
  return messageTexts({ messages: await session.transcript() })
}

/** The turn that a receipt names, for a resolve or a steer. */
function turnOf(session: HarnessSession, operationId: string | undefined) {
  const operation = session.operation(operationId ?? '')
  if (!operation) throw new Error(`No operation ${operationId}`)
  return operation
}

/** Approve the first interrupt of `turn`, and wait for the turn that resumes. */
async function approve(
  session: HarnessSession,
  turn: { interrupts?: Array<{ id: string }> },
) {
  const interrupt = turn.interrupts?.[0]
  if (!interrupt) throw new Error('The turn has no interrupt.')
  const receipt = await session.resolve([
    { interruptId: interrupt.id, status: 'resolved', payload: true },
  ])
  return turnOf(session, receipt.operationId)
}

async function errorMessages(operation: Operation<unknown>) {
  const messages: Array<string> = []
  for await (const entry of operation.events({ from: '0' })) {
    if (entry.event.type === EventType.RUN_ERROR) {
      messages.push(entry.event.message)
    }
  }
  return messages
}

describe('routing.router', () => {
  it('runs only the picked root agent, and keeps its answer', async () => {
    const writer = textAgent('writer', 'Draft')
    const seo = textAgent('seo', 'Keywords')
    const { host, session, main } = await openRouting({
      router: () => 'writer',
      agents: [writer.agent, seo.agent],
    })

    const turn = await session.prompt('write it')

    expect(turn.text).toBe('writer:\nDraft')
    expect(main.calls).toHaveLength(0)
    expect(writer.runs).toEqual([['write it']])
    expect(seo.runs).toEqual([])
    expect(await transcriptTexts(session)).toEqual([
      'write it',
      'writer:\nDraft',
    ])
    await host.close()
  })

  it('gives a picked agent the input of { name, input }', async () => {
    const { host, session } = await openRouting({
      router: () => ({ name: 'pricer', input: { vendor: 'acme' } }),
      agents: [pricer],
    })

    expect((await session.prompt('price acme')).text).toBe(
      'pricer:\nPrice for acme',
    )
    await host.close()
  })

  it("runs the main model with its subagent tools on 'main'", async () => {
    const writer = textAgent('writer', 'Draft')
    const checker = textAgent('checker', 'Checked')
    const { host, session, main } = await openRouting({
      router: () => 'main',
      agents: [writer.agent],
      subagents: { agents: [checker.agent] },
      replies: [() => text('Main answer')],
    })

    expect((await session.prompt('hello')).text).toBe('Main answer')
    expect(
      main.calls[0].tools.map((tool: { name: string }) => tool.name),
    ).toContain('checker')
    expect(writer.runs).toEqual([])
    await host.close()
  })

  it("lets subagents.router route a turn that routing gives to 'main'", async () => {
    const writer = textAgent('writer', 'Draft')
    const checker = textAgent('checker', 'Checked')
    const { host, session, main } = await openRouting({
      router: () => 'main',
      agents: [writer.agent],
      subagents: { agents: [checker.agent], router: () => 'checker' },
    })

    expect((await session.prompt('check it')).text).toBe('checker:\nChecked')
    expect(main.calls).toHaveLength(0)
    expect(writer.runs).toEqual([])
    await host.close()
  })

  it('picks session plugin agents and run plugin agents', async () => {
    const writer = textAgent('writer', 'Draft')
    const researcher = textAgent('researcher', 'Facts')
    const seo = textAgent('seo', 'Keywords')
    const { router, seen } = scriptedRouter('researcher', 'seo')
    const { host, session } = await openRouting({
      router,
      agents: [writer.agent],
      plugins: () => [
        definePlugin({
          name: 'test/session-agents',
          setup: () => ({ agents: [researcher.agent] }),
        }),
        definePlugin({
          name: 'test/run-agents',
          lifetime: 'run',
          setup: () => ({ agents: [seo.agent] }),
        }),
      ],
    })

    expect((await session.prompt('research')).text).toBe('researcher:\nFacts')
    expect((await session.prompt('optimize')).text).toBe('seo:\nKeywords')
    expect(seen.map((ctx) => ctx.agents.map((agent) => agent.name))).toEqual([
      ['writer', 'researcher', 'seo'],
      ['writer', 'researcher', 'seo'],
    ])
    await host.close()
  })

  it('cannot pick an agent that is only in subagents', async () => {
    const writer = textAgent('writer', 'Draft')
    const checker = textAgent('checker', 'Checked')
    const helper = textAgent('helper', 'Helped')
    const { router, seen } = scriptedRouter('checker')
    const { host, session } = await openRouting({
      router,
      // In both lists, so it is a root agent once.
      agents: [writer.agent, pricer],
      subagents: { agents: [checker.agent, pricer] },
      plugins: () => [
        definePlugin({
          name: 'test/plugin-subagents',
          setup: () => ({ subagents: [helper.agent] }),
        }),
      ],
    })

    await expect(session.prompt('check it')).rejects.toThrow(
      'Unknown subagent: checker. The router can pick: writer, pricer.',
    )
    expect(seen[0]?.agents.map((agent) => agent.name)).toEqual([
      'writer',
      'pricer',
    ])
    expect(checker.runs).toEqual([])
    await host.close()
  })

  it('gives the router the session, the input as sent, the ids, the adapter, and the history', async () => {
    const writer = textAgent('writer', 'Draft')
    const { router, seen } = scriptedRouter('main', 'writer')
    const { host, session, main } = await openRouting({
      router,
      agents: [writer.agent],
      replies: [() => text('Main 1')],
    })
    const input = [{ type: 'text' as const, content: 'second' }]

    await session.prompt('first')
    const turn = session.prompt(input, { inputId: 'in-2' })
    await turn

    const ctx = seen[1]
    expect(ctx?.session).toBe(session)
    expect(ctx?.input).toEqual([{ type: 'text', content: 'second' }])
    expect(ctx?.operationId).toBe(turn.id)
    expect(ctx?.inputId).toBe('in-2')
    expect(ctx?.adapter).toBe(main.adapter)
    expect(ctx?.abortSignal?.aborted).toBe(false)
    expect(messageTexts(ctx)).toEqual([
      'first',
      'Main 1',
      JSON.stringify([{ type: 'text', content: 'second' }]),
    ])
    await host.close()
  })

  it('hands off to the main model after the agents, with its subagent tools', async () => {
    const writer = textAgent('writer', 'Draft')
    const checker = textAgent('checker', 'Checked')
    const { host, session, main } = await openRouting({
      router: () => 'writer',
      strategy: 'handoff',
      agents: [writer.agent],
      subagents: { agents: [checker.agent] },
      replies: [() => text('Edited draft')],
    })

    const turn = await session.prompt('write it')

    expect(turn.text).toBe('Edited draft')
    expect(main.calls).toHaveLength(1)
    expect(messageTexts(main.calls[0])).toEqual(['write it', 'writer:\nDraft'])
    expect(
      main.calls[0].tools.map((tool: { name: string }) => tool.name),
    ).toContain('checker')
    expect((await transcriptTexts(session)).at(-1)).toBe('Edited draft')
    await host.close()
  })

  it.each([
    { strategy: 'exclusive', text: 'writer:\nDraft 1' },
    { strategy: 'handoff', text: 'Main 1' },
  ] as const)(
    'runs a steer sent during a $strategy routed turn as its own routed turn',
    async ({ strategy, text: firstText }) => {
      const started = gate()
      const release = gate()
      const answers: Array<Array<string>> = []
      const writer = defineAgent({
        name: 'writer',
        description: 'Writes',
        run: async (ctx) => {
          answers.push(messageTexts({ messages: ctx.messages }))
          started.open()
          await release.opened
          return `Draft ${answers.length}`
        },
      })
      const { router, seen } = scriptedRouter('writer', 'writer')
      const { host, session, main } = await openRouting({
        router,
        strategy,
        agents: [writer],
        replies: [() => text('Main 1'), () => text('Main 2')],
      })

      const turn = session.prompt('first')
      await started.opened
      const receipt = await session.steer('second')
      release.open()

      expect((await turn).text).toBe(firstText)
      const settled = await session.settled(receipt.inputId)
      expect(settled.outcome).toBe('completed')
      expect(settled.operationId).not.toBe(turn.id)
      expect(seen.map((ctx) => ctx.input)).toEqual(['first', 'second'])
      expect(answers[1]?.at(-1)).toBe('second')
      // The main model of a handoff does not get the steer in the first turn.
      expect(main.calls.slice(0, 1).flatMap(messageTexts)).not.toContain(
        'second',
      )
      await host.close()
    },
  )

  it('runs no turn hooks on a routed turn', async () => {
    const writer = textAgent('writer', 'Draft')
    const beforeFinish = vi.fn(() => ({
      messages: [{ role: 'user' as const, content: 'one more' }],
    }))
    const onModelError = vi.fn(() => undefined)
    const { router } = scriptedRouter('writer', 'ghost')
    const { host, session } = await openRouting({
      router,
      agents: [writer.agent],
      turn: { beforeFinish, onModelError },
    })

    expect((await session.prompt('write it')).text).toBe('writer:\nDraft')
    await expect(session.prompt('again')).rejects.toThrow(
      'Unknown subagent: ghost',
    )
    expect(writer.runs).toHaveLength(1)
    expect(beforeFinish).not.toHaveBeenCalled()
    expect(onModelError).not.toHaveBeenCalled()
    await host.close()
  })

  it("does not call the router to resolve a main model's interrupt", async () => {
    const writer = textAgent('writer', 'Draft')
    const execute = vi.fn(async () => ({ removed: true }))
    const removeAll = toolDefinition({
      name: 'removeAll',
      description: 'Remove every file',
      needsApproval: true,
    }).server(execute)
    const { router, seen } = scriptedRouter('main')
    const { host, session } = await openRouting({
      router,
      agents: [writer.agent],
      tools: [removeAll],
      replies: [() => toolCall('removeAll', {}, 'call_m'), () => text('Done')],
    })

    const turn = await session.prompt('remove everything')
    const resumed = await approve(session, turn)

    expect(await resumed).toEqual({ text: 'Done' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(seen).toHaveLength(1)
    await host.close()
  })

  it('calls the router for the wake turn of a background agent, with its follow-up text', async () => {
    const indexer = textAgent('indexer', 'Indexed')
    const { router, seen } = scriptedRouter('main')
    const { host, session, main } = await openRouting({
      router,
      agents: [indexer.agent],
      replies: [() => text('Noted')],
    })

    const handle = session.agent('indexer')
    if (!handle) throw new Error('No indexer agent.')
    await handle.start(undefined, { wake: true })
    await vi.waitFor(() => expect(main.calls).toHaveLength(1))
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))

    expect(seen.map((ctx) => ctx.input)).toEqual([
      'Background agent indexer finished: [indexer finished] Indexed',
    ])
    await host.close()
  })

  it('continues a run plugin agent that stopped for an interrupt, in a later turn', async () => {
    const { make, execute } = cleaner()
    const { router, seen } = scriptedRouter('cleaner')
    const { host, session } = await openRouting({
      router,
      plugins: () => [
        definePlugin({
          name: 'test/run-cleaner',
          lifetime: 'run',
          // A new agent object on each mount, with the same name.
          setup: () => ({ agents: [make()] }),
        }),
      ],
    })

    const turn = await session.prompt('clean up')
    expect(turn.interrupts).toHaveLength(1)
    const resumed = await approve(session, turn)

    expect(await resumed).toEqual({ text: 'cleaner:\nRemoved a.txt' })
    expect(execute).toHaveBeenCalledWith({ path: 'a.txt' }, expect.anything())
    expect(seen).toHaveLength(1)
    await host.close()
  })
})

describe.each([
  { host: 'a host without a log', durable: false },
  { host: 'a durable host', durable: true },
])('routing on $host', ({ durable }) => {
  it('holds a run lease while a routed agent runs', async () => {
    const started = gate()
    const release = gate()
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes',
      run: async () => {
        started.open()
        await release.opened
        return 'Done.'
      },
    })
    const { host, session, runs } = await openRouting({
      durable,
      router: () => 'writer',
      agents: [writer],
    })

    const turn = session.prompt('go')
    await started.opened
    expect((await runs.get(turn.id))?.leaseExpiresAt).toBeGreaterThan(
      Date.now(),
    )
    release.open()
    expect((await turn).text).toBe('writer:\nDone.')
    await host.close()
  })

  it.each([{ pick: 'writer' }, { pick: 'main' }])(
    'ends the turn aborted when cancelled while the router runs, and starts nothing for $pick',
    async ({ pick }) => {
      const writer = textAgent('writer', 'Draft')
      const routerStarted = gate()
      const releaseRouter = gate()
      let signal: AbortSignal | undefined
      const { host, session, main } = await openRouting({
        durable,
        router: async ({ abortSignal }) => {
          signal = abortSignal
          routerStarted.open()
          // This router does not stop at the signal. The harness does.
          await releaseRouter.opened
          return pick
        },
        agents: [writer.agent],
        replies: [() => text('Main answer')],
      })

      const turn = session.prompt('go', { inputId: 'in-1' })
      await routerStarted.opened
      await turn.cancel()
      releaseRouter.open()

      await expect(turn).rejects.toThrow('Cancelled')
      expect(turn.status()).toBe('cancelled')
      expect(signal?.aborted).toBe(true)
      expect(writer.runs).toEqual([])
      expect(main.calls).toHaveLength(0)
      expect((await session.settled('in-1')).outcome).toBe('aborted')
      await host.close()
    },
  )

  it('continues the saved plan after resolve, and calls the router once', async () => {
    const { make, execute } = cleaner()
    const { router, seen } = scriptedRouter('cleaner')
    const { host, session, main } = await openRouting({
      durable,
      router,
      agents: [make()],
    })

    const turn = await session.prompt('clean up', { inputId: 'in-1' })
    expect(turn.interrupts).toHaveLength(1)
    expect(execute).not.toHaveBeenCalled()
    expect((await session.settled('in-1')).outcome).toBe('interrupted')
    const resumed = await approve(session, turn)

    expect(await resumed).toEqual({ text: 'cleaner:\nRemoved a.txt' })
    expect(execute).toHaveBeenCalledWith({ path: 'a.txt' }, expect.anything())
    expect(seen).toHaveLength(1)
    expect(main.calls).toHaveLength(0)
    // The thread keeps one answer for the turn, and no rows of the agent.
    expect(await transcriptTexts(session)).toEqual([
      'clean up',
      'cleaner:\nRemoved a.txt',
    ])
    await host.close()
  })

  it.each([
    {
      name: 'the router throws',
      router: () => {
        throw new Error('router broke')
      },
      error: 'router broke',
    },
    {
      name: 'the pick names no root agent',
      router: () => 'ghost',
      error: 'Unknown subagent: ghost. The router can pick: writer, pricer.',
    },
    {
      name: 'a picked agent with inputSchema has no input',
      router: () => 'pricer',
      error:
        'Agent "pricer" needs input. Return { name: \'pricer\', input } from the router.',
    },
    {
      name: 'the input does not match the schema',
      router: () => ({ name: 'pricer', input: { vendor: 1 } }),
      error: 'Input validation failed for agent pricer',
    },
    {
      name: 'the pick is an empty list',
      router: () => [],
      error:
        'subagents.router must return main, a name, a list of names, { names, order }, or { steps }.',
    },
  ] satisfies Array<{
    name: string
    router: HarnessRouting['router']
    error: string
  }>)('fails the turn when $name', async ({ router, error }) => {
    const writer = textAgent('writer', 'Draft')
    const { host, session } = await openRouting({
      durable,
      router,
      agents: [writer.agent, pricer],
    })

    const turn = session.prompt('go', { inputId: 'in-1' })

    await expect(turn).rejects.toThrow(error)
    expect(turn.status()).toBe('failed')
    expect(await errorMessages(turn)).toEqual([expect.stringContaining(error)])
    const settled = await session.settled('in-1')
    expect(settled.outcome).toBe('failed')
    expect(settled.error?.message).toContain(error)
    expect(writer.runs).toEqual([])
    await host.close()
  })
})
