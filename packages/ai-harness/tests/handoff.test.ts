import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { defineByokProvider, keyedAdapter } from '@tanstack/ai/byok'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
  logIdOf,
} from '../src'
import {
  applyEvent,
  emptyState,
  messagesFromTranscript,
} from '../src/view/reduce'
import {
  CRASHING_OWNERSHIP,
  gate,
  messageTexts,
  mockAdapter,
  ownershipExpired,
  storedThreadState,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTextAdapter, AnyTool } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type {
  AnyAgent,
  HarnessRouting,
  HarnessSession,
  HarnessSubagents,
  Operation,
  OwnershipOptions,
} from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'
const USER = { id: 'user-1' }

/** A session whose harness routes, with the stores and the main model. */
async function openRouting(options: {
  agents: ReadonlyArray<AnyAgent>
  router?: HarnessRouting['router']
  subagents?: HarnessSubagents<ReadonlyArray<AnyAgent>>
  tools?: ReadonlyArray<AnyTool>
  replies?: Array<Reply>
  adapter?: AnyTextAdapter
  /** `routing.giveModelsHandoffTool`. */
  handoffs?: boolean
  /** `routing.allowHandoffToHuman`. */
  humans?: boolean
  log?: LogStore
  ownership?: OwnershipOptions
}) {
  const { metadata } = memoryPersistence().stores
  const log = options.log ?? memoryLogStore()
  const credentials = memoryCredentialStore()
  const main = mockAdapter(options.replies ?? [])
  const host = createHarnessHost({
    persistence: { stores: { log, metadata } },
    credentials,
    ...(options.ownership ? { ownership: options.ownership } : {}),
  })
  const session = await host.open(
    defineHarness({
      name: 'test/handoff',
      adapter: options.adapter ?? main.adapter,
      systemPrompts: ['You are the main model.'],
      agents: options.agents,
      ...(options.subagents ? { subagents: options.subagents } : {}),
      ...(options.tools ? { tools: options.tools } : {}),
      routing: {
        router: options.router ?? (() => undefined),
        ...(options.handoffs !== undefined
          ? { giveModelsHandoffTool: options.handoffs }
          : {}),
        ...(options.humans ? { allowHandoffToHuman: true } : {}),
      },
    }),
    { threadId: THREAD, user: USER },
  )
  return { host, session, log, main, credentials }
}

/** An agent that answers with its own model, prompt, and tools. */
function modelAgent(
  name: string,
  replies: Array<Reply>,
  tools: ReadonlyArray<AnyTool> = [],
) {
  const model = mockAdapter(replies)
  const agent = defineAgent({
    name,
    description: `The ${name} desk`,
    run: (ctx) =>
      ctx.chat({
        adapter: model.adapter,
        systemPrompts: [`You are ${name}.`],
        tools: [...tools],
      }),
  })
  return { agent, model }
}

/** A tool that does nothing, so a model has a tool of its own. */
function plainTool(name: string) {
  return toolDefinition({
    name,
    description: `The ${name} tool`,
    inputSchema: z.object({}),
  }).server(async () => 'ok')
}

async function handoffRecords(log: LogStore) {
  const entries = await log.read({ logId: logIdOf({ logId: THREAD }) })
  return entries
    .map((entry) => entry.record)
    .filter((record) => record.type === 'harness.handoff')
}

/** The values of the `harness.handoff` events of a finished turn. */
async function handoffEvents(operation: Operation<unknown>) {
  const values: Array<unknown> = []
  for await (const entry of operation.events({ from: '0' })) {
    const { event } = entry
    if (
      event.type === EventType.CUSTOM &&
      event.name === HARNESS_EVENTS.handoff
    )
      values.push(event.value)
  }
  return values
}

/** The view state that the events of a finished turn build. */
async function liveView(operation: Operation<unknown>) {
  let state = emptyState()
  for await (const entry of operation.events({ from: '0' })) {
    state = applyEvent(state, entry)
  }
  return state
}

const toolNames = (call: { tools?: Array<{ name: string }> }) =>
  (call.tools ?? []).map((tool) => tool.name)

async function transcriptTexts(session: HarnessSession) {
  return messageTexts({ messages: await session.transcript() })
}

describe('handoffs', () => {
  it('hands the turn to an agent with the handoff tool, and the agent answers in the same turn', async () => {
    const billing = modelAgent(
      'billing',
      [() => text('Refunded'), () => text('Still billing')],
      [plainTool('refund')],
    )
    const { host, session, log, main } = await openRouting({
      agents: [billing.agent],
      tools: [plainTool('lookup')],
      replies: [
        () =>
          toolCall(
            'handoff',
            { to: 'billing', note: 'Refund for order 42' },
            'call_h',
          ),
      ],
    })

    const turn = session.send('refund please')

    expect((await turn).text).toBe('billing:\nRefunded')
    // The main model stopped after the handoff.
    expect(main.calls).toHaveLength(1)
    expect(toolNames(main.calls[0])).toContain('handoff')
    // The target has its own prompt and tools, not those of the main model.
    const [call] = billing.model.calls
    expect(toolNames(call)).toEqual(['refund', 'handoff'])
    expect(JSON.stringify(call.systemPrompts)).toContain('You are billing.')
    expect(JSON.stringify(call.systemPrompts)).not.toContain(
      'You are the main model.',
    )
    // Its handoff tool goes to the other agents and to the main model. A
    // person needs `routing.allowHandoffToHuman`.
    const tool = call.tools.find(
      (item: { name: string }) => item.name === 'handoff',
    )
    expect(tool.inputSchema.properties.to).toEqual({
      type: 'string',
      enum: ['main'],
    })
    // It reads the transcript that the members see.
    expect(messageTexts(call)).toContain('refund please')

    const handoff = {
      from: null,
      to: 'billing',
      note: 'Refund for order 42',
      runId: turn.id,
      by: 'tool',
    }
    expect(await handoffRecords(log)).toEqual([
      { type: 'harness.handoff', ...handoff },
    ])
    expect(await handoffEvents(turn)).toEqual([handoff])

    // The later turns go to billing.
    expect((await session.send('and now?')).text).toBe(
      'billing:\nStill billing',
    )
    expect(main.calls).toHaveLength(1)
    expect(
      (await storedThreadState(log, { threadId: THREAD })).activeAgent,
    ).toBe('billing')
    await host.close()
  })

  it('names the agent on its messages, live and in the transcript', async () => {
    const billing = modelAgent('billing', [() => text('Refunded')])
    const { host, session } = await openRouting({
      agents: [billing.agent],
      replies: [
        () => [
          ...text('Let me get billing.'),
          ...toolCall('handoff', { to: 'billing' }, 'call_h'),
        ],
      ],
    })

    const turn = session.send('refund please')
    await turn

    const saved = messagesFromTranscript(await session.transcript())
    expect(
      saved.map((message) =>
        message.role === 'assistant' ? (message.agent ?? 'main') : message.role,
      ),
    ).toEqual(['user', 'main', 'billing'])

    const live = (await liveView(turn)).messages
    expect(
      live.map((message) =>
        message.role === 'assistant' ? (message.agent ?? 'main') : message.role,
      ),
    ).toEqual(['main', 'billing'])
    await host.close()
  })

  it('moves the turn from a routed agent to another one with ctx.harness.handoff', async () => {
    const triage = defineAgent({
      name: 'triage',
      description: 'Sorts requests',
      run: async (ctx) => {
        await ctx.harness!.handoff({ to: 'billing', note: 'A refund' })
        return 'Passing you to billing.'
      },
    })
    const billing = modelAgent('billing', [() => text('Refunded')])
    const { host, session, log, main } = await openRouting({
      agents: [triage, billing.agent],
      router: () => 'triage',
    })

    const turn = session.send('refund please')

    // The turn text is the answer of the target.
    expect((await turn).text).toBe('billing:\nRefunded')
    expect(main.calls).toHaveLength(0)
    // Each routed pass keeps its answer as its own message. A note of each
    // handoff goes before the answer of its target.
    expect(await transcriptTexts(session)).toEqual([
      'refund please',
      'null',
      'Handed off to triage. triage answers next.',
      'triage:\nPassing you to billing.',
      'null',
      'Handed off to billing. billing answers next.',
      'billing:\nRefunded',
    ])
    expect(
      messagesFromTranscript(await session.transcript()).map((message) =>
        message.role === 'assistant' ? message.agent : message.role,
      ),
    ).toEqual(['user', undefined, 'triage', 'triage', 'billing'])
    expect(
      (await handoffRecords(log)).map(({ from, to, by }) => ({ from, to, by })),
    ).toEqual([
      { from: null, to: 'triage', by: 'router' },
      { from: 'triage', to: 'billing', by: 'code' },
    ])
    expect(
      (await storedThreadState(log, { threadId: THREAD })).activeAgent,
    ).toBe('billing')
    await host.close()
  })

  it('refuses a handoff to an agent that is only a subagent, and the source answers', async () => {
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      run: async () => 'Helped',
    })
    const billing = modelAgent('billing', [])
    const { host, session, log, main } = await openRouting({
      agents: [billing.agent],
      subagents: { agents: [helper] },
      replies: [
        () => toolCall('handoff', { to: 'helper' }, 'call_h'),
        () => text('I will help you myself.'),
      ],
    })

    expect((await session.send('help')).text).toBe('I will help you myself.')
    // The tool lists only the root agents, so the call fails its check.
    expect(JSON.stringify(main.calls[1].messages)).toContain(
      'Input validation failed for tool handoff',
    )
    expect(billing.model.calls).toHaveLength(0)
    expect(await handoffRecords(log)).toEqual([])
    await host.close()
  })

  it('throws a clear error for a code handoff to a subagent, and the source answers', async () => {
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      run: async () => 'Helped',
    })
    const triage = defineAgent({
      name: 'triage',
      description: 'Sorts requests',
      run: async (ctx) =>
        ctx.harness!.handoff({ to: 'helper' }).then(
          () => 'moved',
          (error: unknown) => `I stay. ${String(error)}`,
        ),
    })
    const { host, session, log } = await openRouting({
      agents: [triage],
      subagents: { agents: [helper] },
      router: () => 'triage',
    })

    expect((await session.send('help')).text).toBe(
      `triage:\nI stay. Error: Agent "helper" is only a subagent. A handoff goes to a root agent (triage, 'main').`,
    )
    expect(
      (await handoffRecords(log)).map(({ from, to, by }) => ({ from, to, by })),
    ).toEqual([{ from: null, to: 'triage', by: 'router' }])
    await host.close()
  })

  it('does not let a tool-mode subagent hand off', async () => {
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      run: async (ctx) =>
        ctx.harness!.handoff({ to: 'billing' }).then(
          () => 'moved',
          (error: unknown) => String(error),
        ),
    })
    const billing = modelAgent('billing', [])
    const { host, session, log, main } = await openRouting({
      agents: [billing.agent],
      subagents: { agents: [helper] },
      replies: [() => toolCall('helper', {}, 'call_a'), () => text('Done')],
    })

    expect((await session.send('help')).text).toBe('Done')
    expect(JSON.stringify(main.calls[1].messages)).toContain(
      'ctx.harness.handoff needs a root agent',
    )
    expect(billing.model.calls).toHaveLength(0)
    expect(await handoffRecords(log)).toEqual([])
    await host.close()
  })

  it('fails the turn when an app tool is named handoff', async () => {
    const billing = modelAgent('billing', [])
    const { host, session } = await openRouting({
      agents: [billing.agent],
      tools: [plainTool('handoff')],
      replies: [() => text('never')],
    })

    await expect(session.send('hi')).rejects.toThrow(
      'Duplicate tool "handoff": first owner routing (the handoff tool), second owner the harness.',
    )
    await host.close()
  })

  it('gives no handoff tool with routing.giveModelsHandoffTool false, so an app tool can be named handoff', async () => {
    const billing = modelAgent('billing', [() => text('Billed')])
    const { host, session, main } = await openRouting({
      agents: [billing.agent],
      tools: [plainTool('handoff')],
      handoffs: false,
      router: ({ input }) => (input === 'bill me' ? 'billing' : undefined),
      replies: [() => text('Main')],
    })

    expect((await session.send('hi')).text).toBe('Main')
    // Only the app tool, once.
    expect(toolNames(main.calls[0])).toEqual(['handoff'])
    expect((await session.send('bill me')).text).toBe('billing:\nBilled')
    expect(toolNames(billing.model.calls[0])).toEqual([])
    await host.close()
  })

  it('runs the target in the resolve turn when the part that handed off also waits for a client tool', async () => {
    // No server implementation: the turn waits for the result of the client.
    const openScreen = toolDefinition({
      name: 'openScreen',
      description: 'Open a screen',
      inputSchema: z.object({}),
    })
    const billing = modelAgent('billing', [() => text('Billing here.')])
    const { host, session, main, log } = await openRouting({
      agents: [billing.agent],
      tools: [openScreen],
      replies: [
        () => [
          ...toolCall('handoff', { to: 'billing' }, 'call_h').slice(0, -1),
          ...toolCall('openScreen', {}, 'call_o').slice(1),
        ],
        () => text('One moment.'),
      ],
    })

    const [interrupt] = (await session.send('refund please')).interrupts ?? []
    if (!interrupt) throw new Error('No client tool interrupt.')
    await session.resolve({
      resume: [{ interruptId: interrupt.id, status: 'resolved', payload: {} }],
      inputId: 'opened',
    })

    expect(await session.settled({ inputId: 'opened' })).toMatchObject({
      outcome: 'completed',
    })
    // The main model handed off: it does not answer again.
    expect(main.calls).toHaveLength(1)
    expect(billing.model.calls).toHaveLength(1)
    expect(JSON.stringify(await session.transcript())).not.toContain(
      'One moment.',
    )
    expect((await transcriptTexts(session)).at(-1)).toBe(
      'billing:\nBilling here.',
    )
    expect(
      (await storedThreadState(log, { threadId: THREAD })).activeAgent,
    ).toBe('billing')
    await host.close()
  })

  it('stops only the agent that handed off, not a sibling of a parallel pick', async () => {
    const handedOff = gate()
    // shipping's tool ends only after billing handed off, so shipping is
    // between a tool result and its answer then.
    const track = toolDefinition({
      name: 'track',
      description: 'Track a parcel',
      inputSchema: z.object({}),
    }).server(async () => {
      await handedOff.opened
      return 'on the way'
    })
    const billing = modelAgent('billing', [
      () => toolCall('handoff', { to: 'main' }, 'call_h'),
    ])
    const shipping = modelAgent(
      'shipping',
      [() => toolCall('track', {}, 'call_t'), () => text('Shipped')],
      [track],
    )
    const { host, session, main } = await openRouting({
      agents: [billing.agent, shipping.agent],
      router: () => ({ names: ['billing', 'shipping'], order: 'parallel' }),
      replies: [() => text('Main here.')],
    })

    const turn = session.send('refund and track')
    for await (const { event } of turn.events({ from: '0' })) {
      if (
        event.type === EventType.CUSTOM &&
        event.name === HARNESS_EVENTS.handoff &&
        (event.value as { by?: string }).by === 'tool'
      ) {
        handedOff.open()
        break
      }
    }
    await turn

    expect(shipping.model.calls).toHaveLength(2)
    expect(JSON.stringify(await session.transcript())).toContain('Shipped')
    expect(main.calls).toHaveLength(1)
    await host.close()
  })

  it('puts a handoff call and its result in the transcript for a router and a code handoff', async () => {
    const triage = defineAgent({
      name: 'triage',
      description: 'Sorts requests',
      run: async (ctx) => {
        await ctx.harness!.handoff({ to: 'billing', note: 'A refund' })
        return 'Passing you to billing.'
      },
    })
    const billing = modelAgent('billing', [() => text('Refunded')])
    const { host, session } = await openRouting({
      agents: [triage, billing.agent],
      router: () => 'triage',
    })

    const inputId = 'in-refund'
    await session.send('refund please', { inputId })

    const call = (n: number, from: string | undefined, args: object) => {
      const id = `handoff_${inputId}_${n}`
      const metadata = {
        harness: {
          ...(from ? { agent: from } : {}),
          handoff: { by: from ? 'code' : 'router' },
        },
      }
      return [
        {
          id,
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id,
              type: 'function',
              function: { name: 'handoff', arguments: JSON.stringify(args) },
            },
          ],
          metadata,
        },
        {
          id: `${id}_result`,
          role: 'tool',
          toolCallId: id,
          content: `Handed off to ${(args as { to: string }).to}. ${(args as { to: string }).to} answers next.`,
          metadata,
        },
      ]
    }
    const notes = (await session.transcript()).filter((message) =>
      message.id?.startsWith('handoff_'),
    )
    expect(notes).toEqual([
      ...call(1, undefined, { to: 'triage' }),
      ...call(2, 'triage', { to: 'billing', note: 'A refund' }),
    ])
    // The target gets the note of its handoff last.
    expect(billing.model.calls[0].messages.slice(-2)).toMatchObject([
      { role: 'assistant', toolCalls: [{ id: `handoff_${inputId}_2` }] },
      { role: 'tool', toolCallId: `handoff_${inputId}_2` },
    ])
    await host.close()
  })

  it('saves the note of a code handoff to a person', async () => {
    const triage = defineAgent({
      name: 'triage',
      description: 'Sorts requests',
      run: async (ctx) => {
        await ctx.harness!.handoff({ to: { human: true } })
        return 'A person will help you.'
      },
    })
    const { host, session } = await openRouting({
      agents: [triage],
      router: () => 'triage',
      humans: true,
    })

    await session.send('a person please')

    expect((await transcriptTexts(session)).slice(-2)).toEqual([
      'null',
      'Handed off to a person. The session waits for an operator.',
    ])
    await host.close()
  })

  it('writes a plain note with routing.giveModelsHandoffTool false', async () => {
    const billing = modelAgent('billing', [() => text('Billed')])
    const { host, session } = await openRouting({
      agents: [billing.agent],
      handoffs: false,
      router: () => 'billing',
    })

    await session.send('bill me')

    const note = {
      role: 'assistant',
      content: 'Handed off to billing. billing answers next.',
    }
    expect(billing.model.calls[0].messages.at(-1)).toMatchObject(note)
    expect(
      (await session.transcript()).filter((message) =>
        message.id?.startsWith('handoff_'),
      ),
    ).toMatchObject([note])
    await host.close()
  })

  it('keeps each handoff note once when the next host runs the turn again', async () => {
    const log = memoryLogStore()
    const triage = defineAgent({
      name: 'triage',
      description: 'Sorts requests',
      run: async (ctx) => {
        await ctx.harness!.handoff({ to: 'billing' })
        return 'Passing you to billing.'
      },
    })
    // The first host stops while billing answers.
    const stopped = modelAgent('billing', [untilAborted()])
    const first = await openRouting({
      agents: [triage, stopped.agent],
      router: () => 'triage',
      log,
      ownership: CRASHING_OWNERSHIP,
    })
    void Promise.resolve(
      first.session.send('refund please', { inputId: 'in-1' }),
    ).catch(() => {})
    await vi.waitFor(() => expect(stopped.model.calls).toHaveLength(1), {
      timeout: 5_000,
    })
    await ownershipExpired()

    const billing = modelAgent('billing', [() => text('Refunded')])
    const next = await openRouting({
      agents: [triage, billing.agent],
      router: () => 'triage',
      log,
    })
    expect(await next.session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
    })
    const ids = (await next.session.transcript())
      .map((message) => message.id ?? '')
      .filter((id) => id.startsWith('handoff_'))
    console.log(
      JSON.stringify(
        (await next.session.transcript()).map((m) => [m.id, m.role, m.content]),
      ),
    )
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    // A new host reads the same transcript.
    await next.host.close()
    const reader = await openRouting({ agents: [triage], log })
    expect(
      (await reader.session.transcript())
        .map((message) => message.id ?? '')
        .filter((id) => id.startsWith('handoff_')),
    ).toEqual(ids)
    await first.host.close().catch(() => {})
    await reader.host.close()
  })

  it('runs the target with the keys of the user who sent the turn', async () => {
    const acme = defineByokProvider({ id: 'acme', label: 'Acme' })
    const keys: Array<string> = []
    const keyedModel = mockAdapter([() => text('Refunded')])
    const keyed = keyedAdapter(acme, (key) => {
      keys.push(key)
      return keyedModel.adapter
    })
    const billing = defineAgent({
      name: 'billing',
      description: 'Billing',
      run: async (ctx) =>
        ctx.chat({ adapter: await ctx.keys.adapter(keyed), stream: false }),
    })
    const { host, session, credentials } = await openRouting({
      agents: [billing],
      replies: [() => toolCall('handoff', { to: 'billing' }, 'call_h')],
    })
    await credentials.set({
      scope: { threadId: THREAD, userId: USER.id },
      id: 'acme',
      credential: { type: 'api_key', value: 'sk-user-1' },
    })

    expect((await session.send('refund')).text).toBe('billing:\nRefunded')
    expect(keys).toEqual(['sk-user-1'])
    await host.close()
  })
})
